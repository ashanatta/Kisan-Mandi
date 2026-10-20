from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import Avg, Count
from rest_framework import serializers

from .models import Category, ListingReport, Product, ProductImage, SellerReview

MAX_IMAGES = 8
MAX_IMAGE_BYTES = 5 * 1024 * 1024
LIVESTOCK_FIELDS = ('breed', 'gender', 'age_months', 'weight_kg', 'milk_liters_per_day')
EQUIPMENT_FIELDS = ('brand', 'model_year')


class CategoryBriefSerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ('id', 'name', 'name_ur', 'slug', 'kind', 'icon')


class CategorySerializer(serializers.ModelSerializer):
    product_count = serializers.IntegerField(read_only=True)
    children = serializers.SerializerMethodField()

    class Meta:
        model = Category
        fields = ('id', 'name', 'name_ur', 'slug', 'kind', 'icon', 'parent', 'product_count', 'children')

    def get_children(self, obj) -> list[dict]:
        children = getattr(obj, 'active_children', [])
        return CategorySerializer(children, many=True, context=self.context).data


class ProductImageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductImage
        fields = ('id', 'image', 'is_primary', 'sort_order')


class ProductListSerializer(serializers.ModelSerializer):
    category = CategoryBriefSerializer(read_only=True)
    primary_image = serializers.SerializerMethodField()
    seller_name = serializers.CharField(source='seller.__str__', read_only=True)
    seller_verified = serializers.BooleanField(source='seller.is_verified', read_only=True)
    unit_display = serializers.CharField(source='get_unit_display', read_only=True)
    condition_display = serializers.CharField(source='get_condition_display', read_only=True)
    rent_period_display = serializers.CharField(source='get_rent_period_display', read_only=True)

    class Meta:
        model = Product
        fields = (
            'id', 'title', 'price', 'quantity', 'unit', 'unit_display',
            'condition', 'condition_display', 'listing_type', 'rent_period', 'rent_period_display',
            'city', 'district', 'category', 'primary_image', 'seller_name', 'seller_verified',
            'breed', 'age_months', 'weight_kg', 'milk_liters_per_day',
            'created_at',
        )

    def get_primary_image(self, obj) -> str | None:
        # `images` is prefetched and ordered with the primary image first.
        images = list(obj.images.all())
        if not images:
            return None
        request = self.context.get('request')
        url = images[0].image.url
        return request.build_absolute_uri(url) if request else url


class SellerInfoSerializer(serializers.Serializer):
    """Public seller info with the trust signals buyers look at."""

    id = serializers.IntegerField()
    name = serializers.CharField(source='__str__')
    phone = serializers.CharField()
    whatsapp = serializers.CharField()
    city = serializers.CharField()
    district = serializers.CharField()
    member_since = serializers.DateTimeField(source='date_joined')
    is_verified = serializers.BooleanField()
    rating = serializers.SerializerMethodField()
    review_count = serializers.SerializerMethodField()
    listings_count = serializers.SerializerMethodField()
    completed_orders = serializers.SerializerMethodField()

    def _stats(self, user):
        if not hasattr(user, '_review_stats'):
            user._review_stats = user.reviews_received.aggregate(avg=Avg('rating'), count=Count('id'))
        return user._review_stats

    def get_rating(self, user) -> float | None:
        avg = self._stats(user)['avg']
        return round(avg, 1) if avg is not None else None

    def get_review_count(self, user) -> int:
        return self._stats(user)['count']

    def get_listings_count(self, user) -> int:
        return user.products.filter(status=Product.Status.APPROVED, is_active=True).count()

    def get_completed_orders(self, user) -> int:
        return user.orders_received.filter(status='delivered').count()


class SellerProfileSerializer(SellerInfoSerializer):
    rating_breakdown = serializers.SerializerMethodField()

    def get_rating_breakdown(self, user) -> dict[str, int]:
        counts = dict(user.reviews_received.values_list('rating').annotate(n=Count('id')))
        return {str(star): counts.get(star, 0) for star in range(5, 0, -1)}


class ProductDetailSerializer(ProductListSerializer):
    images = ProductImageSerializer(many=True, read_only=True)
    seller = SellerInfoSerializer(read_only=True)
    gender_display = serializers.CharField(source='get_gender_display', read_only=True)

    class Meta(ProductListSerializer.Meta):
        fields = ProductListSerializer.Meta.fields + (
            'description', 'images', 'seller', 'brand', 'model_year',
            'gender', 'gender_display', 'views_count', 'updated_at',
        )


class SellerProductSerializer(ProductDetailSerializer):
    """A seller's own listing, including moderation status."""

    status_display = serializers.CharField(source='get_status_display', read_only=True)
    linked_business_name = serializers.CharField(source='linked_business.name', read_only=True, default=None)

    class Meta(ProductDetailSerializer.Meta):
        fields = ProductDetailSerializer.Meta.fields + (
            'status', 'status_display', 'rejection_reason', 'is_active',
            'linked_business', 'linked_business_name',
        )


class ProductWriteSerializer(serializers.ModelSerializer):
    """Create / update a listing. Send as multipart with repeated `uploaded_images` files."""

    category = serializers.PrimaryKeyRelatedField(queryset=Category.objects.filter(is_active=True))
    uploaded_images = serializers.ListField(
        child=serializers.ImageField(), write_only=True, required=False, max_length=MAX_IMAGES,
    )

    class Meta:
        model = Product
        fields = (
            'category', 'title', 'description', 'price', 'quantity', 'unit', 'condition',
            'city', 'district', 'listing_type', 'rent_period', 'brand', 'model_year',
            'breed', 'gender', 'age_months', 'weight_kg', 'milk_liters_per_day',
            'linked_business', 'is_active', 'uploaded_images',
        )

    def validate_uploaded_images(self, images):
        for image in images:
            if image.size > MAX_IMAGE_BYTES:
                raise serializers.ValidationError(f'"{image.name}" is larger than 5 MB.')
        existing = self.instance.images.count() if self.instance else 0
        if existing + len(images) > MAX_IMAGES:
            raise serializers.ValidationError(f'A listing can have at most {MAX_IMAGES} photos.')
        return images

    def validate(self, attrs):
        request = self.context['request']
        instance = self.instance or Product(seller=request.user)
        for key, value in attrs.items():
            if key != 'uploaded_images':
                setattr(instance, key, value)

        # Drop fields that don't apply to the chosen category instead of failing.
        kind = instance.category.kind
        if kind != Category.Kind.LIVESTOCK:
            for field in LIVESTOCK_FIELDS:
                setattr(instance, field, '' if field in ('breed', 'gender') else None)
                attrs[field] = getattr(instance, field)
        if kind != Category.Kind.EQUIPMENT:
            instance.listing_type, instance.rent_period = Product.ListingType.SALE, ''
            attrs['listing_type'], attrs['rent_period'] = instance.listing_type, instance.rent_period
        elif instance.listing_type == Product.ListingType.SALE:
            instance.rent_period = attrs['rent_period'] = ''

        if not self.instance and not attrs.get('uploaded_images'):
            raise serializers.ValidationError({'uploaded_images': 'Add at least one photo.'})

        try:
            instance.clean()
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.message_dict)
        return attrs

    def _save_images(self, product, images):
        has_primary = product.images.filter(is_primary=True).exists()
        start = product.images.count()
        for i, image in enumerate(images):
            ProductImage.objects.create(
                product=product, image=image, sort_order=start + i, is_primary=not has_primary and i == 0,
            )

    def create(self, validated_data):
        images = validated_data.pop('uploaded_images', [])
        product = Product.objects.create(
            seller=self.context['request'].user, status=Product.Status.PENDING, **validated_data
        )
        self._save_images(product, images)
        return product

    def update(self, instance, validated_data):
        images = validated_data.pop('uploaded_images', [])
        # A rejected listing goes back to the approval queue once it is edited.
        if instance.status == Product.Status.REJECTED:
            instance.status, instance.rejection_reason = Product.Status.PENDING, ''
        instance = super().update(instance, validated_data)
        self._save_images(instance, images)
        return instance


class SellerReviewSerializer(serializers.ModelSerializer):
    reviewer_name = serializers.CharField(source='reviewer.__str__', read_only=True)
    verified_purchase = serializers.SerializerMethodField()

    class Meta:
        model = SellerReview
        fields = ('id', 'seller', 'reviewer_name', 'rating', 'comment', 'verified_purchase',
                  'seller_reply', 'replied_at', 'created_at', 'updated_at')
        read_only_fields = ('seller', 'seller_reply', 'replied_at')

    def get_verified_purchase(self, review) -> bool:
        return review.order_id is not None


class ReviewReplySerializer(serializers.Serializer):
    reply = serializers.CharField(max_length=1000, allow_blank=True)


class ListingReportSerializer(serializers.ModelSerializer):
    class Meta:
        model = ListingReport
        fields = ('reason', 'details')
