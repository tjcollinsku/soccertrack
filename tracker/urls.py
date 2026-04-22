from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register(r'teams', views.TeamViewSet)
router.register(r'players', views.PlayerViewSet)
router.register(r'games', views.GameViewSet)
router.register(r'slots', views.PlayerGameSlotViewSet)
router.register(r'stats', views.StatEventViewSet)

urlpatterns = [
    path('', include(router.urls)),
]
