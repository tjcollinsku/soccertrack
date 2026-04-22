from django.db import migrations


def seed_teams_and_backfill(apps, schema_editor):
    Team = apps.get_model('tracker', 'Team')
    Player = apps.get_model('tracker', 'Player')
    Game = apps.get_model('tracker', 'Game')

    default_team, _ = Team.objects.get_or_create(
        slug='warrior-sc-g10',
        defaults={'name': 'Warrior SC G10'},
    )
    Team.objects.get_or_create(
        slug='warrior-sc-b11-elite',
        defaults={'name': 'Warrior SC B11 Elite'},
    )

    Player.objects.filter(team__isnull=True).update(team=default_team)
    Game.objects.filter(team__isnull=True).update(team=default_team)


def unseed(apps, schema_editor):
    # Reverse: clear team FKs. Leave Team rows in place — safe no-op if they hold other data.
    Player = apps.get_model('tracker', 'Player')
    Game = apps.get_model('tracker', 'Game')
    Player.objects.all().update(team=None)
    Game.objects.all().update(team=None)


class Migration(migrations.Migration):

    dependencies = [
        ('tracker', '0004_team'),
    ]

    operations = [
        migrations.RunPython(seed_teams_and_backfill, unseed),
    ]
