from collections import Counter, defaultdict

from rest_framework import viewsets, status, serializers as drf_serializers
from rest_framework.decorators import action
from rest_framework.response import Response
from drf_spectacular.utils import extend_schema, inline_serializer

from .models import Game, Player, PlayerGameSlot, StatEvent, Team, STAT_ROLLUP
from .serializers import (
    GameSerializer,
    MoveSlotSerializer,
    PlayerGameSlotSerializer,
    PlayerSerializer,
    StartLineupSerializer,
    StatEventSerializer,
    TeamSerializer,
    UndoStatSerializer,
)


class TeamViewSet(viewsets.ModelViewSet):
    """CRUD for teams."""
    queryset = Team.objects.all()
    serializer_class = TeamSerializer


class PlayerViewSet(viewsets.ModelViewSet):
    """CRUD for roster + /api/players/{id}/minutes/?game={game_id}"""
    queryset = Player.objects.all()
    serializer_class = PlayerSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        team_id = self.request.query_params.get('team')
        if team_id:
            qs = qs.filter(team_id=team_id)
        return qs

    @extend_schema(responses={200: inline_serializer('SeasonStatsResponse', fields={
        'players': drf_serializers.ListField(),
    })})
    @action(detail=False, methods=['get'], url_path='season_stats')
    def season_stats(self, request):
        players = Player.objects.all()
        team_id = request.query_params.get('team')
        if team_id:
            players = players.filter(team_id=team_id)
        all_events = StatEvent.objects.all()
        all_slots = PlayerGameSlot.objects.all()
        if team_id:
            all_events = all_events.filter(player__team_id=team_id)
            all_slots = all_slots.filter(player__team_id=team_id)
        games_played = {}
        for slot in all_slots:
            games_played.setdefault(slot.player_id, set()).add(slot.game_id)

        result = []
        for player in players:
            player_events = all_events.filter(player=player)
            counts = StatEvent.rollup_counts(player_events)
            total_minutes = 0
            for game_id in games_played.get(player.id, set()):
                game = Game.objects.get(pk=game_id)
                mins = PlayerGameSlot.minutes_played(game, player)
                total_minutes += int(mins.total_seconds() / 60)

            pa = counts.get('Pa', 0)
            cm = counts.get('Cm', 0)
            sh = counts.get('Sh', 0)
            fr = counts.get('Fr', 0)
            dr = counts.get('Dr', 0)
            dw = counts.get('Dw', 0)

            # Build per-position aggregation across all games
            pos_agg = defaultdict(lambda: {'minutes': 0, 'events': []})
            player_slots = all_slots.filter(player=player)
            for slot in player_slots:
                pos = slot.position
                end = slot.time_off if slot.time_off is not None else None
                slot_mins = int((end - slot.time_on).total_seconds() / 60) if end else 0
                pos_agg[pos]['minutes'] += slot_mins
                slot_events = StatEvent.stats_during_slot(slot)
                pos_agg[pos]['events'].extend(
                    slot_events.values_list('stat_type', flat=True)
                )

            positions = []
            for pos, data in sorted(pos_agg.items()):
                raw_counts = Counter(data['events'])
                expanded = {}
                for st, cnt in raw_counts.items():
                    expanded[st] = expanded.get(st, 0) + cnt
                    for implied in STAT_ROLLUP.get(st, []):
                        expanded[implied] = expanded.get(implied, 0) + cnt
                s_pa = expanded.get('Pa', 0)
                s_cm = expanded.get('Cm', 0)
                s_sh = expanded.get('Sh', 0)
                s_fr = expanded.get('Fr', 0)
                s_dr = expanded.get('Dr', 0)
                s_dw = expanded.get('Dw', 0)
                positions.append({
                    'position': pos,
                    'minutes': data['minutes'],
                    **expanded,
                    'pass_completion': round(s_cm / s_pa * 100, 1) if s_pa else 0.0,
                    'dribble_success': round(s_dw / s_dr * 100, 1) if s_dr else 0.0,
                    'shot_accuracy': round(s_fr / s_sh * 100, 1) if s_sh else 0.0,
                })

            result.append({
                'player_id': player.id,
                'name': player.name,
                'jersey_number': player.jersey_number,
                'games_played': len(games_played.get(player.id, set())),
                'minutes_played': total_minutes,
                **counts,
                'pass_completion': round(cm / pa * 100, 1) if pa else 0.0,
                'dribble_success': round(dw / dr * 100, 1) if dr else 0.0,
                'shot_accuracy': round(fr / sh * 100, 1) if sh else 0.0,
                'positions': positions,
            })

        result.sort(key=lambda r: r['jersey_number'])
        return Response({'players': result})

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

    def get_queryset(self):
        qs = super().get_queryset()
        team_id = self.request.query_params.get('team')
        if team_id:
            qs = qs.filter(team_id=team_id)
        return qs

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

    @extend_schema(responses={200: inline_serializer('GameStatsResponse', fields={
        'game_id': drf_serializers.IntegerField(),
        'players': drf_serializers.ListField(),
    })})
    @action(detail=True, methods=['get'])
    def stats(self, request, pk=None):
        game = self.get_object()
        slots = PlayerGameSlot.objects.filter(game=game).select_related('player')
        player_ids = set(slots.values_list('player_id', flat=True))
        players = Player.objects.filter(id__in=player_ids)
        events = StatEvent.objects.filter(game=game)

        clock_param = request.query_params.get('clock')
        clock_now = None
        if clock_param:
            parts = clock_param.split(':')
            from datetime import timedelta
            clock_now = timedelta(
                hours=int(parts[0]) if len(parts) > 2 else 0,
                minutes=int(parts[-2]),
                seconds=int(parts[-1]),
            )

        result = []
        for player in players:
            player_events = events.filter(player=player)
            counts = StatEvent.rollup_counts(player_events)
            minutes = PlayerGameSlot.minutes_played(game, player, clock_now=clock_now)
            minutes_val = int(minutes.total_seconds() / 60)

            pa = counts.get('Pa', 0)
            cm = counts.get('Cm', 0)
            sh = counts.get('Sh', 0)
            fr = counts.get('Fr', 0)
            dr = counts.get('Dr', 0)
            dw = counts.get('Dw', 0)

            # Build per-position breakdown
            player_slots = slots.filter(player=player)
            positions = []
            for slot in player_slots:
                slot_events = StatEvent.stats_during_slot(slot)
                slot_counts = StatEvent.rollup_counts(slot_events)
                end = slot.time_off if slot.time_off is not None else clock_now
                slot_mins = int((end - slot.time_on).total_seconds() / 60) if end else 0
                s_pa = slot_counts.get('Pa', 0)
                s_cm = slot_counts.get('Cm', 0)
                s_sh = slot_counts.get('Sh', 0)
                s_fr = slot_counts.get('Fr', 0)
                s_dr = slot_counts.get('Dr', 0)
                s_dw = slot_counts.get('Dw', 0)
                positions.append({
                    'position': slot.position,
                    'minutes': slot_mins,
                    **slot_counts,
                    'pass_completion': round(s_cm / s_pa * 100, 1) if s_pa else 0.0,
                    'dribble_success': round(s_dw / s_dr * 100, 1) if s_dr else 0.0,
                    'shot_accuracy': round(s_fr / s_sh * 100, 1) if s_sh else 0.0,
                })

            result.append({
                'player_id': player.id,
                'name': player.name,
                'jersey_number': player.jersey_number,
                'minutes_played': minutes_val,
                **counts,
                'pass_completion': round(cm / pa * 100, 1) if pa else 0.0,
                'dribble_success': round(dw / dr * 100, 1) if dr else 0.0,
                'shot_accuracy': round(fr / sh * 100, 1) if sh else 0.0,
                'positions': positions,
            })

        result.sort(key=lambda r: r['jersey_number'])
        return Response({'game_id': game.id, 'players': result})

    @extend_schema(
        request=StartLineupSerializer,
        responses={201: inline_serializer('StartLineupResponse', fields={
            'detail': drf_serializers.CharField(),
            'count': drf_serializers.IntegerField(),
        })},
    )
    @action(detail=True, methods=['post'], url_path='start_lineup')
    def start_lineup(self, request, pk=None):
        game = self.get_object()
        serializer = StartLineupSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        entries = serializer.validated_data['lineup']

        if len(entries) != 11:
            return Response(
                {'detail': 'Exactly 11 players required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        positions = [e['position'] for e in entries]
        if len(set(positions)) != 11:
            return Response(
                {'detail': 'Each position must be unique.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        player_ids = [e['player_id'].id for e in entries]
        if len(set(player_ids)) != 11:
            return Response(
                {'detail': 'Each player must be unique.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        foreign = [e['player_id'] for e in entries if e['player_id'].team_id != game.team_id]
        if foreign:
            return Response(
                {'detail': f'Player(s) not on this game\'s team: {", ".join(str(p) for p in foreign)}.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if game.slots.filter(time_off__isnull=True).exists():
            return Response(
                {'detail': 'Lineup already set. Clear existing slots first.'},
                status=status.HTTP_409_CONFLICT,
            )

        from datetime import timedelta
        slots = []
        for entry in entries:
            slots.append(PlayerGameSlot(
                game=game,
                player=entry['player_id'],
                position=entry['position'],
                time_on=timedelta(0),
            ))
        PlayerGameSlot.objects.bulk_create(slots)
        return Response({'detail': 'Lineup set.', 'count': len(slots)}, status=status.HTTP_201_CREATED)

    @extend_schema(
        request=inline_serializer('EndGameRequest', fields={
            'final_time': drf_serializers.CharField(),
        }),
        responses={200: inline_serializer('EndGameResponse', fields={
            'detail': drf_serializers.CharField(),
            'closed': drf_serializers.IntegerField(),
        })},
    )
    @action(detail=True, methods=['post'], url_path='end_game')
    def end_game(self, request, pk=None):
        game = self.get_object()
        final_time = request.data.get('final_time', '00:00:00')
        parts = final_time.split(':')
        from datetime import timedelta
        duration = timedelta(
            hours=int(parts[0]) if len(parts) > 2 else 0,
            minutes=int(parts[-2]),
            seconds=int(parts[-1]),
        )
        closed = PlayerGameSlot.objects.filter(
            game=game, time_off__isnull=True,
        ).update(time_off=duration)
        return Response({'detail': 'Game ended.', 'closed': closed})

    @extend_schema(responses={200: inline_serializer('LineupResponse', fields={
        'on_field': PlayerGameSlotSerializer(many=True),
        'bench': PlayerSerializer(many=True),
    })})
    @action(detail=True, methods=['get'])
    def lineup(self, request, pk=None):
        game = self.get_object()
        on_field = PlayerGameSlot.objects.filter(
            game=game, time_off__isnull=True,
        ).select_related('player')
        on_field_ids = set(on_field.values_list('player_id', flat=True))
        all_players = Player.objects.filter(team=game.team)
        bench = [p for p in all_players if p.id not in on_field_ids]

        return Response({
            'on_field': PlayerGameSlotSerializer(on_field, many=True).data,
            'bench': PlayerSerializer(bench, many=True).data,
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

    @extend_schema(
        request=MoveSlotSerializer,
        responses={200: inline_serializer('MoveResponse', fields={
            'current_slot': PlayerGameSlotSerializer(allow_null=True),
        })},
    )
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

    @extend_schema(
        request=UndoStatSerializer,
        responses={200: inline_serializer('UndoResponse', fields={
            'deleted': drf_serializers.BooleanField(),
        })},
    )
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
