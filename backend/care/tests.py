from datetime import timedelta

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APITestCase

from .models import Appointment, Availability, HealthcareService, HealthRecord, Profile

User = get_user_model()


class HealthcareApiTests(APITestCase):
    def setUp(self):
        self.patient = User.objects.create_user(username="patient", password="LongEnough!123", first_name="Pat")
        Profile.objects.create(user=self.patient, role=Profile.Role.PATIENT)
        self.other_patient = User.objects.create_user(username="other", password="LongEnough!123")
        Profile.objects.create(user=self.other_patient, role=Profile.Role.PATIENT)
        self.doctor = User.objects.create_user(username="doctor", password="LongEnough!123", first_name="Dee")
        Profile.objects.create(user=self.doctor, role=Profile.Role.DOCTOR, specialty="Family medicine")

    def test_registration_creates_patient_and_token(self):
        response = self.client.post("/api/auth/register/", {
            "username": "newpatient",
            "email": "new@example.test",
            "password": "LongAndUnique!Password927",
            "first_name": "New",
            "last_name": "Patient",
        })
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["user"]["role"], Profile.Role.PATIENT)
        self.assertTrue(response.data["token"])

    def test_patient_cannot_read_another_patients_records(self):
        own = HealthRecord.objects.create(owner=self.patient, title="My record", record_type="Vitals")
        HealthRecord.objects.create(owner=self.other_patient, title="Private record", record_type="Vitals")
        self.client.force_authenticate(self.patient)
        response = self.client.get("/api/health-records/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual([row["id"] for row in response.data], [own.id])

    def test_patient_can_request_a_future_available_appointment(self):
        start = timezone.now() + timedelta(days=2)
        Availability.objects.create(doctor=self.doctor, starts_at=start, ends_at=start + timedelta(hours=1))
        self.client.force_authenticate(self.patient)
        response = self.client.post("/api/appointments/", {
            "doctor": self.doctor.id,
            "scheduled_for": start.isoformat(),
            "reason": "Routine check-in",
        })
        self.assertEqual(response.status_code, 201)
        appointment = Appointment.objects.get(pk=response.data["id"])
        self.assertEqual(appointment.patient, self.patient)

    def test_doctor_only_sees_and_can_accept_assigned_appointments(self):
        start = timezone.now() + timedelta(days=2)
        appointment = Appointment.objects.create(patient=self.patient, doctor=self.doctor, scheduled_for=start)
        Appointment.objects.create(patient=self.other_patient, scheduled_for=start + timedelta(hours=1))
        self.client.force_authenticate(self.doctor)
        listing = self.client.get("/api/appointments/")
        self.assertEqual(listing.status_code, 200)
        self.assertEqual([row["id"] for row in listing.data], [appointment.id])
        response = self.client.patch(f"/api/appointments/{appointment.id}/", {"status": "accepted"})
        self.assertEqual(response.status_code, 200)
        appointment.refresh_from_db()
        self.assertEqual(appointment.status, Appointment.Status.ACCEPTED)

    def test_emergency_chat_reply_does_not_call_ai_service(self):
        self.client.force_authenticate(self.patient)
        response = self.client.post("/api/chat/", {"message": "I have severe chest pain"})
        self.assertEqual(response.status_code, 201)
        self.assertTrue(response.data["emergency"])
        self.assertIn("emergency", response.data["response"].lower())

    def test_patient_cannot_update_appointment_status(self):
        appointment = Appointment.objects.create(
            patient=self.patient,
            doctor=self.doctor,
            scheduled_for=timezone.now() + timedelta(days=1),
        )
        self.client.force_authenticate(self.patient)
        response = self.client.patch(f"/api/appointments/{appointment.id}/", {"status": "accepted"})
        self.assertEqual(response.status_code, 403)

    def test_nearby_services_are_sorted_and_radius_limited(self):
        nearby = HealthcareService.objects.create(
            name="Nearby Clinic",
            service_type="Clinic",
            address="100 Health Way",
            latitude=37.775,
            longitude=-122.419,
        )
        HealthcareService.objects.create(
            name="Distant Clinic",
            service_type="Clinic",
            address="200 Health Way",
            latitude=38.5,
            longitude=-122.419,
        )
        self.client.force_authenticate(self.patient)
        response = self.client.get("/api/services/?lat=37.7749&lng=-122.4194&radius_km=5")
        self.assertEqual(response.status_code, 200)
        self.assertEqual([service["id"] for service in response.data], [nearby.id])
        self.assertLess(response.data[0]["distance_km"], 1)

    def test_patient_can_update_profile_but_cannot_change_professional_role(self):
        self.client.force_authenticate(self.patient)
        response = self.client.patch("/api/profile/", {
            "first_name": "Patricia",
            "specialty": "Administrator",
            "role": "admin",
        })
        self.assertEqual(response.status_code, 400)
        self.patient.refresh_from_db()
        self.assertEqual(self.patient.first_name, "Pat")
        self.assertEqual(self.patient.profile.role, Profile.Role.PATIENT)
        response = self.client.patch("/api/profile/", {"first_name": "Patricia"})
        self.assertEqual(response.status_code, 200)
        self.patient.refresh_from_db()
        self.assertEqual(self.patient.first_name, "Patricia")
