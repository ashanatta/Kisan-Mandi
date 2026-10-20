from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import BusinessViewSet, ExpenseViewSet, IncomeViewSet, ReportExportView, ReportView

router = DefaultRouter()
router.register('businesses', BusinessViewSet, basename='business')
router.register('expenses', ExpenseViewSet, basename='expense')
router.register('incomes', IncomeViewSet, basename='income')

urlpatterns = [
    path('', include(router.urls)),
    path('report/', ReportView.as_view(), name='tracker-report'),
    path('report/export/', ReportExportView.as_view(), name='tracker-report-export'),
]
