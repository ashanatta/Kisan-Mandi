from rest_framework import serializers

from marketplace.models import Product

from .models import Conversation, Message


class MessageSerializer(serializers.ModelSerializer):
    mine = serializers.SerializerMethodField()

    class Meta:
        model = Message
        fields = ('id', 'body', 'mine', 'was_masked', 'read_at', 'created_at')
        read_only_fields = ('was_masked', 'read_at', 'created_at')

    def get_mine(self, message) -> bool:
        return message.sender_id == self.context['request'].user.id


class ConversationSerializer(serializers.ModelSerializer):
    other_party = serializers.SerializerMethodField()
    product = serializers.SerializerMethodField()
    last_message = serializers.SerializerMethodField()
    unread = serializers.IntegerField(read_only=True, default=0)
    i_am_seller = serializers.SerializerMethodField()

    class Meta:
        model = Conversation
        fields = ('id', 'other_party', 'product', 'last_message', 'unread', 'i_am_seller', 'last_message_at')

    def get_i_am_seller(self, conv) -> bool:
        return conv.seller_id == self.context['request'].user.id

    def get_other_party(self, conv) -> dict:
        other = conv.other_party(self.context['request'].user)
        return {'id': other.id, 'name': str(other), 'is_verified': other.is_verified}

    def get_product(self, conv) -> dict | None:
        p = conv.product
        if not p:
            return None
        images = list(p.images.all())
        request = self.context['request']
        return {
            'id': p.id, 'title': p.title, 'price': p.price, 'unit': p.unit,
            'image': request.build_absolute_uri(images[0].image.url) if images else None,
        }

    def get_last_message(self, conv) -> str:
        last = conv.messages.order_by('-created_at').first()
        return last.body[:120] if last else ''


class StartConversationSerializer(serializers.Serializer):
    product_id = serializers.PrimaryKeyRelatedField(queryset=Product.objects.all(), source='product')
