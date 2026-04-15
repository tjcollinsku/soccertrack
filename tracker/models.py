from collections import Counter
from datetime import timedelta

from django.db import models
from django.db.models import Q


# Stat hierarchy: logging a key implies logging each value.
# Click "Goal" → one Gl row. Shot totals = count of Sh + Fr + Gl.
STAT_ROLLUP = {
    'Cm': ['Pa'],
    'Gl': ['Fr', 'Sh'],
    'Fr': ['Sh'],
    'Dw': ['Dr'],
}


class Player(models.Model):
    name = models.CharField(max_length=100)
    jersey_number = models.PositiveIntegerField()

    def __str__(self):
        return f"#{self.jersey_number} {self.name}"

    class Meta:
        ordering = ['jersey_number']


class Game(models.Model):
    HOME = 'home'
    AWAY = 'away'
    LOCATION_CHOICES = [(HOME, 'Home'), (AWAY, 'Away')]

    date = models.DateField()
    opponent = models.CharField(max_length=100)
    location = models.CharField(max_length=4, choices=LOCATION_CHOICES, default=HOME)

    def __str__(self):
        return f"{self.date} vs {self.opponent} ({self.location})"

    class Meta:
        ordering = ['-date']


class PlayerGameSlot(models.Model):
    """
    One row per time a player occupies a position in a game.
    Open subbing means a player can have multiple rows per game.
    time_off=NULL means still on the field at that position.
    """
    POSITIONS = [
        ('GK',  'Goalkeeper'),
        ('LB',  'Left Back'),
        ('CB1', 'Center Back (Left)'),
        ('CB2', 'Center Back (Right)'),
        ('RB',  'Right Back'),
        ('LM',  'Left Mid'),
        ('CM',  'Center Mid'),
        ('RM',  'Right Mid'),
        ('LW',  'Left Wing'),
        ('ST',  'Striker'),
        ('RW',  'Right Wing'),
    ]

    game = models.ForeignKey(Game, on_delete=models.CASCADE, related_name='slots')
    player = models.ForeignKey(Player, on_delete=models.CASCADE, related_name='slots')
    position = models.CharField(max_length=3, choices=POSITIONS)
    time_on = models.DurationField()
    time_off = models.DurationField(blank=True, null=True)

    class Meta:
        constraints = [
            # A position can only be filled by one active player at a time.
            models.UniqueConstraint(
                fields=['game', 'position'],
                condition=Q(time_off__isnull=True),
                name='one_active_player_per_position',
            ),
            # A player can only be active in one position at a time.
            models.UniqueConstraint(
                fields=['game', 'player'],
                condition=Q(time_off__isnull=True),
                name='one_active_slot_per_player',
            ),
        ]

    def __str__(self):
        return f"{self.player} — {self.position} ({self.time_on} → {self.time_off or 'on field'})"

    @classmethod
    def move_player(cls, game, player, new_position, at_time):
        """
        Close any currently-open slot for this player, then open a new one
        at new_position. Pass new_position=None to send the player to the bench.
        """
        cls.objects.filter(
            game=game, player=player, time_off__isnull=True,
        ).update(time_off=at_time)

        if new_position is not None:
            cls.objects.create(
                game=game, player=player, position=new_position,
                time_on=at_time, time_off=None,
            )

    @classmethod
    def minutes_at_position(cls, game, player, position, clock_now=None):
        """
        Total time this player has spent at this position in this game.
        clock_now is used to compute duration for any still-open slot.
        """
        total = timedelta()
        qs = cls.objects.filter(game=game, player=player, position=position)
        for slot in qs:
            end = slot.time_off if slot.time_off is not None else clock_now
            if end is not None:
                total += end - slot.time_on
        return total

    @classmethod
    def minutes_played(cls, game, player, clock_now=None):
        """Total time this player has been on the field in this game."""
        total = timedelta()
        qs = cls.objects.filter(game=game, player=player)
        for slot in qs:
            end = slot.time_off if slot.time_off is not None else clock_now
            if end is not None:
                total += end - slot.time_on
        return total


class StatEvent(models.Model):
    """
    One row per [+] click. Deleting a row = the [-] button.
    Never edited — only inserted or deleted.
    Stat hierarchy is expanded at read time via STAT_ROLLUP.
    """
    STAT_CHOICES = [
        ('Pa', 'Pass'),
        ('Cm', 'Completed Pass'),
        ('Dr', 'Dribble'),
        ('Dw', 'Dribble Won'),
        ('Sh', 'Shot'),
        ('Fr', 'On Frame'),
        ('Gl', 'Goal'),
        ('Tk', 'Tackle'),
    ]

    game = models.ForeignKey(Game, on_delete=models.CASCADE, related_name='stat_events')
    player = models.ForeignKey(Player, on_delete=models.CASCADE, related_name='stat_events')
    stat_type = models.CharField(max_length=2, choices=STAT_CHOICES)
    game_time = models.DurationField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['game_time', 'created_at']

    def __str__(self):
        return f"{self.player} — {self.stat_type} at {self.game_time}"

    @classmethod
    def undo_last(cls, game, player, stat_type):
        """Delete the most recently inserted matching row. Returns True if deleted."""
        last = (
            cls.objects
            .filter(game=game, player=player, stat_type=stat_type)
            .order_by('-created_at')
            .first()
        )
        if last is None:
            return False
        last.delete()
        return True

    @classmethod
    def rollup_counts(cls, queryset):
        """
        Expand a StatEvent queryset into counts per stat_type, applying the
        hierarchy (a Cm also counts as a Pa, a Gl also counts as Fr and Sh).
        Returns a dict like {'Pa': 12, 'Cm': 8, 'Sh': 4, 'Fr': 3, 'Gl': 1}.
        """
        counts = Counter()
        for stat_type in queryset.values_list('stat_type', flat=True):
            counts[stat_type] += 1
            for implied in STAT_ROLLUP.get(stat_type, []):
                counts[implied] += 1
        return dict(counts)

    @classmethod
    def stats_during_slot(cls, slot):
        """All stat events for this player while they occupied this slot."""
        qs = cls.objects.filter(
            game=slot.game,
            player=slot.player,
            game_time__gte=slot.time_on,
        )
        if slot.time_off is not None:
            qs = qs.filter(game_time__lt=slot.time_off)
        return qs
