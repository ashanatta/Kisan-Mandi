from decimal import Decimal

from django.conf import settings
from django.db.models import Sum
from django.http import HttpResponseRedirect
from django.shortcuts import get_object_or_404
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers, status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from orders.models import Order
from orders.services import run_due_tasks

from . import gateways
from .models import Payment, Payout
from .serializers import BankReceiptSerializer, PaymentSerializer, PayoutSerializer, TestResultSerializer
from .services import fail_payment, mark_paid


class PaymentMethodsView(APIView):
    """Which payment methods work right now, and the protection rules shown at checkout."""

    permission_classes = [AllowAny]

    @extend_schema(responses=OpenApiTypes.OBJECT)
    def get(self, request):
        return Response({
            'methods': gateways.available_methods(),
            'protection_days': settings.PROTECTION_DAYS,
            'unverified_protection_days': settings.UNVERIFIED_PROTECTION_DAYS,
            'payment_expiry_minutes': settings.PAYMENT_EXPIRY_MINUTES,
            'commission_percent': Decimal(str(settings.PLATFORM_COMMISSION_PERCENT)),
        })


def _my_payment(request, reference):
    run_due_tasks()
    return get_object_or_404(Payment.objects.prefetch_related('orders__seller'), reference=reference, buyer=request.user)


class PaymentDetailView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses=PaymentSerializer)
    def get(self, request, reference):
        return Response(PaymentSerializer(_my_payment(request, reference)).data)


class PaymentStartView(APIView):
    """
    Start paying. Returns what the browser should do next:
    `redirect` (post `fields` to `url` – JazzCash), `test` (show the simulator) or `bank` (show account details).
    """

    permission_classes = [IsAuthenticated]

    @extend_schema(request=None, responses=OpenApiTypes.OBJECT)
    def post(self, request, reference):
        payment = _my_payment(request, reference)
        if payment.status != Payment.Status.PENDING:
            return Response({'detail': f'This payment is {payment.get_status_display().lower()}.'}, status=status.HTTP_400_BAD_REQUEST)
        mode = gateways.method_mode(payment.method)
        if mode is None:
            return Response({'detail': 'This payment method is not available.'}, status=status.HTTP_400_BAD_REQUEST)
        if mode == 'test':
            payment.gateway = 'test'
            payment.save(update_fields=['gateway'])
            return Response({'type': 'test'})
        if mode == 'manual':
            return Response({'type': 'bank', 'bank': gateways.bank_details()})
        payment.gateway = f'jazzcash-{mode}'
        payment.save(update_fields=['gateway'])
        return Response({'type': 'redirect', **gateways.jazzcash_form(payment)})


class TestPaymentResultView(APIView):
    """Simulate the gateway result. Only available while PAYMENT_TEST_MODE is on."""

    permission_classes = [IsAuthenticated]

    @extend_schema(request=TestResultSerializer, responses=PaymentSerializer)
    def post(self, request, reference):
        if not settings.PAYMENT_TEST_MODE:
            return Response({'detail': 'Test payments are disabled.'}, status=status.HTTP_403_FORBIDDEN)
        payment = _my_payment(request, reference)
        if gateways.method_mode(payment.method) != 'test':
            return Response({'detail': 'This payment uses a real gateway.'}, status=status.HTTP_400_BAD_REQUEST)
        serializer = TestResultSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        if serializer.validated_data['result'] == 'success':
            mark_paid(payment, gateway='test', txn_id=f'TEST-{payment.reference}')
        else:
            fail_payment(payment, reason='Payment declined (test)')
        payment.refresh_from_db()
        return Response(PaymentSerializer(payment).data)


class BankReceiptView(APIView):
    """Buyer uploads a bank transfer receipt; an admin confirms it against the bank statement."""

    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    @extend_schema(request={'multipart/form-data': BankReceiptSerializer}, responses=PaymentSerializer)
    def post(self, request, reference):
        payment = _my_payment(request, reference)
        if payment.method != Payment.Method.BANK or payment.status != Payment.Status.PENDING:
            return Response({'detail': 'This payment is not waiting for a bank receipt.'}, status=status.HTTP_400_BAD_REQUEST)
        serializer = BankReceiptSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        payment.bank_txn_id = serializer.validated_data['bank_txn_id']
        payment.receipt = serializer.validated_data['receipt']
        payment.status = Payment.Status.VERIFYING
        payment.gateway = 'bank'
        payment.save()
        return Response(PaymentSerializer(payment).data)


@csrf_exempt
@require_POST
def jazzcash_return(request):
    """
    JazzCash posts the result here (through the buyer's browser). We only trust it
    if the secure hash matches, then send the buyer to the result page.
    """
    data = request.POST.dict()
    reference = data.get('ppmpf_1', '')
    payment = Payment.objects.filter(reference=reference).first()
    if payment:
        authentic, success = gateways.verify_jazzcash_response(data)
        if not authentic:
            payment.gateway_response = {**payment.gateway_response, 'rejected_unsigned_response': data}
            payment.save(update_fields=['gateway_response'])
        elif success:
            mark_paid(payment, txn_id=data.get('pp_TxnRefNo', ''), response=data)
        else:
            fail_payment(payment, reason=data.get('pp_ResponseMessage', 'Payment failed'), response=data)
    return HttpResponseRedirect(f'{settings.FRONTEND_URL}/payment/result?ref={reference}')


class EarningsView(APIView):
    """A seller's money: held in escrow, released (to be paid out) and already paid out."""

    permission_classes = [IsAuthenticated]

    @extend_schema(responses=inline_serializer('Earnings', {
        'in_escrow': serializers.DecimalField(14, 2),
        'to_be_paid': serializers.DecimalField(14, 2),
        'paid_out': serializers.DecimalField(14, 2),
        'commission_total': serializers.DecimalField(14, 2),
        'payouts': PayoutSerializer(many=True),
    }))
    def get(self, request):
        run_due_tasks()
        user = request.user
        held = Order.objects.filter(seller=user, status__in=Order.PAID_STATUSES).aggregate(s=Sum('total'))['s']
        payouts = Payout.objects.filter(seller=user).select_related('order')
        sums = lambda st: payouts.filter(status=st).aggregate(s=Sum('net'))['s'] or Decimal('0')  # noqa: E731
        return Response({
            'in_escrow': held or Decimal('0'),
            'to_be_paid': sums(Payout.Status.PENDING),
            'paid_out': sums(Payout.Status.PAID),
            'commission_total': payouts.aggregate(s=Sum('commission'))['s'] or Decimal('0'),
            'payouts': PayoutSerializer(payouts[:50], many=True).data,
        })
