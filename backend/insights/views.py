from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from tracker.models import Business

from . import sources
from .advice import LANGS, get_advice
from .forecast import build_forecast
from .models import CATALOG, MarketBrief, MarketPrice, NewsItem


def _business(request):
    value = request.query_params.get('business')
    if not value:
        return None
    try:
        return Business.objects.get(owner=request.user, pk=int(value))
    except (ValueError, Business.DoesNotExist):
        raise ValidationError({'business': 'Business not found.'})


class MarketView(APIView):
    """
    Today's input, mandi and world prices with their yearly change, the market
    brief and agriculture news. Cached data is returned at once; stale data
    starts a background refresh (`refreshing: true`).
    """

    permission_classes = [AllowAny]

    @extend_schema(responses=OpenApiTypes.OBJECT)
    def get(self, request):
        sources.refresh_in_background()
        known = {p.key: p for p in MarketPrice.objects.all()}
        prices = []
        for key, name, name_ur, group, unit in CATALOG:
            p = known.get(key)
            if not p:
                continue
            change = p.change if key != 'cpi' else None
            prices.append({
                'key': key, 'name': name, 'name_ur': name_ur, 'group': group, 'unit': unit,
                'price': p.price, 'year_ago': p.year_ago,
                'change_pct': round(float(change) * 100, 1) if change is not None else None,
                'note': p.note, 'source': p.source, 'updated_at': p.updated_at,
            })
        brief = MarketBrief.objects.first()
        fields = ('title', 'title_ur', 'url', 'source', 'published_at')
        english = list(NewsItem.objects.filter(lang='en').values(*fields)[:15])
        # Urdu: native Urdu stories plus translated English ones, newest first.
        urdu = list(NewsItem.objects.filter(lang='ur').values(*fields)[:15])
        urdu += [{**n, 'title': n['title_ur']} for n in english if n['title_ur']]
        urdu.sort(key=lambda n: n['published_at'].timestamp() if n['published_at'] else 0, reverse=True)
        news = {'en': english, 'ur': urdu[:15]}
        return Response({
            'ai_enabled': sources.ai_enabled(),
            'prices_auto': sources.search_enabled(),
            'refreshing': sources.is_refreshing(),
            'prices': prices,
            'brief': {'summary_en': brief.summary_en, 'summary_ur': brief.summary_ur, 'sources': brief.sources,
                      'created_at': brief.created_at} if brief else None,
            'news': news,
        })


class ForecastView(APIView):
    """Next 12 months for all the user's businesses, or one (`?business=`), from last year's records and today's prices."""

    permission_classes = [IsAuthenticated]

    @extend_schema(parameters=[OpenApiParameter('business', int, required=False)], responses=OpenApiTypes.OBJECT)
    def get(self, request):
        business = _business(request)
        return Response(build_forecast(request.user, business and business.pk))


class ForecastAdviceView(APIView):
    """Gemini's plain-language advice on the forecast. One call per user, business and language per day."""

    permission_classes = [IsAuthenticated]

    @extend_schema(parameters=[OpenApiParameter('business', int, required=False),
                               OpenApiParameter('lang', str, enum=list(LANGS), required=False)],
                   responses=OpenApiTypes.OBJECT)
    def get(self, request):
        if not sources.ai_enabled():
            return Response({'detail': 'AI advice is not set up (GEMINI_API_KEY).'}, status=503)
        lang = request.query_params.get('lang', 'en')
        if lang not in LANGS:
            raise ValidationError({'lang': 'Use en or ur.'})
        business = _business(request)
        forecast = build_forecast(request.user, business and business.pk)
        if not forecast['enough_data']:
            raise ValidationError({'detail': 'Add at least 3 months of expenses and income first.'})
        try:
            text, cached = get_advice(request.user, forecast, business, lang)
        except sources.SourceError:
            return Response({'detail': 'The AI service is busy. Please try again in a few minutes.'}, status=503)
        return Response({'text': text, 'cached': cached})
