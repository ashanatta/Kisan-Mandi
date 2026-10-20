from django.contrib import admin, messages
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.urls import reverse
from django.utils.html import format_html

from .models import SellerVerification, User


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = ('username', 'email', 'first_name', 'last_name', 'role', 'is_verified', 'phone', 'city', 'is_active')
    list_filter = ('role', 'is_verified', 'is_active', 'is_staff', 'city')
    search_fields = ('username', 'email', 'first_name', 'last_name', 'phone')
    fieldsets = BaseUserAdmin.fieldsets + (
        ('Agri Shop profile', {
            'fields': ('role', 'is_verified', 'phone', 'whatsapp', 'city', 'district', 'address', 'avatar',
                       'preferred_language'),
        }),
    )
    add_fieldsets = BaseUserAdmin.add_fieldsets + (
        ('Agri Shop profile', {'fields': ('email', 'role', 'phone')}),
    )


@admin.register(SellerVerification)
class SellerVerificationAdmin(admin.ModelAdmin):
    list_display = ('user', 'name_on_cnic', 'cnic_number', 'status', 'submitted_at', 'reviewed_by')
    list_filter = ('status',)
    search_fields = ('user__username', 'name_on_cnic', 'cnic_number')
    readonly_fields = ('user', 'cnic_number', 'name_on_cnic', 'front_photo', 'back_photo',
                       'submitted_at', 'reviewed_at', 'reviewed_by', 'status')
    fields = readonly_fields[:5] + ('rejection_reason',) + readonly_fields[5:]
    actions = ['approve', 'reject']

    def _photo(self, obj, side):
        if not getattr(obj, f'cnic_{side}'):
            return '—'
        url = reverse('verification-photo', args=[obj.pk, side])
        return format_html('<a href="{0}" target="_blank"><img src="{0}" style="max-width:360px;border-radius:8px"></a>', url)

    @admin.display(description='CNIC front')
    def front_photo(self, obj):
        return self._photo(obj, 'front')

    @admin.display(description='CNIC back')
    def back_photo(self, obj):
        return self._photo(obj, 'back')

    @admin.action(description='✅ Approve – give the Verified badge')
    def approve(self, request, queryset):
        for verification in queryset:
            verification.approve(request.user)
        self.message_user(request, f'{queryset.count()} seller(s) verified.', messages.SUCCESS)

    @admin.action(description='⛔ Reject (uses the rejection reason field)')
    def reject(self, request, queryset):
        for verification in queryset:
            verification.reject(request.user, verification.rejection_reason or 'CNIC photos were not clear.')
        self.message_user(request, f'{queryset.count()} verification(s) rejected.', messages.WARNING)

    def has_add_permission(self, request):
        return False
