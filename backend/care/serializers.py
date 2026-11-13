from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.utils import timezone
from rest_framework import serializers
from .models import Appointment, Availability, ChatConversation, ChatMessage, HealthcareService, HealthRecord, Profile

User = get_user_model()


class UserSummarySerializer(serializers.ModelSerializer):
    role = serializers.SerializerMethodField()
    specialty = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ["id", "first_name", "last_name", "role", "specialty"]

    def get_role(self, obj):
        return obj.profile.role if hasattr(obj, "profile") else ""

    def get_specialty(self, obj):
        return obj.profile.specialty if hasattr(obj, "profile") else ""


class CurrentUserSerializer(serializers.ModelSerializer):
    role = serializers.SerializerMethodField()
    phone = serializers.SerializerMethodField()
    specialty = serializers.SerializerMethodField()
    bio = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ["id", "username", "email", "first_name", "last_name", "role", "phone", "specialty", "bio"]

    def get_role(self, obj):
        return obj.profile.role if hasattr(obj, "profile") else ("admin" if obj.is_staff else "")

    def get_phone(self, obj):
        return obj.profile.phone if hasattr(obj, "profile") else ""

    def get_specialty(self, obj):
        return obj.profile.specialty if hasattr(obj, "profile") else ""

    def get_bio(self, obj):
        return obj.profile.bio if hasattr(obj, "profile") else ""


class ProfileUpdateSerializer(serializers.Serializer):
    first_name = serializers.CharField(max_length=150, required=False)
    last_name = serializers.CharField(max_length=150, required=False)
    email = serializers.EmailField(required=False)
    phone = serializers.CharField(max_length=32, allow_blank=True, required=False)
    specialty = serializers.CharField(max_length=100, required=False)
    bio = serializers.CharField(max_length=2000, allow_blank=True, required=False)

    def validate_email(self, value):
        if User.objects.filter(email__iexact=value).exclude(pk=self.instance.pk).exists():
            raise serializers.ValidationError("This email is already in use.")
        return value

    def validate(self, attrs):
        try:
            role = self.instance.profile.role
        except Profile.DoesNotExist:
            role = Profile.Role.ADMIN if self.instance.is_staff else Profile.Role.PATIENT
        if role not in [Profile.Role.DOCTOR, Profile.Role.ADMIN] and {"specialty", "bio"} & attrs.keys():
            raise serializers.ValidationError("Professional details can only be updated by doctors or administrators.")
        return attrs

    def update(self, instance, validated_data):
        profile_data = {key: validated_data.pop(key) for key in ["phone", "specialty", "bio"] if key in validated_data}
        for field, value in validated_data.items():
            setattr(instance, field, value)
        if validated_data:
            instance.save(update_fields=list(validated_data))
        if profile_data:
            profile, _ = Profile.objects.get_or_create(
                user=instance,
                defaults={"role": Profile.Role.ADMIN if instance.is_staff else Profile.Role.PATIENT},
            )
            for field, value in profile_data.items():
                setattr(profile, field, value)
            profile.save(update_fields=list(profile_data))
        return instance


class RegisterSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=150)
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, min_length=10, trim_whitespace=False)
    first_name = serializers.CharField(max_length=150)
    last_name = serializers.CharField(max_length=150)

    def validate_username(self, value):
        if User.objects.filter(username__iexact=value).exists():
            raise serializers.ValidationError("This username is already registered.")
        return value

    def validate_email(self, value):
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("This email is already registered.")
        return value

    def validate_password(self, value):
        validate_password(value)
        return value

    def create(self, validated_data):
        user = User.objects.create_user(**validated_data)
        Profile.objects.create(user=user, role=Profile.Role.PATIENT)
        return user


class DoctorSerializer(serializers.ModelSerializer):
    specialty = serializers.CharField(source="profile.specialty", read_only=True)
    bio = serializers.CharField(source="profile.bio", read_only=True)

    class Meta:
        model = User
        fields = ["id", "first_name", "last_name", "specialty", "bio"]


class AppointmentSerializer(serializers.ModelSerializer):
    patient = UserSummarySerializer(read_only=True)
    doctor = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.filter(profile__role=Profile.Role.DOCTOR),
    )
    doctor_name = serializers.SerializerMethodField()
    patient_name = serializers.SerializerMethodField()
    specialty = serializers.SerializerMethodField()

    class Meta:
        model = Appointment
        fields = ["id", "patient", "patient_name", "doctor", "doctor_name", "specialty", "scheduled_for", "reason", "status", "created_at"]
        read_only_fields = ["id", "patient", "created_at"]

    def get_doctor_name(self, obj):
        return obj.doctor.get_full_name() if obj.doctor else "Unassigned"

    def get_patient_name(self, obj):
        return obj.patient.get_full_name() or obj.patient.username

    def get_specialty(self, obj):
        try:
            return obj.doctor.profile.specialty
        except (AttributeError, Profile.DoesNotExist):
            return ""

    def validate_scheduled_for(self, value):
        if value <= timezone.now():
            raise serializers.ValidationError("Choose a date and time in the future.")
        return value


class HealthRecordSerializer(serializers.ModelSerializer):
    class Meta:
        model = HealthRecord
        fields = ["id", "title", "record_type", "notes", "created_at"]
        read_only_fields = ["id", "created_at"]


class AvailabilitySerializer(serializers.ModelSerializer):
    class Meta:
        model = Availability
        fields = ["id", "starts_at", "ends_at", "is_available"]
        read_only_fields = ["id"]

    def validate(self, attrs):
        starts_at = attrs.get("starts_at", getattr(self.instance, "starts_at", None))
        ends_at = attrs.get("ends_at", getattr(self.instance, "ends_at", None))
        if starts_at and ends_at and ends_at <= starts_at:
            raise serializers.ValidationError("End time must be after start time.")
        if starts_at and starts_at <= timezone.now():
            raise serializers.ValidationError({"starts_at": "Availability must be in the future."})
        return attrs


class HealthcareServiceSerializer(serializers.ModelSerializer):
    distance_km = serializers.FloatField(read_only=True, required=False)

    class Meta:
        model = HealthcareService
        fields = ["id", "name", "service_type", "address", "phone", "latitude", "longitude", "distance_km"]


class ChatMessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ChatMessage
        fields = ["id", "role", "content", "emergency", "created_at"]
