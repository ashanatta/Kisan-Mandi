"""
URL configuration for config project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/6.1/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

from accounts.views import verification_photo

admin.site.site_header = 'Agri Shop Admin'
admin.site.site_title = 'Agri Shop Admin'

urlpatterns = [
    # Admin-only CNIC photo viewer (must come before the admin catch-all)
    path('admin/verification/<int:pk>/<str:side>/', verification_photo, name='verification-photo'),
    path('admin/', admin.site.urls),
    path('api/auth/', include('accounts.urls')),
    path('api/tracker/', include('tracker.urls')),
    path('api/insights/', include('insights.urls')),
    path('api/community/', include('community.urls')),
    path('api/payments/', include('payments.urls')),
    path('api/conversations/', include('chat.urls')),
    path('api/', include('marketplace.urls')),
    path('api/', include('orders.urls')),

    # API documentation
    path('api/schema/', SpectacularAPIView.as_view(), name='schema'),
    path('api/docs/', SpectacularSwaggerView.as_view(url_name='schema'), name='swagger-ui'),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
