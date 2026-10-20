from datetime import date

import django_filters
from django.db.models import DecimalField, F, OuterRef, Subquery, Sum, Value
from django.db.models.functions import Coalesce
from django.http import HttpResponse
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import viewsets
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Business, Expense, Income
from .reports import build_report, export_excel, export_pdf
from .serializers import BusinessSerializer, ExpenseSerializer, IncomeSerializer

MONEY = DecimalField(max_digits=14, decimal_places=2)


def _sum_subquery(model):
    rows = model.objects.filter(business=OuterRef('pk')).values('business').annotate(s=Sum('amount')).values('s')
    return Coalesce(Subquery(rows, output_field=MONEY), Value(0, output_field=MONEY))


class BusinessViewSet(viewsets.ModelViewSet):
    """The user's farm ventures with income, expense and profit totals."""

    serializer_class = BusinessSerializer
    permission_classes = [IsAuthenticated]
    queryset = Business.objects.none()  # for the API schema
    pagination_class = None
    filterset_fields = ('business_type', 'season', 'is_active')

    def get_queryset(self):
        return Business.objects.filter(owner=self.request.user).annotate(
            total_income=_sum_subquery(Income),
            total_expense=_sum_subquery(Expense),
        ).annotate(profit=F('total_income') - F('total_expense'))

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)


class EntryFilter(django_filters.FilterSet):
    start = django_filters.DateFilter(field_name='date', lookup_expr='gte')
    end = django_filters.DateFilter(field_name='date', lookup_expr='lte')


class ExpenseFilter(EntryFilter):
    class Meta:
        model = Expense
        fields = ('business', 'category', 'start', 'end')


class IncomeFilter(EntryFilter):
    class Meta:
        model = Income
        fields = ('business', 'source', 'start', 'end')


class ExpenseViewSet(viewsets.ModelViewSet):
    """Expenses of the user's businesses. Filter with `?business=&category=&start=&end=`."""

    serializer_class = ExpenseSerializer
    permission_classes = [IsAuthenticated]
    queryset = Expense.objects.none()  # for the API schema
    filterset_class = ExpenseFilter
    search_fields = ('notes',)
    ordering_fields = ('date', 'amount')
    ordering = ('-date', '-id')

    def get_queryset(self):
        return Expense.objects.filter(business__owner=self.request.user).select_related('business')


class IncomeViewSet(viewsets.ModelViewSet):
    """Income / sales of the user's businesses. Filter with `?business=&source=&start=&end=`."""

    serializer_class = IncomeSerializer
    permission_classes = [IsAuthenticated]
    queryset = Income.objects.none()  # for the API schema
    filterset_class = IncomeFilter
    search_fields = ('notes',)
    ordering_fields = ('date', 'amount')
    ordering = ('-date', '-id')

    def get_queryset(self):
        return Income.objects.filter(business__owner=self.request.user).select_related('business')


REPORT_PARAMS = [
    OpenApiParameter('start', date, description='From date (YYYY-MM-DD)'),
    OpenApiParameter('end', date, description='To date (YYYY-MM-DD)'),
    OpenApiParameter('business', int, description='Limit to one business'),
]


def _report_args(request):
    params = request.query_params
    try:
        start = date.fromisoformat(params['start']) if params.get('start') else None
        end = date.fromisoformat(params['end']) if params.get('end') else None
        business = int(params['business']) if params.get('business') else None
    except ValueError:
        raise ValidationError({'detail': 'Use dates like 2026-01-31 and a numeric business id.'})
    if start and end and end < start:
        raise ValidationError({'detail': 'End date cannot be before start date.'})
    if business and not Business.objects.filter(owner=request.user, pk=business).exists():
        raise ValidationError({'business': 'Business not found.'})
    return dict(start=start, end=end, business_id=business)


class ReportView(APIView):
    """
    Profit / loss for a date range: totals, monthly series (with cumulative profit),
    expense breakdown by category, income by source and per-business totals.
    """

    permission_classes = [IsAuthenticated]

    @extend_schema(parameters=REPORT_PARAMS, responses=OpenApiTypes.OBJECT)
    def get(self, request):
        report = build_report(request.user, **_report_args(request))
        report.pop('expenses')
        report.pop('incomes')
        return Response(report)


class ReportExportView(APIView):
    """Download the same report as PDF (`?file=pdf`) or Excel (`?file=xlsx`)."""

    permission_classes = [IsAuthenticated]

    @extend_schema(
        parameters=REPORT_PARAMS + [OpenApiParameter('file', str, enum=['pdf', 'xlsx'], required=True)],
        responses={(200, 'application/octet-stream'): bytes},
    )
    def get(self, request):
        kind = request.query_params.get('file')
        if kind not in ('pdf', 'xlsx'):
            raise ValidationError({'file': 'Choose pdf or xlsx.'})
        report = build_report(request.user, **_report_args(request))
        if kind == 'pdf':
            content, mime = export_pdf(report), 'application/pdf'
        else:
            content, mime = export_excel(report), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        response = HttpResponse(content, content_type=mime)
        response['Content-Disposition'] = f'attachment; filename="profit-loss-{date.today():%Y%m%d}.{kind}"'
        return response
