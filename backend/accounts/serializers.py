from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.tokens import RefreshToken

from .models import SellerVerification

User = get_user_model()


def tokens_for(user):
    refresh = RefreshToken.for_user(user)
    return {'refresh': str(refresh), 'access': str(refresh.access_token)}


class UserSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(source='__str__', read_only=True)
    is_platform_admin = serializers.BooleanField(read_only=True)
    can_sell = serializers.BooleanField(read_only=True)
    strikes = serializers.IntegerField(source='strikes.count', read_only=True)

    class Meta:
        model = User
        fields = (
            'id', 'username', 'email', 'first_name', 'last_name', 'full_name', 'role',
            'phone', 'whatsapp', 'city', 'district', 'address', 'avatar', 'preferred_language',
            'is_verified', 'is_platform_admin', 'date_joined',
            'can_sell', 'suspended_until', 'strikes',
            'payout_method', 'payout_account_title', 'payout_account_number',
        )
        read_only_fields = ('id', 'username', 'role', 'is_verified', 'is_platform_admin', 'date_joined',
                            'suspended_until')

    def validate_email(self, value):
        qs = User.objects.filter(email__iexact=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError('This email is already registered.')
        return value.lower()


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, style={'input_type': 'password'})
    password2 = serializers.CharField(write_only=True, label='Confirm password', style={'input_type': 'password'})
    role = serializers.ChoiceField(choices=[User.Role.BUYER, User.Role.SELLER], default=User.Role.BUYER)

    class Meta:
        model = User
        fields = (
            'username', 'email', 'password', 'password2', 'first_name', 'last_name',
            'role', 'phone', 'city', 'district',
        )
        extra_kwargs = {
            'first_name': {'required': True, 'allow_blank': False},
            'phone': {'required': True, 'allow_blank': False},
            'city': {'required': True, 'allow_blank': False},
        }

    def validate_email(self, value):
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError('This email is already registered.')
        return value.lower()

    def validate_username(self, value):
        if User.objects.filter(username__iexact=value).exists():
            raise serializers.ValidationError('This username is taken.')
        return value

    def validate(self, attrs):
        if attrs['password'] != attrs.pop('password2'):
            raise serializers.ValidationError({'password2': 'Passwords do not match.'})
        validate_password(attrs['password'], user=User(**{k: v for k, v in attrs.items() if k != 'password'}))
        return attrs

    def create(self, validated_data):
        password = validated_data.pop('password')
        user = User(**validated_data)
        # Use the same number for WhatsApp unless the user changes it later.
        user.whatsapp = user.phone
        user.set_password(password)
        user.save()
        return user


class LoginSerializer(TokenObtainPairSerializer):
    """JWT login that accepts either a username or an email in the `username` field."""

    default_error_messages = {
        'no_active_account': 'Wrong username/email or password.',
    }

    def validate(self, attrs):
        identifier = attrs.get(self.username_field, '').strip()
        if '@' in identifier:
            user = User.objects.filter(email__iexact=identifier).first()
            if user:
                identifier = user.username
        attrs[self.username_field] = identifier
        data = super().validate(attrs)
        data['user'] = UserSerializer(self.user, context=self.context).data
        return data


MAX_CNIC_PHOTO_BYTES = 5 * 1024 * 1024


class VerificationSerializer(serializers.ModelSerializer):
    """Submit CNIC details. Photos are write-only: they are never sent back to the browser."""

    cnic_front = serializers.ImageField(write_only=True)
    cnic_back = serializers.ImageField(write_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    masked_cnic = serializers.CharField(read_only=True)

    class Meta:
        model = SellerVerification
        fields = ('cnic_number', 'name_on_cnic', 'cnic_front', 'cnic_back', 'masked_cnic',
                  'status', 'status_display', 'rejection_reason', 'submitted_at', 'reviewed_at')
        read_only_fields = ('status', 'rejection_reason', 'submitted_at', 'reviewed_at')
        extra_kwargs = {'cnic_number': {'write_only': True}}

    def validate_cnic_number(self, value):
        from .penalties import is_cnic_banned

        if is_cnic_banned(value):
            raise serializers.ValidationError('This CNIC is banned from Kisan Mandi.')
        return value

    def validate(self, attrs):
        for field in ('cnic_front', 'cnic_back'):
            if attrs[field].size > MAX_CNIC_PHOTO_BYTES:
                raise serializers.ValidationError({field: 'Photo must be smaller than 5 MB.'})
        return attrs


class ChangePasswordSerializer(serializers.Serializer):
    old_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True)

    def validate_old_password(self, value):
        if not self.context['request'].user.check_password(value):
            raise serializers.ValidationError('Current password is incorrect.')
        return value

    def validate_new_password(self, value):
        validate_password(value, user=self.context['request'].user)
        return value
