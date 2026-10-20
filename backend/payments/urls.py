from django.urls import path

from .views import (
    BankReceiptView,
    EarningsView,
    PaymentDetailView,
    PaymentMethodsView,
    PaymentStartView,
    TestPaymentResultView,
    jazzcash_return,
)

urlpatterns = [
    path('methods/', PaymentMethodsView.as_view(), name='payment-methods'),
    path('earnings/', EarningsView.as_view(), name='earnings'),
    path('jazzcash/return/', jazzcash_return, name='jazzcash-return'),
    path('<str:reference>/', PaymentDetailView.as_view(), name='payment-detail'),
    path('<str:reference>/start/', PaymentStartView.as_view(), name='payment-start'),
    path('<str:reference>/test-result/', TestPaymentResultView.as_view(), name='payment-test-result'),
    path('<str:reference>/bank-receipt/', BankReceiptView.as_view(), name='payment-bank-receipt'),
]
