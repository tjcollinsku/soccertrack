from rest_framework import serializers

from .models import Player, Game, PlayerGameSlot, StatEvent, Team


class TeamSerializer(serializers.ModelSerializer):
    class Meta:
        model = Team
        fields = ['id', 'name', 'slug', 'created_at']
        read_only_fields = ['slug', 'created_at']

    def create(self, validated_data):
        from django.utils.text import slugify
        base = slugify(validated_data['name'])
        slug = base or 'team'
        n = 2
        while Team.objects.filter(slug=slug).exists():
            slug = f'{base}-{n}'
            n += 1
        return Team.objects.create(slug=slug, **validated_data)


class PlayerSerializer(serializers.ModelSerializer):
    class Meta:
        model = Player
        fields = ['id', 'team', 'name', 'jersey_number']


class GameSerializer(serializers.ModelSerializer):
    class Meta:
        model = Game
        fields = ['id', 'team', 'date', 'opponent', 'location']


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

    def validate(self, attrs):
        game = attrs.get('game') or getattr(self.instance, 'game', None)
        player = attrs.get('player') or getattr(self.instance, 'player', None)
        if game and player and player.team_id != game.team_id:
            raise serializers.ValidationError('Player is not on this game\'s team.')
        return attrs


# --- Action-input serializers (not backed by a model) ---

def _validate_same_team(attrs):
    game = attrs.get('game')
    player = attrs.get('player')
    if game and player and player.team_id != game.team_id:
        raise serializers.ValidationError(
            'Player is not on this game\'s team.'
        )
    return attrs


class MoveSlotSerializer(serializers.Serializer):
    """Input for POST /api/slots/move/. Wraps PlayerGameSlot.move_player."""
    game = serializers.PrimaryKeyRelatedField(queryset=Game.objects.all())
    player = serializers.PrimaryKeyRelatedField(queryset=Player.objects.all())
    new_position = serializers.ChoiceField(
        choices=PlayerGameSlot.POSITIONS,
        allow_null=True, required=False, default=None,
    )
    at_time = serializers.DurationField()

    def validate(self, attrs):
        return _validate_same_team(attrs)


class UndoStatSerializer(serializers.Serializer):
    """Input for POST /api/stats/undo/. Wraps StatEvent.undo_last."""
    game = serializers.PrimaryKeyRelatedField(queryset=Game.objects.all())
    player = serializers.PrimaryKeyRelatedField(queryset=Player.objects.all())
    stat_type = serializers.ChoiceField(choices=StatEvent.STAT_CHOICES)

    def validate(self, attrs):
        return _validate_same_team(attrs)


class LineupEntrySerializer(serializers.Serializer):
    player_id = serializers.PrimaryKeyRelatedField(queryset=Player.objects.all())
    position = serializers.ChoiceField(choices=PlayerGameSlot.POSITIONS)


class StartLineupSerializer(serializers.Serializer):
    """Input for POST /api/games/{id}/start_lineup/."""
    lineup = LineupEntrySerializer(many=True)
