from django.urls import include, path
from rest_framework.routers import DefaultRouter
from .views import (
    AdminActivityView,
    AdminUsersView,
    AppointmentViewSet,
    AvailabilityViewSet,
    ChatView,
    DashboardView,
    DoctorListView,
    HealthRecordViewSet,
    HealthcareServiceListView,
    LoginView,
    MeView,
    ProfileUpdateView,
)

router = DefaultRouter()
router.register("appointments", AppointmentViewSet, basename="appointment")
router.register("health-records", HealthRecordViewSet, basename="health-record")
router.register("availability", AvailabilityViewSet, basename="availability")

urlpatterns = [
    path("auth/login/", LoginView.as_view(), name="api-login"),
    path("auth/me/", MeView.as_view(), name="api-me"),
    path("profile/", ProfileUpdateView.as_view(), name="profile"),
    path("doctors/", DoctorListView.as_view(), name="doctors"),
    path("services/", HealthcareServiceListView.as_view(), name="healthcare-services"),
    path("dashboard/", DashboardView.as_view(), name="dashboard"),
    path("chat/", ChatView.as_view(), name="chat"),
    path("admin/users/", AdminUsersView.as_view(), name="admin-users"),
    path("admin/activity/", AdminActivityView.as_view(), name="admin-activity"),
    path("", include(router.urls)),
]
