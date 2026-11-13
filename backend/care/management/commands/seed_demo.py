import os
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.utils import timezone

from care.models import Appointment, Availability, HealthRecord, Profile

User = get_user_model()


class Command(BaseCommand):
    help = "Create local-only demo patient, doctor, administrator, and sample data."

    def handle(self, *args, **options):
        password = os.getenv("DEMO_PASSWORD", "CareflowDemo!2026")
        patient = self.user("olivia", "olivia@example.test", "Olivia", "Mitchell", password, Profile.Role.PATIENT)
        doctor = self.user("amelia", "amelia@example.test", "Amelia", "Chen", password, Profile.Role.DOCTOR, "Cardiology")
        self.user("careadmin", "admin@example.test", "Careflow", "Admin", password, Profile.Role.ADMIN, staff=True)

        start = (timezone.now() + timedelta(days=1)).replace(hour=9, minute=0, second=0, microsecond=0)
        Availability.objects.get_or_create(doctor=doctor, starts_at=start, ends_at=start + timedelta(hours=8), defaults={"is_available": True})
        HealthRecord.objects.get_or_create(owner=patient, title="Annual health checkup", defaults={"record_type": "Lab results", "notes": "Demo data"})
        Appointment.objects.get_or_create(
            patient=patient,
            doctor=doctor,
            scheduled_for=start + timedelta(hours=1),
            defaults={"reason": "Routine check-in", "status": Appointment.Status.ACCEPTED},
        )
        self.stdout.write(self.style.SUCCESS("Local demo accounts ready. Do not use these credentials outside local development."))
        self.stdout.write(f"Demo password: {password}")
        self.stdout.write("Patient: olivia | Doctor: amelia | Administrator: careadmin")

    def user(self, username, email, first_name, last_name, password, role, specialty="", staff=False):
        user, created = User.objects.get_or_create(
            username=username,
            defaults={"email": email, "first_name": first_name, "last_name": last_name, "is_staff": staff},
        )
        if created:
            user.set_password(password)
            user.save()
        Profile.objects.update_or_create(
            user=user,
            defaults={"role": role, "specialty": specialty},
        )
        return user
