from django.conf import settings
from django.db import models


class Conversation(models.Model):
    """A buyer asking a seller about one listing."""

    product = models.ForeignKey('marketplace.Product', on_delete=models.SET_NULL, null=True, blank=True, related_name='conversations')
    buyer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='conversations_as_buyer')
    seller = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='conversations_as_seller')
    created_at = models.DateTimeField(auto_now_add=True)
    last_message_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-last_message_at']
        constraints = [
            models.UniqueConstraint(fields=['product', 'buyer'], name='one_conversation_per_buyer_per_listing'),
        ]

    def other_party(self, user):
        return self.seller if user.id == self.buyer_id else self.buyer

    def __str__(self):
        return f'{self.buyer} ↔ {self.seller} ({self.product})'


class Message(models.Model):
    conversation = models.ForeignKey(Conversation, on_delete=models.CASCADE, related_name='messages')
    sender = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='+')
    body = models.TextField(max_length=2000)
    # True when phone numbers / links were hidden because no paid order exists yet
    was_masked = models.BooleanField(default=False)
    read_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']

    def __str__(self):
        return f'{self.sender}: {self.body[:40]}'
