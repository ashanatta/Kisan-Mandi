from decimal import Decimal

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MinValueValidator
from django.db import models


class Business(models.Model):
    """A farm venture tracked separately, e.g. 'Wheat Crop 2026' or 'Dairy Farm'."""

    class BusinessType(models.TextChoices):
        CROP = 'crop', 'Crop'
        DAIRY = 'dairy', 'Dairy'
        POULTRY = 'poultry', 'Poultry'
        LIVESTOCK = 'livestock', 'Livestock / Fattening'
        ORCHARD = 'orchard', 'Orchard / Fruit'
        VEGETABLE = 'vegetable', 'Vegetables'
        FISHERY = 'fishery', 'Fish Farming'
        OTHER = 'other', 'Other'

    class Season(models.TextChoices):
        RABI = 'rabi', 'Rabi (Nov – Apr)'
        KHARIF = 'kharif', 'Kharif (May – Oct)'
        YEAR_ROUND = 'year_round', 'Year-round'

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='businesses'
    )
    name = models.CharField(max_length=150)
    business_type = models.CharField(max_length=10, choices=BusinessType.choices, default=BusinessType.CROP)
    season = models.CharField(max_length=10, choices=Season.choices, default=Season.YEAR_ROUND)
    description = models.TextField(blank=True)
    area_acres = models.DecimalField(
        'Area (acres)', max_digits=8, decimal_places=2, null=True, blank=True,
        validators=[MinValueValidator(Decimal('0'))],
    )
    start_date = models.DateField()
    end_date = models.DateField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural = 'businesses'
        ordering = ['-is_active', '-start_date']
        constraints = [
            models.UniqueConstraint(fields=['owner', 'name'], name='unique_business_name_per_owner'),
        ]

    def clean(self):
        if self.end_date and self.start_date and self.end_date < self.start_date:
            raise ValidationError({'end_date': 'End date cannot be before start date.'})

    def __str__(self):
        return self.name


class Expense(models.Model):
    class Category(models.TextChoices):
        SEED = 'seed', 'Seed'
        FERTILIZER = 'fertilizer', 'Fertilizer'
        SPRAY = 'spray', 'Spray / Pesticide'
        LABOR = 'labor', 'Labor'
        FUEL = 'fuel', 'Diesel / Fuel'
        ELECTRICITY = 'electricity', 'Electricity'
        IRRIGATION = 'irrigation', 'Water / Irrigation'
        FEED = 'feed', 'Animal Feed'
        VET = 'vet', 'Vet / Medicine'
        MACHINERY_RENT = 'machinery_rent', 'Machinery Rent'
        TRANSPORT = 'transport', 'Transport'
        OTHER = 'other', 'Other'

    business = models.ForeignKey(Business, on_delete=models.CASCADE, related_name='expenses')
    category = models.CharField(max_length=20, choices=Category.choices)
    amount = models.DecimalField(
        'Amount (PKR)', max_digits=12, decimal_places=2,
        validators=[MinValueValidator(Decimal('0.01'))],
    )
    date = models.DateField()
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-date', '-id']
        indexes = [models.Index(fields=['business', 'date'])]

    def __str__(self):
        return f'{self.get_category_display()} – Rs {self.amount}'


class Income(models.Model):
    class Source(models.TextChoices):
        CROP_SALE = 'crop_sale', 'Crop Sale'
        MILK_SALE = 'milk_sale', 'Milk Sale'
        ANIMAL_SALE = 'animal_sale', 'Animal Sale'
        EGG_SALE = 'egg_sale', 'Egg Sale'
        FRUIT_VEG_SALE = 'fruit_veg_sale', 'Fruit / Vegetable Sale'
        MACHINERY_RENT = 'machinery_rent', 'Machinery Rent Income'
        MARKETPLACE = 'marketplace', 'Marketplace Sale'
        SUBSIDY = 'subsidy', 'Subsidy / Support'
        OTHER = 'other', 'Other'

    business = models.ForeignKey(Business, on_delete=models.CASCADE, related_name='incomes')
    source = models.CharField(max_length=20, choices=Source.choices)
    amount = models.DecimalField(
        'Amount (PKR)', max_digits=12, decimal_places=2,
        validators=[MinValueValidator(Decimal('0.01'))],
    )
    quantity = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    unit = models.CharField(max_length=20, blank=True)
    date = models.DateField()
    notes = models.TextField(blank=True)

    # Set automatically when a linked marketplace order item is delivered.
    order_item = models.OneToOneField(
        'orders.OrderItem', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='tracker_income',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural = 'incomes'
        ordering = ['-date', '-id']
        indexes = [models.Index(fields=['business', 'date'])]

    def __str__(self):
        return f'{self.get_source_display()} – Rs {self.amount}'
