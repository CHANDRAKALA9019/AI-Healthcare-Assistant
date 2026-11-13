from django.contrib import admin
from django.urls import include, path
from care.views import RegisterView

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/auth/register/", RegisterView.as_view(), name="api-register"),
    path("api/", include("care.urls")),
]
