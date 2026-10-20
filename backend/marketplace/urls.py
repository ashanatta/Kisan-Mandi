from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    CategoryViewSet,
    MyProductViewSet,
    MyReviewOfSellerView,
    ProductViewSet,
    ReportListingView,
    ReviewReplyView,
    SellerProfileView,
    SellerReviewListView,
    StatsView,
)

router = DefaultRouter()
router.register('categories', CategoryViewSet, basename='category')
router.register('products', ProductViewSet, basename='product')
router.register('my/products', MyProductViewSet, basename='my-product')

urlpatterns = [
    path('', include(router.urls)),
    path('products/<int:pk>/report/', ReportListingView.as_view(), name='report-listing'),
    path('sellers/<int:seller_id>/', SellerProfileView.as_view(), name='seller-profile'),
    path('sellers/<int:seller_id>/reviews/', SellerReviewListView.as_view(), name='seller-reviews'),
    path('sellers/<int:seller_id>/reviews/mine/', MyReviewOfSellerView.as_view(), name='my-review-of-seller'),
    path('my/reviews/<int:review_id>/reply/', ReviewReplyView.as_view(), name='review-reply'),
    path('stats/', StatsView.as_view(), name='stats'),
]
