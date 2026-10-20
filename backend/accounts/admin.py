from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from .models import User


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = ('username', 'email', 'first_name', 'last_name', 'role', 'phone', 'city', 'is_active')
    list_filter = ('role', 'is_active', 'is_staff', 'city')
    search_fields = ('username', 'email', 'first_name', 'last_name', 'phone')
    fieldsets = BaseUserAdmin.fieldsets + (
        ('Agri Shop profile', {
            'fields': ('role', 'phone', 'whatsapp', 'city', 'district', 'address', 'avatar', 'preferred_language'),
        }),
    )
    add_fieldsets = BaseUserAdmin.add_fieldsets + (
        ('Agri Shop profile', {'fields': ('email', 'role', 'phone')}),
    )
