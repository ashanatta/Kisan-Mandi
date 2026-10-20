from django.contrib.admin.views.decorators import staff_member_required
from django.http import FileResponse, Http404
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import generics, serializers, status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView

from .models import SellerVerification
from .serializers import (
    ChangePasswordSerializer,
    LoginSerializer,
    RegisterSerializer,
    UserSerializer,
    VerificationSerializer,
    tokens_for,
)

AuthResponse = inline_serializer('AuthResponse', {
    'access': serializers.CharField(),
    'refresh': serializers.CharField(),
    'user': UserSerializer(),
})


class RegisterView(generics.CreateAPIView):
    """Create a buyer or seller account and return JWT tokens."""

    serializer_class = RegisterSerializer
    permission_classes = [AllowAny]

    @extend_schema(responses={201: AuthResponse})
    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(
            {**tokens_for(user), 'user': UserSerializer(user, context={'request': request}).data},
            status=status.HTTP_201_CREATED,
        )


class LoginView(TokenObtainPairView):
    """Log in with username **or** email and password. Returns JWT tokens and the user."""

    serializer_class = LoginSerializer

    @extend_schema(responses={200: AuthResponse})
    def post(self, request, *args, **kwargs):
        return super().post(request, *args, **kwargs)


class MeView(generics.RetrieveUpdateAPIView):
    """The logged-in user's profile."""

    serializer_class = UserSerializer
    permission_classes = [IsAuthenticated]
    http_method_names = ['get', 'patch', 'put']

    def get_object(self):
        return self.request.user


class BecomeSellerView(APIView):
    """Switch a buyer account to a seller account so it can post listings."""

    permission_classes = [IsAuthenticated]

    @extend_schema(request=None, responses=UserSerializer)
    def post(self, request):
        user = request.user
        if user.role == user.Role.BUYER:
            user.role = user.Role.SELLER
            user.save(update_fields=['role'])
        return Response(UserSerializer(user, context={'request': request}).data)


class VerificationView(APIView):
    """
    The user's CNIC verification. `GET` returns its status (`none` if never submitted).
    `POST` (multipart) submits CNIC number, name and front/back photos; allowed again after a rejection.
    """

    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    @extend_schema(responses=VerificationSerializer)
    def get(self, request):
        verification = SellerVerification.objects.filter(user=request.user).first()
        if not verification:
            return Response({'status': 'none'})
        return Response(VerificationSerializer(verification).data)

    @extend_schema(request=VerificationSerializer, responses={201: VerificationSerializer})
    def post(self, request):
        existing = SellerVerification.objects.filter(user=request.user).first()
        if existing and existing.status != SellerVerification.Status.REJECTED:
            return Response({'detail': 'Your verification is already submitted.'}, status=status.HTTP_400_BAD_REQUEST)

        serializer = VerificationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        if existing:
            # Replace the rejected attempt, removing its old photos.
            existing.cnic_front.delete(save=False)
            existing.cnic_back.delete(save=False)
            existing.delete()
        verification = serializer.save(user=request.user)
        return Response(VerificationSerializer(verification).data, status=status.HTTP_201_CREATED)


@staff_member_required
def verification_photo(request, pk, side):
    """Admin-only: stream a CNIC photo. These files are never served from /media/."""
    verification = get_object_or_404(SellerVerification, pk=pk)
    field = {'front': verification.cnic_front, 'back': verification.cnic_back}.get(side)
    if not field:
        raise Http404
    response = FileResponse(field.open('rb'))
    response['Cache-Control'] = 'private, no-store'
    return response


class ChangePasswordView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=ChangePasswordSerializer, responses={204: None})
    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        request.user.set_password(serializer.validated_data['new_password'])
        request.user.save(update_fields=['password'])
        return Response(status=status.HTTP_204_NO_CONTENT)
