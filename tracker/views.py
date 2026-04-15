from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import Game, Player, PlayerGameSlot, StatEvent
from .serializers import (
    GameSerializer,
    MoveSlotSerializer,
    PlayerGameSlotSerializer,
    PlayerSerializer,
    StatEventSerializer,
    UndoStatSerializer,
)


class PlayerViewSet(viewsets.ModelViewSet):
    """CRUD for roster + /api/players/{id}/minutes/?game={game_id}"""
    queryset = Player.objects.all()
    serializer_class = PlayerSerializer

    @action(detail=True, methods=['get'])
    def minutes(self, request, pk=None):
        player = self.get_object()
        game_id = request.query_params.get('game')
        if not game_id:
            return Response(
                {'detail': 'Query parameter "game" is required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            game = Game.objects.get(pk=game_id)
        except Game.DoesNotExist:
            return Response({'detail': 'Game not found.'}, status=status.HTTP_404_NOT_FOUND)

        total = PlayerGameSlot.minutes_played(game, player)
        return Response({
            'player_id': player.id,
            'game_id': game.id,
            'minutes_played_seconds': int(total.total_seconds()),
        })


class GameViewSet(viewsets.ModelViewSet):
    """CRUD for games + /api/games/{id}/rollup/ for stat totals."""
    queryset = Game.objects.all()
    serializer_class = GameSerializer

    @action(detail=True, methods=['get'])
    def rollup(self, request, pk=None):
        game = self.get_object()
        qs = StatEvent.objects.filter(game=game)
        player_id = request.query_params.get('player')
        if player_id:
            qs = qs.filter(player_id=player_id)
        counts = StatEvent.rollup_counts(qs)
        return Response({
            'game_id': game.id,
            'player_id': int(player_id) if player_id else None,
            'counts': counts,
        })


class PlayerGameSlotViewSet(viewsets.ModelViewSet):
    """CRUD for lineup/subbing slots + POST /api/slots/move/."""
    queryset = PlayerGameSlot.objects.all()
    serializer_class = PlayerGameSlotSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        game_id = self.request.query_params.get('game')
        if game_id:
            qs = qs.filter(game_id=game_id)
        return qs

    @action(detail=False, methods=['post'])
    def move(self, request):
        serializer = MoveSlotSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        PlayerGameSlot.move_player(
            game=data['game'],
            player=data['player'],
            new_position=data.get('new_position'),
            at_time=data['at_time'],
        )
        # Return the player's currently-open slot (or null if benched).
        current = PlayerGameSlot.objects.filter(
            game=data['game'], player=data['player'], time_off__isnull=True,
        ).first()
        out = PlayerGameSlotSerializer(current).data if current else None
        return Response({'current_slot': out}, status=status.HTTP_200_OK)


class StatEventViewSet(viewsets.ModelViewSet):
    """CRUD for stat events + POST /api/stats/undo/."""
    queryset = StatEvent.objects.all()
    serializer_class = StatEventSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        game_id = self.request.query_params.get('game')
        player_id = self.request.query_params.get('player')
        if game_id:
            qs = qs.filter(game_id=game_id)
        if player_id:
            qs = qs.filter(player_id=player_id)
        return qs

    @action(detail=False, methods=['post'])
    def undo(self, request):
        serializer = UndoStatSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        deleted = StatEvent.undo_last(
            game=data['game'], player=data['player'], stat_type=data['stat_type'],
        )
        if not deleted:
            return Response(
                {'detail': 'No matching stat event to undo.'},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response({'deleted': True}, status=status.HTTP_200_OK)
