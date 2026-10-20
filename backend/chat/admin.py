from django.contrib import admin

from .models import Conversation, Message


class MessageInline(admin.TabularInline):
    model = Message
    extra = 0
    readonly_fields = ('sender', 'body', 'was_masked', 'read_at', 'created_at')

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(Conversation)
class ConversationAdmin(admin.ModelAdmin):
    """Admins can read conversations when investigating a dispute."""

    list_display = ('buyer', 'seller', 'product', 'last_message_at')
    search_fields = ('buyer__username', 'seller__username', 'product__title')
    readonly_fields = ('buyer', 'seller', 'product', 'created_at', 'last_message_at')
    inlines = [MessageInline]
