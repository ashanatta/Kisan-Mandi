"""
Kisan Mandi Protection – the platform holds the buyer's money (escrow) until the
order is completed, refunds it after a cancellation or a lost dispute, and pays
sellers out only for completed orders.
"""
import uuid
from datetime import timedelta
from decimal import Decimal
from pathlib import Path

from django.conf import settings
from django.db import models
from django.utils import timezone


def payment_reference():
    return 'KMP-' + uuid.uuid4().hex[:12].upper()


def receipt_path(instance, filename):
    return f'payments/receipts/{uuid.uuid4().hex}{Path(filename).suffix.lower()}'


def evidence_path(instance, filename):
    return f'disputes/{uuid.uuid4().hex}{Path(filename).suffix.lower()}'


class Payment(models.Model):
    """One payment by a buyer at checkout; it may cover several orders (one per seller)."""

    class Method(models.TextChoices):
        JAZZCASH = 'jazzcash', 'JazzCash'
        EASYPAISA = 'easypaisa', 'Easypaisa'
        BANK = 'bank_transfer', 'Bank transfer'

    class Status(models.TextChoices):
        PENDING = 'pending', 'Waiting for payment'
        VERIFYING = 'verifying', 'Receipt submitted – being verified'
        PAID = 'paid', 'Paid'
        FAILED = 'failed', 'Failed'
        EXPIRED = 'expired', 'Expired'

    reference = models.CharField(max_length=20, unique=True, default=payment_reference, editable=False)
    buyer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='payments')
    method = models.CharField(max_length=15, choices=Method.choices)
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    # "test" while PAYMENT_TEST_MODE is on, otherwise the real gateway name
    gateway = models.CharField(max_length=20, blank=True)
    gateway_txn_id = models.CharField(max_length=100, blank=True)
    gateway_response = models.JSONField(default=dict, blank=True)

    # Bank transfers: buyer uploads the receipt, an admin checks the bank statement
    bank_txn_id = models.CharField('Bank transaction ID', max_length=100, blank=True)
    receipt = models.ImageField(upload_to=receipt_path, blank=True)
    failure_reason = models.CharField(max_length=255, blank=True)

    expires_at = models.DateTimeField()
    paid_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def save(self, *args, **kwargs):
        if not self.expires_at:
            minutes = settings.PAYMENT_EXPIRY_MINUTES
            if self.method == self.Method.BANK:
                minutes = max(minutes, 24 * 60)  # time to visit the bank
            self.expires_at = timezone.now() + timedelta(minutes=minutes)
        super().save(*args, **kwargs)

    def __str__(self):
        return f'{self.reference} – Rs {self.amount} ({self.get_status_display()})'


class Refund(models.Model):
    """Money the platform owes back to a buyer. An admin sends it and records the reference."""

    class Status(models.TextChoices):
        PENDING = 'pending', 'To be sent'
        SENT = 'sent', 'Sent to buyer'

    order = models.ForeignKey('orders.Order', on_delete=models.PROTECT, related_name='refunds')
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    reason = models.CharField(max_length=255)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    reference = models.CharField('Transfer reference', max_length=100, blank=True)
    sent_at = models.DateTimeField(null=True, blank=True)
    sent_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'Refund Rs {self.amount} – {self.order}'


class Payout(models.Model):
    """Money released to a seller for a completed order, minus the platform commission."""

    class Status(models.TextChoices):
        PENDING = 'pending', 'To be paid'
        PAID = 'paid', 'Paid to seller'

    order = models.OneToOneField('orders.Order', on_delete=models.PROTECT, related_name='payout')
    seller = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='payouts')
    gross = models.DecimalField(max_digits=14, decimal_places=2)
    commission = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal('0'))
    net = models.DecimalField(max_digits=14, decimal_places=2)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    reference = models.CharField('Transfer reference', max_length=100, blank=True)
    paid_at = models.DateTimeField(null=True, blank=True)
    paid_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'Payout Rs {self.net} → {self.seller}'


class Dispute(models.Model):
    """A buyer reports a problem; money stays held until an admin decides."""

    class Reason(models.TextChoices):
        NOT_RECEIVED = 'not_received', 'Item not received'
        NOT_AS_DESCRIBED = 'not_as_described', 'Not as described'
        DAMAGED = 'damaged', 'Damaged / poor quality'
        SICK_ANIMAL = 'sick_animal', 'Animal sick, injured or died'
        FAKE = 'fake', 'Fake item / fraud'
        OTHER = 'other', 'Other'

    class Status(models.TextChoices):
        OPEN = 'open', 'Open'
        RESOLVED = 'resolved', 'Resolved'

    class Decision(models.TextChoices):
        REFUND_FULL = 'refund_full', 'Full refund to buyer (seller gets a strike)'
        REFUND_PARTIAL = 'refund_partial', 'Partial refund, rest to seller'
        RELEASE = 'release', 'Release money to seller (buyer claim rejected)'
        FRAUD = 'fraud', 'Proven fraud: full refund + ban seller'

    order = models.OneToOneField('orders.Order', on_delete=models.CASCADE, related_name='dispute')
    reason = models.CharField(max_length=20, choices=Reason.choices)
    description = models.TextField()
    seller_response = models.TextField(blank=True)
    seller_responded_at = models.DateTimeField(null=True, blank=True)
    respond_by = models.DateTimeField(help_text='Seller deadline to respond')
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.OPEN)
    decision = models.CharField(max_length=20, choices=Decision.choices, blank=True)
    refund_amount = models.DecimalField(
        max_digits=14, decimal_places=2, null=True, blank=True, help_text='Only for a partial refund'
    )
    resolution_note = models.TextField(blank=True, help_text='Shown to buyer and seller')
    resolved_at = models.DateTimeField(null=True, blank=True)
    resolved_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'Dispute {self.order} – {self.get_reason_display()}'


class DisputeEvidence(models.Model):
    dispute = models.ForeignKey(Dispute, on_delete=models.CASCADE, related_name='evidence')
    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='+')
    image = models.ImageField(upload_to=evidence_path)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']
