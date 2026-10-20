from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import CategoryViewSet, MyProductViewSet, ProductViewSet, SellerReviewListView, StatsView

router = DefaultRouter()
router.register('categories', CategoryViewSet, basename='category')
router.register('products', ProductViewSet, basename='product')
router.register('my/products', MyProductViewSet, basename='my-product')

urlpatterns = [
    path('', include(router.urls)),
    path('sellers/<int:seller_id>/reviews/', SellerReviewListView.as_view(), name='seller-reviews'),
    path('stats/', StatsView.as_view(), name='stats'),
]
