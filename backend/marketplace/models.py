from decimal import Decimal

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.utils.text import slugify


class Category(models.Model):
    """Product category. `kind` decides which extra product fields apply."""

    class Kind(models.TextChoices):
        CROP = 'crop', 'Crops'
        FERTILIZER = 'fertilizer', 'Fertilizers'
        SPRAY = 'spray', 'Sprays / Pesticides'
        SEED = 'seed', 'Seeds'
        EQUIPMENT = 'equipment', 'Farm Equipment & Machinery'
        LIVESTOCK = 'livestock', 'Animals / Livestock'

    name = models.CharField(max_length=100)
    name_ur = models.CharField('Name (Urdu)', max_length=100, blank=True)
    slug = models.SlugField(max_length=120, unique=True, blank=True)
    kind = models.CharField(max_length=20, choices=Kind.choices)
    parent = models.ForeignKey(
        'self', on_delete=models.CASCADE, null=True, blank=True, related_name='children'
    )
    icon = models.CharField(max_length=50, blank=True, help_text='Icon name used by the frontend.')
    is_active = models.BooleanField(default=True)
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        verbose_name_plural = 'categories'
        ordering = ['sort_order', 'name']

    def clean(self):
        if self.parent and self.parent.kind != self.kind:
            raise ValidationError({'kind': 'A sub-category must have the same kind as its parent.'})
        if self.parent_id and self.parent_id == self.pk:
            raise ValidationError({'parent': 'A category cannot be its own parent.'})

    def save(self, *args, **kwargs):
        if not self.slug:
            base = slugify(self.name) or 'category'
            slug, n = base, 1
            while Category.objects.filter(slug=slug).exclude(pk=self.pk).exists():
                n += 1
                slug = f'{base}-{n}'
            self.slug = slug
        super().save(*args, **kwargs)

    def __str__(self):
        return f'{self.parent} › {self.name}' if self.parent else self.name


class Product(models.Model):
    class Unit(models.TextChoices):
        KG = 'kg', 'Kg'
        MAUND = 'maund', 'Maund (40 kg)'
        BAG = 'bag', 'Bag'
        LITER = 'liter', 'Liter'
        PIECE = 'piece', 'Piece'

    class Condition(models.TextChoices):
        NEW = 'new', 'New'
        USED = 'used', 'Used'
        NOT_APPLICABLE = 'na', 'Not applicable'

    class ListingType(models.TextChoices):
        SALE = 'sale', 'For Sale'
        RENT = 'rent', 'For Rent'

    class RentPeriod(models.TextChoices):
        HOUR = 'hour', 'Per Hour'
        DAY = 'day', 'Per Day'
        ACRE = 'acre', 'Per Acre'
        MONTH = 'month', 'Per Month'

    class Status(models.TextChoices):
        PENDING = 'pending', 'Pending Approval'
        APPROVED = 'approved', 'Approved'
        REJECTED = 'rejected', 'Rejected'

    class Gender(models.TextChoices):
        MALE = 'male', 'Male'
        FEMALE = 'female', 'Female'

    seller = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='products'
    )
    category = models.ForeignKey(Category, on_delete=models.PROTECT, related_name='products')

    title = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    price = models.DecimalField(
        'Price (PKR)', max_digits=12, decimal_places=2,
        validators=[MinValueValidator(Decimal('1.00'))],
    )
    quantity = models.DecimalField(
        'Available quantity', max_digits=12, decimal_places=2,
        validators=[MinValueValidator(Decimal('0'))],
    )
    unit = models.CharField(max_length=10, choices=Unit.choices, default=Unit.KG)
    condition = models.CharField(max_length=4, choices=Condition.choices, default=Condition.NOT_APPLICABLE)
    city = models.CharField(max_length=100)
    district = models.CharField(max_length=100)

    # Equipment & machinery
    listing_type = models.CharField(max_length=4, choices=ListingType.choices, default=ListingType.SALE)
    rent_period = models.CharField(max_length=5, choices=RentPeriod.choices, blank=True)
    brand = models.CharField(max_length=100, blank=True)
    model_year = models.PositiveSmallIntegerField(
        null=True, blank=True, validators=[MinValueValidator(1950), MaxValueValidator(2100)]
    )

    # Animals / livestock
    breed = models.CharField(max_length=100, blank=True)
    gender = models.CharField(max_length=6, choices=Gender.choices, blank=True)
    age_months = models.PositiveSmallIntegerField('Age (months)', null=True, blank=True)
    weight_kg = models.DecimalField(
        'Weight (kg)', max_digits=7, decimal_places=2, null=True, blank=True,
        validators=[MinValueValidator(Decimal('0'))],
    )
    milk_liters_per_day = models.DecimalField(
        'Milk production (liters/day)', max_digits=5, decimal_places=2, null=True, blank=True,
        validators=[MinValueValidator(Decimal('0'))],
    )

    # Optional: record delivered sales of this listing as income in a tracker business.
    linked_business = models.ForeignKey(
        'tracker.Business', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='linked_products',
    )

    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    rejection_reason = models.CharField(max_length=255, blank=True)
    is_active = models.BooleanField(default=True, help_text='Seller can hide a listing without deleting it.')
    views_count = models.PositiveIntegerField(default=0)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['status', 'is_active']),
            models.Index(fields=['city']),
            models.Index(fields=['district']),
            models.Index(fields=['price']),
        ]

    def clean(self):
        errors = {}
        kind = self.category.kind if self.category_id else None

        if self.listing_type == self.ListingType.RENT:
            if kind != Category.Kind.EQUIPMENT:
                errors['listing_type'] = 'Only equipment and machinery can be listed for rent.'
            if not self.rent_period:
                errors['rent_period'] = 'Rent period is required for rental listings.'
        elif self.rent_period:
            errors['rent_period'] = 'Rent period only applies to rental listings.'

        if kind != Category.Kind.LIVESTOCK:
            livestock_fields = ['breed', 'gender', 'age_months', 'weight_kg', 'milk_liters_per_day']
            for field in livestock_fields:
                if getattr(self, field) not in (None, ''):
                    errors[field] = 'This field only applies to animals / livestock.'

        if self.linked_business_id and self.linked_business.owner_id != self.seller_id:
            errors['linked_business'] = 'You can only link your own business.'

        if errors:
            raise ValidationError(errors)

    @property
    def is_available(self):
        return self.status == self.Status.APPROVED and self.is_active and self.quantity > 0

    def __str__(self):
        return self.title


class ProductImage(models.Model):
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='images')
    image = models.ImageField(upload_to='products/%Y/%m/')
    is_primary = models.BooleanField(default=False)
    sort_order = models.PositiveSmallIntegerField(default=0)
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-is_primary', 'sort_order', 'id']

    def __str__(self):
        return f'Image of {self.product}'


class SellerReview(models.Model):
    """One review per buyer per seller; the buyer can update it later."""

    seller = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='reviews_received'
    )
    reviewer = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='reviews_given'
    )
    # The delivered order the review is based on ("verified purchase").
    order = models.ForeignKey('orders.Order', on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    rating = models.PositiveSmallIntegerField(validators=[MinValueValidator(1), MaxValueValidator(5)])
    comment = models.TextField(blank=True)
    seller_reply = models.TextField(blank=True)
    replied_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        constraints = [
            models.UniqueConstraint(fields=['seller', 'reviewer'], name='unique_review_per_seller'),
            models.CheckConstraint(
                condition=~models.Q(seller=models.F('reviewer')), name='no_self_review'
            ),
        ]

    def __str__(self):
        return f'{self.reviewer} → {self.seller}: {self.rating}★'


class ListingReport(models.Model):
    """A user flags a listing as suspicious; admins review the queue."""

    class Reason(models.TextChoices):
        FRAUD = 'fraud', 'Fraud / scam'
        FAKE_PHOTOS = 'fake_photos', 'Fake or copied photos'
        WRONG_INFO = 'wrong_info', 'Wrong price or details'
        SOLD = 'sold', 'Already sold'
        PROHIBITED = 'prohibited', 'Banned or illegal item'
        OTHER = 'other', 'Other'

    class Status(models.TextChoices):
        OPEN = 'open', 'Open'
        RESOLVED = 'resolved', 'Action taken'
        DISMISSED = 'dismissed', 'Dismissed'

    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='reports')
    reporter = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='reports_made')
    reason = models.CharField(max_length=15, choices=Reason.choices)
    details = models.TextField(blank=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.OPEN)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        constraints = [
            models.UniqueConstraint(fields=['product', 'reporter'], name='one_report_per_user_per_listing'),
        ]

    REMOVED_REASON = 'Removed after a user report.'

    def apply_status(self):
        """
        Keep the listing in sync with the report:
        "Action taken" hides it; dismissing or reopening restores it, but only if it
        was hidden because of a report and no other report still has action taken.
        """
        product = self.product
        if self.status == self.Status.RESOLVED:
            if product.status != Product.Status.REJECTED:
                product.status, product.rejection_reason = Product.Status.REJECTED, self.REMOVED_REASON
                product.save(update_fields=['status', 'rejection_reason'])
            return
        hidden_by_report = product.status == Product.Status.REJECTED and product.rejection_reason == self.REMOVED_REASON
        other_resolved = product.reports.filter(status=self.Status.RESOLVED).exclude(pk=self.pk).exists()
        if hidden_by_report and not other_resolved:
            product.status, product.rejection_reason = Product.Status.APPROVED, ''
            product.save(update_fields=['status', 'rejection_reason'])

    def set_status(self, status):
        self.status = status
        self.save(update_fields=['status'])
        self.apply_status()

    def __str__(self):
        return f'{self.get_reason_display()} – {self.product}'
