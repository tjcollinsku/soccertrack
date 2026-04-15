from rest_framework import serializers

from .models import Player, Game, PlayerGameSlot, StatEvent


class PlayerSerializer(serializers.ModelSerializer):
    class Meta:
        model = Player
        fields = ['id', 'name', 'jersey_number']


class GameSerializer(serializers.ModelSerializer):
    class Meta:
        model = Game
        fields = ['id', 'date', 'opponent', 'location']


class PlayerGameSlotSerializer(serializers.ModelSerializer):
    # Nested player object on read, plain FK on write.
    player = PlayerSerializer(read_only=True)
    player_id = serializers.PrimaryKeyRelatedField(
        queryset=Player.objects.all(), source='player', write_only=True,
    )

    class Meta:
        model = PlayerGameSlot
        fields = ['id', 'game', 'player', 'player_id', 'position', 'time_on', 'time_off']


class StatEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = StatEvent
        fields = ['id', 'game', 'player', 'stat_type', 'game_time', 'created_at']
        read_only_fields = ['created_at']


# --- Action-input serializers (not backed by a model) ---

class MoveSlotSerializer(serializers.Serializer):
    """Input for POST /api/slots/move/. Wraps PlayerGameSlot.move_player."""
    game = serializers.PrimaryKeyRelatedField(queryset=Game.objects.all())
    player = serializers.PrimaryKeyRelatedField(queryset=Player.objects.all())
    new_position = serializers.ChoiceField(
        choices=PlayerGameSlot.POSITIONS,
        allow_null=True, required=False, default=None,
    )
    at_time = serializers.DurationField()


class UndoStatSerializer(serializers.Serializer):
    """Input for POST /api/stats/undo/. Wraps StatEvent.undo_last."""
    game = serializers.PrimaryKeyRelatedField(queryset=Game.objects.all())
    player = serializers.PrimaryKeyRelatedField(queryset=Player.objects.all())
    stat_type = serializers.ChoiceField(choices=StatEvent.STAT_CHOICES)
