from django import forms
from django.contrib import admin, messages
from django.core.exceptions import ValidationError
from django.utils import timezone
from django.utils.html import format_html

from orders.admin import delivery_proof_html
from orders.services import resolve_dispute

from .models import Dispute, DisputeEvidence, Payment, Payout, Refund
from .services import fail_payment, mark_paid


@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    list_display = ('reference', 'buyer', 'method', 'amount', 'status', 'bank_txn_id', 'created_at', 'paid_at')
    list_filter = ('status', 'method', 'gateway')
    search_fields = ('reference', 'buyer__username', 'bank_txn_id', 'gateway_txn_id')
    readonly_fields = ('reference', 'buyer', 'method', 'amount', 'status', 'gateway', 'gateway_txn_id',
                       'bank_txn_id', 'receipt_preview', 'gateway_response', 'expires_at', 'paid_at', 'created_at')
    exclude = ('receipt',)
    actions = ['confirm_bank_transfer', 'reject_bank_transfer']

    @admin.display(description='Receipt')
    def receipt_preview(self, obj):
        if not obj.receipt:
            return '—'
        return format_html('<a href="{0}" target="_blank"><img src="{0}" style="max-width:360px;border-radius:8px"></a>', obj.receipt.url)

    @admin.action(description='✅ Bank transfer received – hold money & send orders to sellers')
    def confirm_bank_transfer(self, request, queryset):
        done = 0
        for payment in queryset.filter(status=Payment.Status.VERIFYING):
            mark_paid(payment, gateway='bank', txn_id=payment.bank_txn_id)
            done += 1
        self.message_user(request, f'{done} payment(s) confirmed.', messages.SUCCESS)

    @admin.action(description='⛔ Reject receipt – cancel the orders')
    def reject_bank_transfer(self, request, queryset):
        for payment in queryset.filter(status=Payment.Status.VERIFYING):
            fail_payment(payment, reason='Bank transfer not found')
        self.message_user(request, 'Rejected.', messages.WARNING)

    def has_add_permission(self, request):
        return False


@admin.register(Refund)
class RefundAdmin(admin.ModelAdmin):
    list_display = ('order', 'buyer', 'amount', 'status', 'reference', 'reason', 'created_at', 'sent_at')
    list_filter = ('status',)
    search_fields = ('order__order_number', 'order__buyer__username', 'reference')
    readonly_fields = ('order', 'amount', 'reason', 'status', 'sent_at', 'sent_by', 'created_at', 'buyer_payment')
    fields = ('order', 'buyer_payment', 'amount', 'reason', 'reference', 'status', 'sent_at', 'sent_by', 'created_at')
    actions = ['mark_sent']

    @admin.display(description='Buyer')
    def buyer(self, obj):
        return obj.order.buyer

    @admin.display(description='Send to')
    def buyer_payment(self, obj):
        p = obj.order.payment
        return f'{obj.order.buyer} · {obj.order.phone} · paid via {p.get_method_display() if p else "—"}'

    @admin.action(description='💸 Mark refund as sent (fill in the transfer reference first)')
    def mark_sent(self, request, queryset):
        missing = queryset.filter(reference='', status=Refund.Status.PENDING).count()
        queryset.filter(status=Refund.Status.PENDING).exclude(reference='').update(
            status=Refund.Status.SENT, sent_at=timezone.now(), sent_by=request.user
        )
        if missing:
            self.message_user(request, f'{missing} refund(s) skipped – add the transfer reference first.', messages.WARNING)

    def has_add_permission(self, request):
        return False


@admin.register(Payout)
class PayoutAdmin(admin.ModelAdmin):
    list_display = ('order', 'seller', 'gross', 'commission', 'net', 'status', 'pay_to', 'reference', 'paid_at')
    list_filter = ('status',)
    search_fields = ('order__order_number', 'seller__username', 'reference')
    readonly_fields = ('order', 'seller', 'gross', 'commission', 'net', 'status', 'pay_to', 'paid_at', 'paid_by', 'created_at')
    fields = ('order', 'seller', 'pay_to', 'gross', 'commission', 'net', 'reference', 'status', 'paid_at', 'paid_by')
    actions = ['mark_paid']

    @admin.display(description='Pay to')
    def pay_to(self, obj):
        s = obj.seller
        if not s.payout_account_number:
            return '⚠️ Seller has not added a payout account'
        return f'{s.get_payout_method_display()} · {s.payout_account_title} · {s.payout_account_number}'

    @admin.action(description='💸 Mark as paid to seller (fill in the transfer reference first)')
    def mark_paid(self, request, queryset):
        missing = queryset.filter(reference='', status=Payout.Status.PENDING).count()
        queryset.filter(status=Payout.Status.PENDING).exclude(reference='').update(
            status=Payout.Status.PAID, paid_at=timezone.now(), paid_by=request.user
        )
        if missing:
            self.message_user(request, f'{missing} payout(s) skipped – add the transfer reference first.', messages.WARNING)

    def has_add_permission(self, request):
        return False


class EvidenceInline(admin.TabularInline):
    model = DisputeEvidence
    extra = 0
    readonly_fields = ('uploaded_by', 'photo', 'created_at')
    fields = readonly_fields

    @admin.display(description='Photo')
    def photo(self, obj):
        return format_html('<a href="{0}" target="_blank"><img src="{0}" style="height:120px;border-radius:8px"></a>', obj.image.url)

    def has_add_permission(self, request, obj=None):
        return False


class DisputeAdminForm(forms.ModelForm):
    class Meta:
        model = Dispute
        fields = ('decision', 'refund_amount', 'resolution_note')

    def clean(self):
        data = super().clean()
        if self.instance.status == Dispute.Status.RESOLVED:
            raise ValidationError('This dispute is already resolved.')
        if data.get('decision') == Dispute.Decision.REFUND_PARTIAL:
            amount, total = data.get('refund_amount'), self.instance.order.total
            if not amount or not 0 < amount < total:
                self.add_error('refund_amount', f'Enter an amount between 1 and {total:,.0f}.')
        return data


@admin.register(Dispute)
class DisputeAdmin(admin.ModelAdmin):
    """Open a dispute, read both sides and the photos, then choose a decision and save."""

    form = DisputeAdminForm
    list_display = ('order', 'reason', 'status', 'order_total', 'seller', 'seller_responded', 'respond_by', 'created_at')
    list_filter = ('status', 'reason', 'decision')
    search_fields = ('order__order_number', 'order__seller__username', 'order__buyer__username')
    readonly_fields = ('order', 'order_total', 'buyer', 'seller', 'seller_strikes', 'reason', 'description',
                       'seller_response', 'respond_by', 'status', 'resolved_at', 'resolved_by',
                       'delivery_check', 'tracking', 'delivery_proof')
    fieldsets = (
        ('Case', {'fields': ('order', 'order_total', 'buyer', 'seller', 'seller_strikes', 'reason', 'description',
                             'seller_response', 'respond_by', 'status')}),
        ('Proof of delivery', {'fields': ('delivery_check', 'tracking', 'delivery_proof')}),
        ('Decision – the money moves when you save', {'fields': ('decision', 'refund_amount', 'resolution_note',
                                                                'resolved_at', 'resolved_by')}),
    )
    inlines = [EvidenceInline]

    @admin.display(description='Total')
    def order_total(self, obj):
        return f'Rs {obj.order.total:,.0f}'

    def buyer(self, obj):
        return obj.order.buyer

    def seller(self, obj):
        return obj.order.seller

    @admin.display(description='Seller strikes so far')
    def seller_strikes(self, obj):
        return obj.order.seller.strikes.count()

    @admin.display(description='Delivery')
    def delivery_check(self, obj):
        order = obj.order
        if order.delivery_verified:
            return "✅ Confirmed with the buyer's delivery code – the buyer had the goods in hand"
        if order.delivered_at:
            return '⚠️ Marked delivered WITHOUT the code – check the photo and tracking below'
        return '❌ Never marked delivered by the seller'

    @admin.display(description='Courier / tracking')
    def tracking(self, obj):
        order = obj.order
        return ' '.join(filter(None, [order.courier_name, order.tracking_number])) or '—'

    @admin.display(description='Proof photo')
    def delivery_proof(self, obj):
        return delivery_proof_html(obj.order)

    @admin.display(boolean=True, description='Seller replied')
    def seller_responded(self, obj):
        return bool(obj.seller_response)

    def get_readonly_fields(self, request, obj=None):
        if obj and obj.status == Dispute.Status.RESOLVED:
            return self.readonly_fields + ('decision', 'refund_amount', 'resolution_note')
        return self.readonly_fields

    def save_model(self, request, obj, form, change):
        decision = form.cleaned_data.get('decision')
        if obj.status == Dispute.Status.OPEN and decision:
            resolve_dispute(obj, decision, request.user, form.cleaned_data.get('refund_amount'),
                            form.cleaned_data.get('resolution_note', ''))
            self.message_user(request, 'Decision applied – money moved and the order updated.', messages.SUCCESS)
        else:
            super().save_model(request, obj, form, change)

    def has_add_permission(self, request):
        return False
