import json
import math
import os
import re
import urllib.error
import urllib.request

from django.contrib.auth import authenticate, get_user_model
from django.db.models import Count
from django.utils import timezone
from rest_framework import generics, permissions, status, viewsets
from rest_framework.authentication import TokenAuthentication
from rest_framework.authtoken.models import Token
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Appointment, Availability, ChatConversation, ChatMessage, HealthcareService, HealthRecord, Profile
from .permissions import IsAdministrator, IsDoctor, IsPatient, has_role
from .serializers import (
    AppointmentSerializer,
    AvailabilitySerializer,
    ChatMessageSerializer,
    CurrentUserSerializer,
    DoctorSerializer,
    HealthcareServiceSerializer,
    HealthRecordSerializer,
    ProfileUpdateSerializer,
    RegisterSerializer,
)

User = get_user_model()
EMERGENCY_PATTERN = re.compile(
    r"\b(chest pain|can't breathe|cannot breathe|difficulty breathing|shortness of breath|"
    r"unconscious|not waking|stroke|face droop|severe bleeding|suicid(?:al|e)|"
    r"overdose|anaphylaxis)\b",
    re.IGNORECASE,
)
EMERGENCY_REPLY = (
    "Your message may describe an emergency warning sign. Please call your local emergency "
    "number or go to the nearest emergency department now. Do not wait for an online response. "
    "I cannot assess or diagnose an emergency."
)
SYSTEM_PROMPT = (
    "You are a general health information assistant, not a clinician. Give clear, cautious, "
    "non-diagnostic health education. Never claim a confirmed diagnosis, recommend prescription "
    "medication, or replace professional medical advice. Encourage the user to consult a qualified "
    "health professional for personal concerns. For severe or potentially urgent symptoms, advise "
    "immediate local emergency care. Ask one relevant follow-up question when helpful. Do not "
    "request identifying information."
)


def call_health_ai(message):
    endpoint = os.getenv("AI_API_URL")
    api_key = os.getenv("AI_API_KEY")
    if not endpoint or not api_key:
        raise RuntimeError("The AI service is not configured. Set AI_API_URL and AI_API_KEY.")
    payload = json.dumps({
        "model": os.getenv("AI_MODEL", "gpt-4o-mini"),
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": message},
        ],
        "temperature": 0.3,
        "max_tokens": 500,
    }).encode("utf-8")
    request = urllib.request.Request(
        endpoint,
        data=payload,
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            data = json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        raise RuntimeError("The AI service is temporarily unavailable. Please try again.") from exc
    try:
        answer = data["choices"][0]["message"]["content"].strip()
    except (KeyError, IndexError, TypeError, AttributeError) as exc:
        raise RuntimeError("The AI service returned an unexpected response.") from exc
    if not answer:
        raise RuntimeError("The AI service returned an empty response.")
    return answer


class RegisterView(APIView):
    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        token, _ = Token.objects.get_or_create(user=user)
        return Response({"token": token.key, "user": CurrentUserSerializer(user).data}, status=status.HTTP_201_CREATED)


class LoginView(APIView):
    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    def post(self, request):
        username = request.data.get("username", "")
        password = request.data.get("password", "")
        if not isinstance(username, str) or not isinstance(password, str) or not username or not password:
            raise ValidationError({"detail": "Username and password are required."})
        user = authenticate(request, username=username, password=password)
        if user is None:
            raise ValidationError({"detail": "Invalid username or password."})
        if not hasattr(user, "profile") and not (user.is_staff or user.is_superuser):
            Profile.objects.create(user=user, role=Profile.Role.PATIENT)
        token, _ = Token.objects.get_or_create(user=user)
        return Response({"token": token.key, "user": CurrentUserSerializer(user).data})


class MeView(APIView):
    def get(self, request):
        if not hasattr(request.user, "profile") and not (request.user.is_staff or request.user.is_superuser):
            Profile.objects.create(user=request.user, role=Profile.Role.PATIENT)
        return Response(CurrentUserSerializer(request.user).data)


class ProfileUpdateView(APIView):
    def patch(self, request):
        serializer = ProfileUpdateSerializer(instance=request.user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(CurrentUserSerializer(user).data)


class DoctorListView(generics.ListAPIView):
    serializer_class = DoctorSerializer
    queryset = User.objects.filter(profile__role=Profile.Role.DOCTOR, is_active=True).select_related("profile").order_by("last_name", "first_name")


class HealthcareServiceListView(generics.ListAPIView):
    serializer_class = HealthcareServiceSerializer
    queryset = HealthcareService.objects.filter(is_active=True)

    def list(self, request, *args, **kwargs):
        lat = request.query_params.get("lat")
        lng = request.query_params.get("lng")
        radius = request.query_params.get("radius_km", "25")
        if (lat is None) != (lng is None):
            raise ValidationError({"location": "Provide both latitude and longitude."})
        try:
            radius_km = float(radius)
        except (TypeError, ValueError):
            raise ValidationError({"radius_km": "Radius must be a number between 1 and 100 km."})
        if not math.isfinite(radius_km) or not 1 <= radius_km <= 100:
            raise ValidationError({"radius_km": "Radius must be between 1 and 100 km."})

        services = list(self.get_queryset())
        if lat is not None:
            try:
                latitude, longitude = float(lat), float(lng)
            except (TypeError, ValueError):
                raise ValidationError({"location": "Latitude and longitude must be valid numbers."})
            if not math.isfinite(latitude) or not -90 <= latitude <= 90 or not math.isfinite(longitude) or not -180 <= longitude <= 180:
                raise ValidationError({"location": "Latitude or longitude is outside the valid range."})
            for service in services:
                lat1, lat2 = math.radians(latitude), math.radians(service.latitude)
                delta_lat = lat2 - lat1
                delta_lng = math.radians(service.longitude - longitude)
                haversine = (
                    math.sin(delta_lat / 2) ** 2
                    + math.cos(lat1) * math.cos(lat2) * math.sin(delta_lng / 2) ** 2
                )
                arc = 2 * math.asin(math.sqrt(min(1.0, max(0.0, haversine))))
                service.distance_km = 6371.0 * arc
            services = [service for service in services if service.distance_km <= radius_km]
            services.sort(key=lambda service: service.distance_km)
        return Response(self.get_serializer(services, many=True).data)


class AppointmentViewSet(viewsets.ModelViewSet):
    serializer_class = AppointmentSerializer

    def get_queryset(self):
        user = self.request.user
        queryset = Appointment.objects.select_related("patient", "patient__profile", "doctor", "doctor__profile")
        if has_role(user, Profile.Role.ADMIN):
            return queryset.all()
        if has_role(user, Profile.Role.DOCTOR):
            return queryset.filter(doctor=user)
        return queryset.filter(patient=user)

    def perform_create(self, serializer):
        if not has_role(self.request.user, Profile.Role.PATIENT):
            raise PermissionDenied("Only patient accounts can request appointments.")
        doctor = serializer.validated_data["doctor"]
        scheduled_for = serializer.validated_data["scheduled_for"]
        if not Availability.objects.filter(
            doctor=doctor,
            starts_at__lte=scheduled_for,
            ends_at__gt=scheduled_for,
            is_available=True,
        ).exists():
            raise ValidationError({"scheduled_for": "The selected doctor is not available at this time."})
        if Appointment.objects.filter(
            doctor=doctor,
            scheduled_for=scheduled_for,
            status__in=[Appointment.Status.PENDING, Appointment.Status.ACCEPTED],
        ).exists():
            raise ValidationError({"scheduled_for": "This appointment time has already been requested."})
        serializer.save(patient=self.request.user, status=Appointment.Status.PENDING)

    def update(self, request, *args, **kwargs):
        if not has_role(request.user, Profile.Role.ADMIN):
            if not has_role(request.user, Profile.Role.DOCTOR):
                raise PermissionDenied("Only the assigned doctor or an administrator can update an appointment.")
            if set(request.data.keys()) - {"status"}:
                raise PermissionDenied("Doctors may only update appointment status.")
            new_status = request.data.get("status")
            if new_status not in [Appointment.Status.ACCEPTED, Appointment.Status.REJECTED]:
                raise ValidationError({"status": "Doctors may accept or reject appointment requests."})
        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        kwargs["partial"] = True
        return self.update(request, *args, **kwargs)


class HealthRecordViewSet(viewsets.ModelViewSet):
    serializer_class = HealthRecordSerializer
    http_method_names = ["get", "post", "head", "options"]

    def get_queryset(self):
        if has_role(self.request.user, Profile.Role.ADMIN):
            return HealthRecord.objects.select_related("owner").all()
        return HealthRecord.objects.filter(owner=self.request.user)

    def perform_create(self, serializer):
        if not has_role(self.request.user, Profile.Role.PATIENT):
            raise PermissionDenied("Only patient accounts can add personal health records.")
        serializer.save(owner=self.request.user)


class AvailabilityViewSet(viewsets.ModelViewSet):
    serializer_class = AvailabilitySerializer

    def get_queryset(self):
        if has_role(self.request.user, Profile.Role.ADMIN):
            return Availability.objects.select_related("doctor").all()
        if has_role(self.request.user, Profile.Role.DOCTOR):
            return Availability.objects.filter(doctor=self.request.user)
        return Availability.objects.filter(is_available=True, starts_at__gt=timezone.now())

    def perform_create(self, serializer):
        if not has_role(self.request.user, Profile.Role.DOCTOR):
            raise PermissionDenied("Only doctors can manage their availability.")
        serializer.save(doctor=self.request.user)

    def perform_update(self, serializer):
        if not has_role(self.request.user, Profile.Role.ADMIN):
            if not has_role(self.request.user, Profile.Role.DOCTOR) or serializer.instance.doctor_id != self.request.user.id:
                raise PermissionDenied("You may only manage your own availability.")
        serializer.save()

    def perform_destroy(self, instance):
        if not has_role(self.request.user, Profile.Role.ADMIN):
            if not has_role(self.request.user, Profile.Role.DOCTOR) or instance.doctor_id != self.request.user.id:
                raise PermissionDenied("You may only manage your own availability.")
        instance.delete()


class ChatView(APIView):
    permission_classes = [IsPatient]

    def get(self, request):
        conversations = ChatConversation.objects.filter(owner=request.user).prefetch_related("messages")
        return Response([
            {
                "id": conversation.id,
                "title": conversation.title,
                "created_at": conversation.created_at,
                "messages": ChatMessageSerializer(conversation.messages.all(), many=True).data,
            }
            for conversation in conversations
        ])

    def post(self, request):
        message = request.data.get("message")
        if not isinstance(message, str) or not message.strip():
            raise ValidationError({"message": "Enter a health question."})
        message = message.strip()
        if len(message) > 2000:
            raise ValidationError({"message": "Keep your message under 2,000 characters."})
        conversation_id = request.data.get("conversation_id")
        if conversation_id:
            try:
                conversation = ChatConversation.objects.get(pk=conversation_id, owner=request.user)
            except (ChatConversation.DoesNotExist, ValueError, TypeError):
                raise ValidationError({"conversation_id": "Conversation not found."})
        else:
            conversation = ChatConversation.objects.create(owner=request.user, title=message[:120])
        emergency = bool(EMERGENCY_PATTERN.search(message))
        if emergency:
            answer = EMERGENCY_REPLY
        else:
            try:
                answer = call_health_ai(message)
            except RuntimeError as exc:
                if not conversation_id:
                    conversation.delete()
                return Response({"detail": str(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        ChatMessage.objects.create(conversation=conversation, role="user", content=message)
        assistant_message = ChatMessage.objects.create(
            conversation=conversation,
            role="assistant",
            content=answer,
            emergency=emergency,
        )
        return Response({
            "conversation_id": conversation.id,
            "response": answer,
            "emergency": emergency,
            "message": ChatMessageSerializer(assistant_message).data,
        }, status=status.HTTP_201_CREATED)


class DashboardView(APIView):
    def get(self, request):
        if has_role(request.user, Profile.Role.ADMIN):
            return Response({
                "patients": Profile.objects.filter(role=Profile.Role.PATIENT).count(),
                "doctors": Profile.objects.filter(role=Profile.Role.DOCTOR).count(),
                "appointments": Appointment.objects.count(),
                "pending_appointments": Appointment.objects.filter(status=Appointment.Status.PENDING).count(),
            })
        if has_role(request.user, Profile.Role.DOCTOR):
            appointments = Appointment.objects.filter(doctor=request.user)
            return Response({
                "total_appointments": appointments.count(),
                "upcoming_appointments": appointments.filter(scheduled_for__gte=timezone.now()).exclude(status__in=[Appointment.Status.REJECTED, Appointment.Status.CANCELLED]).count(),
                "pending_appointments": appointments.filter(status=Appointment.Status.PENDING).count(),
            })
        appointments = Appointment.objects.filter(patient=request.user)
        return Response({
            "total_appointments": appointments.count(),
            "upcoming_appointments": appointments.filter(scheduled_for__gte=timezone.now()).exclude(status__in=[Appointment.Status.REJECTED, Appointment.Status.CANCELLED]).count(),
            "health_records": HealthRecord.objects.filter(owner=request.user).count(),
            "previous_consultations": appointments.filter(status=Appointment.Status.COMPLETED).count(),
        })


class AdminUsersView(generics.ListAPIView):
    serializer_class = CurrentUserSerializer
    permission_classes = [IsAdministrator]
    queryset = User.objects.select_related("profile").order_by("username")

    def get_queryset(self):
        return super().get_queryset().filter(profile__role=self.request.query_params.get("role", Profile.Role.PATIENT))


class AdminActivityView(APIView):
    permission_classes = [IsAdministrator]

    def get(self, request):
        return Response({
            "appointments_by_status": list(Appointment.objects.values("status").annotate(count=Count("id")).order_by("status")),
            "recent_appointments": AppointmentSerializer(Appointment.objects.select_related("patient", "doctor").order_by("-created_at")[:20], many=True).data,
            "recent_users": CurrentUserSerializer(User.objects.select_related("profile").order_by("-date_joined")[:20], many=True).data,
        })
