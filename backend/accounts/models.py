import uuid
from pathlib import Path

from django.conf import settings
from django.contrib.auth.models import AbstractUser
from django.core.files.storage import FileSystemStorage
from django.core.validators import RegexValidator
from django.db import models

# Pakistani mobile number: 03XXXXXXXXX or +923XXXXXXXXX
phone_validator = RegexValidator(
    regex=r'^(\+92|0)3\d{9}$',
    message='Enter a valid Pakistani mobile number, e.g. 03001234567 or +923001234567.',
)

cnic_validator = RegexValidator(
    regex=r'^\d{5}-\d{7}-\d$',
    message='Enter the CNIC as 12345-1234567-1.',
)


def private_storage():
    """CNIC photos live outside MEDIA_ROOT so they are never publicly served."""
    return FileSystemStorage(location=settings.PRIVATE_MEDIA_ROOT, base_url='/private-not-served/')


def cnic_upload_path(instance, filename):
    # Random names so files can't be guessed
    return f'verification/{instance.user_id}/{uuid.uuid4().hex}{Path(filename).suffix.lower()}'


class User(AbstractUser):
    class Role(models.TextChoices):
        BUYER = 'buyer', 'Buyer'
        SELLER = 'seller', 'Seller / Farmer'
        ADMIN = 'admin', 'Admin'

    class Language(models.TextChoices):
        ENGLISH = 'en', 'English'
        URDU = 'ur', 'Urdu'

    email = models.EmailField(unique=True)
    role = models.CharField(max_length=10, choices=Role.choices, default=Role.BUYER)
    phone = models.CharField(max_length=13, validators=[phone_validator], blank=True)
    whatsapp = models.CharField(max_length=13, validators=[phone_validator], blank=True)
    city = models.CharField(max_length=100, blank=True)
    district = models.CharField(max_length=100, blank=True)
    address = models.TextField(blank=True)
    avatar = models.ImageField(upload_to='avatars/', blank=True, null=True)
    preferred_language = models.CharField(
        max_length=2, choices=Language.choices, default=Language.ENGLISH
    )
    # Set when an admin approves the user's CNIC verification.
    is_verified = models.BooleanField('Verified seller', default=False)

    # Penalties from lost disputes (see accounts.penalties)
    suspended_until = models.DateTimeField(null=True, blank=True)
    is_banned = models.BooleanField(default=False)

    # Where the platform sends this seller's released money
    class PayoutMethod(models.TextChoices):
        JAZZCASH = 'jazzcash', 'JazzCash'
        EASYPAISA = 'easypaisa', 'Easypaisa'
        BANK = 'bank', 'Bank account'

    payout_method = models.CharField(max_length=10, choices=PayoutMethod.choices, blank=True)
    payout_account_title = models.CharField(max_length=150, blank=True)
    payout_account_number = models.CharField(max_length=34, blank=True, help_text='Mobile wallet number or IBAN')

    REQUIRED_FIELDS = ['email']

    def save(self, *args, **kwargs):
        # Django superusers are always platform admins.
        if self.is_superuser:
            self.role = self.Role.ADMIN
        super().save(*args, **kwargs)

    @property
    def is_seller(self):
        return self.role == self.Role.SELLER

    @property
    def is_platform_admin(self):
        return self.role == self.Role.ADMIN or self.is_superuser

    @property
    def is_suspended(self):
        from django.utils import timezone

        return bool(self.suspended_until and self.suspended_until > timezone.now())

    @property
    def can_sell(self):
        """Only CNIC-verified sellers in good standing can list and receive orders."""
        return (self.is_seller or self.is_platform_admin) and self.is_verified and not self.is_banned and not self.is_suspended

    def __str__(self):
        return self.get_full_name() or self.username


class SellerStrike(models.Model):
    """A penalty point, given when a dispute is decided against the seller."""

    seller = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='strikes')
    order = models.ForeignKey('orders.Order', on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    reason = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'Strike: {self.seller} – {self.reason}'


class BannedCNIC(models.Model):
    """A banned person can't get verified again with a new account."""

    cnic_number = models.CharField(max_length=15, unique=True, validators=[cnic_validator])
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    reason = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'banned CNIC'
        verbose_name_plural = 'banned CNICs'

    def __str__(self):
        return self.cnic_number


class SellerVerification(models.Model):
    """CNIC check. Photos are private and only visible to admins."""

    class Status(models.TextChoices):
        PENDING = 'pending', 'Pending review'
        APPROVED = 'approved', 'Approved'
        REJECTED = 'rejected', 'Rejected'

    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='verification')
    cnic_number = models.CharField('CNIC number', max_length=15, validators=[cnic_validator])
    name_on_cnic = models.CharField(max_length=150)
    cnic_front = models.ImageField(upload_to=cnic_upload_path, storage=private_storage, blank=True)
    cnic_back = models.ImageField(upload_to=cnic_upload_path, storage=private_storage, blank=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    rejection_reason = models.CharField(max_length=255, blank=True)
    submitted_at = models.DateTimeField(auto_now_add=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='+'
    )

    class Meta:
        ordering = ['-submitted_at']

    def approve(self, admin_user):
        self._review(self.Status.APPROVED, admin_user, '')

    def reject(self, admin_user, reason):
        self._review(self.Status.REJECTED, admin_user, reason)

    def _review(self, status, admin_user, reason):
        from django.utils import timezone

        self.status, self.rejection_reason = status, reason
        self.reviewed_at, self.reviewed_by = timezone.now(), admin_user
        self.save(update_fields=['status', 'rejection_reason', 'reviewed_at', 'reviewed_by'])
        self.user.is_verified = status == self.Status.APPROVED
        self.user.save(update_fields=['is_verified'])

    @property
    def masked_cnic(self):
        return f'*****-*******-{self.cnic_number[-1]}' if self.cnic_number else ''

    def __str__(self):
        return f'{self.user} – {self.get_status_display()}'
