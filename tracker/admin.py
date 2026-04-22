from django.contrib import admin

from .models import Player, Game, PlayerGameSlot, StatEvent, Team


@admin.register(Team)
class TeamAdmin(admin.ModelAdmin):
    list_display = ('name', 'slug', 'created_at')
    search_fields = ('name', 'slug')
    prepopulated_fields = {'slug': ('name',)}


@admin.register(Player)
class PlayerAdmin(admin.ModelAdmin):
    list_display = ('jersey_number', 'name', 'team')
    list_filter = ('team',)
    ordering = ('team', 'jersey_number')
    search_fields = ('name', 'jersey_number')


@admin.register(Game)
class GameAdmin(admin.ModelAdmin):
    list_display = ('date', 'opponent', 'location', 'team')
    list_filter = ('team', 'location')
    ordering = ('-date',)


@admin.register(PlayerGameSlot)
class PlayerGameSlotAdmin(admin.ModelAdmin):
    list_display = ('game', 'player', 'position', 'time_on', 'time_off')
    list_filter = ('game', 'position')
    autocomplete_fields = ('player',)


@admin.register(StatEvent)
class StatEventAdmin(admin.ModelAdmin):
    list_display = ('game', 'player', 'stat_type', 'game_time', 'created_at')
    list_filter = ('game', 'stat_type')
    autocomplete_fields = ('player',)
    readonly_fields = ('created_at',)
