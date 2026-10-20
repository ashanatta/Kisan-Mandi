from django.contrib.auth.models import AbstractUser
from django.core.validators import RegexValidator
from django.db import models

# Pakistani mobile number: 03XXXXXXXXX or +923XXXXXXXXX
phone_validator = RegexValidator(
    regex=r'^(\+92|0)3\d{9}$',
    message='Enter a valid Pakistani mobile number, e.g. 03001234567 or +923001234567.',
)


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

    def __str__(self):
        return self.get_full_name() or self.username
