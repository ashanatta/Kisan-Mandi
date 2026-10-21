from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import CommentViewSet, PostViewSet

router = DefaultRouter()
router.register('posts', PostViewSet, basename='community-post')
router.register('comments', CommentViewSet, basename='community-comment')

urlpatterns = [path('', include(router.urls))]
