from rest_framework.permissions import BasePermission
from .models import Profile


def has_role(user, *roles):
    if user.is_staff or user.is_superuser:
        return Profile.Role.ADMIN in roles
    try:
        return user.profile.role in roles
    except Profile.DoesNotExist:
        return False


class IsDoctor(BasePermission):
    def has_permission(self, request, view):
        return has_role(request.user, Profile.Role.DOCTOR)


class IsPatient(BasePermission):
    def has_permission(self, request, view):
        return has_role(request.user, Profile.Role.PATIENT)


class IsAdministrator(BasePermission):
    def has_permission(self, request, view):
        return has_role(request.user, Profile.Role.ADMIN)
