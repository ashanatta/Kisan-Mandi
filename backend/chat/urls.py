from django.urls import path

from .views import ConversationListView, MessageListView, UnreadCountView

urlpatterns = [
    path('', ConversationListView.as_view(), name='conversations'),
    path('unread/', UnreadCountView.as_view(), name='conversations-unread'),
    path('<int:pk>/messages/', MessageListView.as_view(), name='conversation-messages'),
]
