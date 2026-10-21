from django.urls import path

from .views import ForecastAdviceView, ForecastView, MarketView

urlpatterns = [
    path('market/', MarketView.as_view(), name='insights-market'),
    path('forecast/', ForecastView.as_view(), name='insights-forecast'),
    path('forecast/advice/', ForecastAdviceView.as_view(), name='insights-forecast-advice'),
]
