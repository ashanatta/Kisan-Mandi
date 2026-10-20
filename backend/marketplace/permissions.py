from rest_framework.permissions import BasePermission


class IsSeller(BasePermission):
    """Sellers and platform admins can manage listings."""

    message = 'Only sellers can manage listings. Switch your account to a seller account first.'

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and (user.is_seller or user.is_platform_admin))
