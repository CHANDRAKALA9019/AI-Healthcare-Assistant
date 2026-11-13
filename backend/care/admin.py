from django.contrib import admin
from .models import Appointment, Availability, ChatConversation, ChatMessage, HealthcareService, HealthRecord, Profile


@admin.register(Profile)
class ProfileAdmin(admin.ModelAdmin):
    list_display = ("user", "role", "specialty", "created_at")
    list_filter = ("role",)
    search_fields = ("user__username", "user__email", "user__first_name", "user__last_name")


@admin.register(Appointment)
class AppointmentAdmin(admin.ModelAdmin):
    list_display = ("id", "patient", "doctor", "scheduled_for", "status")
    list_filter = ("status", "scheduled_for")
    search_fields = ("patient__username", "doctor__username")


admin.site.register([HealthRecord, Availability, ChatConversation, ChatMessage])


@admin.register(HealthcareService)
class HealthcareServiceAdmin(admin.ModelAdmin):
    list_display = ("name", "service_type", "address", "is_active")
    list_filter = ("service_type", "is_active")
    search_fields = ("name", "address")
