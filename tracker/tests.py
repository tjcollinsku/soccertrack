from datetime import date, timedelta

from django.db import IntegrityError, transaction
from django.test import TestCase
from rest_framework.test import APIClient

from .models import Game, Player, PlayerGameSlot, StatEvent, Team


def mmss(minutes, seconds=0):
    """Shorthand: mmss(34, 22) → timedelta of 34:22."""
    return timedelta(minutes=minutes, seconds=seconds)


def make_team(name='Warriors', slug='warriors'):
    return Team.objects.create(name=name, slug=slug)


class MovePlayerTests(TestCase):
    def setUp(self):
        self.team = make_team()
        self.game = Game.objects.create(team=self.team, date=date(2026, 4, 20), opponent='Tipp City')
        self.alice = Player.objects.create(team=self.team, name='Alice', jersey_number=7)
        self.bob = Player.objects.create(team=self.team, name='Bob', jersey_number=9)

    def test_move_closes_previous_slot_and_opens_new_one(self):
        PlayerGameSlot.move_player(self.game, self.alice, 'LM', mmss(0))
        PlayerGameSlot.move_player(self.game, self.alice, 'LW', mmss(30))

        slots = PlayerGameSlot.objects.filter(player=self.alice).order_by('time_on')
        self.assertEqual(slots.count(), 2)

        lm, lw = slots[0], slots[1]
        self.assertEqual(lm.position, 'LM')
        self.assertEqual(lm.time_off, mmss(30))
        self.assertEqual(lw.position, 'LW')
        self.assertIsNone(lw.time_off)

    def test_move_to_bench_closes_without_opening(self):
        PlayerGameSlot.move_player(self.game, self.alice, 'LM', mmss(0))
        PlayerGameSlot.move_player(self.game, self.alice, None, mmss(40))

        slots = PlayerGameSlot.objects.filter(player=self.alice)
        self.assertEqual(slots.count(), 1)
        self.assertEqual(slots[0].time_off, mmss(40))


class UniquenessTests(TestCase):
    def setUp(self):
        self.team = make_team()
        self.game = Game.objects.create(team=self.team, date=date(2026, 4, 20), opponent='Tipp City')
        self.alice = Player.objects.create(team=self.team, name='Alice', jersey_number=7)
        self.bob = Player.objects.create(team=self.team, name='Bob', jersey_number=9)

    def test_two_active_players_at_same_position_rejected(self):
        PlayerGameSlot.objects.create(
            game=self.game, player=self.alice, position='LW', time_on=mmss(0),
        )
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                PlayerGameSlot.objects.create(
                    game=self.game, player=self.bob, position='LW', time_on=mmss(0),
                )

    def test_same_player_in_two_active_slots_rejected(self):
        PlayerGameSlot.objects.create(
            game=self.game, player=self.alice, position='LW', time_on=mmss(0),
        )
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                PlayerGameSlot.objects.create(
                    game=self.game, player=self.alice, position='LM', time_on=mmss(0),
                )

    def test_closed_slot_does_not_block_new_slot_at_same_position(self):
        # Alice plays LW from 0:00 to 30:00, then Bob plays LW from 30:00.
        # Both slots are in the same (game, position), which is fine because
        # only one is active at a time.
        PlayerGameSlot.objects.create(
            game=self.game, player=self.alice,
            position='LW', time_on=mmss(0), time_off=mmss(30),
        )
        PlayerGameSlot.objects.create(
            game=self.game, player=self.bob,
            position='LW', time_on=mmss(30),
        )
        self.assertEqual(PlayerGameSlot.objects.count(), 2)


class MinutesPlayedTests(TestCase):
    def setUp(self):
        self.team = make_team()
        self.game = Game.objects.create(team=self.team, date=date(2026, 4, 20), opponent='Tipp City')
        self.alice = Player.objects.create(team=self.team, name='Alice', jersey_number=7)

    def test_sums_closed_slots(self):
        PlayerGameSlot.objects.create(
            game=self.game, player=self.alice,
            position='LM', time_on=mmss(0), time_off=mmss(20),
        )
        PlayerGameSlot.objects.create(
            game=self.game, player=self.alice,
            position='LW', time_on=mmss(30), time_off=mmss(45),
        )
        total = PlayerGameSlot.minutes_played(self.game, self.alice)
        self.assertEqual(total, mmss(35))  # 20 + 15

    def test_open_slot_uses_clock_now(self):
        PlayerGameSlot.objects.create(
            game=self.game, player=self.alice,
            position='LM', time_on=mmss(0),  # still on the field
        )
        total = PlayerGameSlot.minutes_played(self.game, self.alice, clock_now=mmss(50))
        self.assertEqual(total, mmss(50))

    def test_minutes_at_position_filters_correctly(self):
        PlayerGameSlot.objects.create(
            game=self.game, player=self.alice,
            position='LM', time_on=mmss(0), time_off=mmss(20),
        )
        PlayerGameSlot.objects.create(
            game=self.game, player=self.alice,
            position='LW', time_on=mmss(20), time_off=mmss(35),
        )
        self.assertEqual(
            PlayerGameSlot.minutes_at_position(self.game, self.alice, 'LM'),
            mmss(20),
        )
        self.assertEqual(
            PlayerGameSlot.minutes_at_position(self.game, self.alice, 'LW'),
            mmss(15),
        )


class StatEventTests(TestCase):
    def setUp(self):
        self.team = make_team()
        self.game = Game.objects.create(team=self.team, date=date(2026, 4, 20), opponent='Tipp City')
        self.alice = Player.objects.create(team=self.team, name='Alice', jersey_number=7)

    def test_undo_last_deletes_most_recent(self):
        first = StatEvent.objects.create(
            game=self.game, player=self.alice, stat_type='Pa', game_time=mmss(10),
        )
        second = StatEvent.objects.create(
            game=self.game, player=self.alice, stat_type='Pa', game_time=mmss(20),
        )
        self.assertTrue(StatEvent.undo_last(self.game, self.alice, 'Pa'))
        remaining = list(StatEvent.objects.all())
        self.assertEqual(remaining, [first])

    def test_undo_last_returns_false_when_nothing_to_undo(self):
        self.assertFalse(StatEvent.undo_last(self.game, self.alice, 'Gl'))

    def test_rollup_counts_expands_hierarchy(self):
        # 1 goal, 1 on-frame miss, 1 shot off-frame → 3 shots, 2 on-frame, 1 goal
        StatEvent.objects.create(game=self.game, player=self.alice, stat_type='Gl', game_time=mmss(10))
        StatEvent.objects.create(game=self.game, player=self.alice, stat_type='Fr', game_time=mmss(20))
        StatEvent.objects.create(game=self.game, player=self.alice, stat_type='Sh', game_time=mmss(30))
        # 2 completed passes + 1 incomplete → 3 passes, 2 completed
        StatEvent.objects.create(game=self.game, player=self.alice, stat_type='Cm', game_time=mmss(5))
        StatEvent.objects.create(game=self.game, player=self.alice, stat_type='Cm', game_time=mmss(6))
        StatEvent.objects.create(game=self.game, player=self.alice, stat_type='Pa', game_time=mmss(7))
        # 1 dribble won, 1 dribble lost → 2 dribbles, 1 won
        StatEvent.objects.create(game=self.game, player=self.alice, stat_type='Dw', game_time=mmss(40))
        StatEvent.objects.create(game=self.game, player=self.alice, stat_type='Dr', game_time=mmss(41))
        # 1 tackle (standalone)
        StatEvent.objects.create(game=self.game, player=self.alice, stat_type='Tk', game_time=mmss(50))

        counts = StatEvent.rollup_counts(StatEvent.objects.all())
        self.assertEqual(counts['Gl'], 1)
        self.assertEqual(counts['Fr'], 2)  # Gl + explicit Fr
        self.assertEqual(counts['Sh'], 3)  # Gl + Fr + explicit Sh
        self.assertEqual(counts['Cm'], 2)
        self.assertEqual(counts['Pa'], 3)  # 2 Cm + 1 explicit Pa
        self.assertEqual(counts['Dw'], 1)
        self.assertEqual(counts['Dr'], 2)  # 1 Dw + 1 explicit Dr
        self.assertEqual(counts['Tk'], 1)

    def test_stats_during_slot_filters_by_time_range(self):
        slot = PlayerGameSlot.objects.create(
            game=self.game, player=self.alice,
            position='LW', time_on=mmss(10), time_off=mmss(30),
        )
        # Outside (before)
        StatEvent.objects.create(game=self.game, player=self.alice, stat_type='Pa', game_time=mmss(5))
        # Inside
        during = StatEvent.objects.create(game=self.game, player=self.alice, stat_type='Pa', game_time=mmss(15))
        # Outside (at time_off boundary, excluded since range is [on, off))
        StatEvent.objects.create(game=self.game, player=self.alice, stat_type='Pa', game_time=mmss(30))
        # Outside (after)
        StatEvent.objects.create(game=self.game, player=self.alice, stat_type='Pa', game_time=mmss(40))

        in_slot = list(StatEvent.stats_during_slot(slot))
        self.assertEqual(in_slot, [during])


class APITests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.team = make_team()
        self.game = Game.objects.create(team=self.team, date=date(2026, 4, 20), opponent='Tipp City')
        self.alice = Player.objects.create(team=self.team, name='Alice', jersey_number=7)

    def test_list_players(self):
        resp = self.client.get('/api/players/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.json()), 1)
        self.assertEqual(resp.json()[0]['name'], 'Alice')

    def test_create_game(self):
        resp = self.client.post('/api/games/', {
            'team': self.team.id,
            'date': '2026-05-01', 'opponent': 'Troy', 'location': 'away',
        })
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(Game.objects.count(), 2)

    def test_move_slot_action(self):
        resp = self.client.post('/api/slots/move/', {
            'game': self.game.id, 'player': self.alice.id,
            'new_position': 'LW', 'at_time': '00:00',
        }, format='json')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()['current_slot']['position'], 'LW')

        # Move her to LM
        resp = self.client.post('/api/slots/move/', {
            'game': self.game.id, 'player': self.alice.id,
            'new_position': 'LM', 'at_time': '00:30',
        }, format='json')
        self.assertEqual(resp.json()['current_slot']['position'], 'LM')
        self.assertEqual(PlayerGameSlot.objects.count(), 2)

    def test_undo_stat_action(self):
        StatEvent.objects.create(
            game=self.game, player=self.alice, stat_type='Pa', game_time=timedelta(minutes=10),
        )
        resp = self.client.post('/api/stats/undo/', {
            'game': self.game.id, 'player': self.alice.id, 'stat_type': 'Pa',
        }, format='json')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(StatEvent.objects.count(), 0)

    def test_undo_stat_when_none_exists_returns_404(self):
        resp = self.client.post('/api/stats/undo/', {
            'game': self.game.id, 'player': self.alice.id, 'stat_type': 'Gl',
        }, format='json')
        self.assertEqual(resp.status_code, 404)

    def test_game_rollup(self):
        StatEvent.objects.create(game=self.game, player=self.alice, stat_type='Gl', game_time=timedelta(minutes=10))
        StatEvent.objects.create(game=self.game, player=self.alice, stat_type='Cm', game_time=timedelta(minutes=20))
        resp = self.client.get(f'/api/games/{self.game.id}/rollup/')
        self.assertEqual(resp.status_code, 200)
        counts = resp.json()['counts']
        self.assertEqual(counts['Gl'], 1)
        self.assertEqual(counts['Sh'], 1)  # rolled up from Gl
        self.assertEqual(counts['Pa'], 1)  # rolled up from Cm


class TeamScopingTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.team_a = Team.objects.create(name='Team A', slug='team-a')
        self.team_b = Team.objects.create(name='Team B', slug='team-b')
        self.a7 = Player.objects.create(team=self.team_a, name='Alice', jersey_number=7)
        self.b7 = Player.objects.create(team=self.team_b, name='Ben', jersey_number=7)
        self.game_a = Game.objects.create(team=self.team_a, date=date(2026, 4, 20), opponent='Tipp City')
        self.game_b = Game.objects.create(team=self.team_b, date=date(2026, 4, 20), opponent='Troy')

    def test_same_jersey_number_allowed_on_different_teams(self):
        # Already created in setUp — just confirm both exist
        self.assertEqual(
            Player.objects.filter(jersey_number=7).count(), 2,
        )

    def test_duplicate_jersey_on_same_team_rejected(self):
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                Player.objects.create(team=self.team_a, name='Amy', jersey_number=7)

    def test_player_list_filters_by_team(self):
        resp = self.client.get(f'/api/players/?team={self.team_a.id}')
        self.assertEqual(resp.status_code, 200)
        names = [p['name'] for p in resp.json()]
        self.assertEqual(names, ['Alice'])

    def test_game_list_filters_by_team(self):
        resp = self.client.get(f'/api/games/?team={self.team_b.id}')
        self.assertEqual(resp.status_code, 200)
        opponents = [g['opponent'] for g in resp.json()]
        self.assertEqual(opponents, ['Troy'])

    def test_stat_rejected_when_player_and_game_on_different_teams(self):
        # game_a belongs to team_a; b7 belongs to team_b
        resp = self.client.post('/api/stats/', {
            'game': self.game_a.id, 'player': self.b7.id,
            'stat_type': 'Pa', 'game_time': '00:10:00',
        }, format='json')
        self.assertEqual(resp.status_code, 400)

    def test_start_lineup_rejects_cross_team_player(self):
        # Build 10 team_a players + 1 team_b player into a lineup for game_a
        for n in range(1, 11):
            Player.objects.create(team=self.team_a, name=f'P{n}', jersey_number=n + 10)
        team_a_players = list(Player.objects.filter(team=self.team_a))
        positions = ['GK', 'LB', 'CB1', 'CB2', 'RB', 'LM', 'CM', 'RM', 'LW', 'ST']
        lineup = [{'player_id': p.id, 'position': pos}
                  for p, pos in zip(team_a_players[:10], positions)]
        lineup.append({'player_id': self.b7.id, 'position': 'RW'})  # cross-team

        resp = self.client.post(
            f'/api/games/{self.game_a.id}/start_lineup/',
            {'lineup': lineup}, format='json',
        )
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(PlayerGameSlot.objects.count(), 0)
