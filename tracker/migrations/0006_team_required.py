from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('tracker', '0005_backfill_teams'),
    ]

    operations = [
        migrations.AlterField(
            model_name='player',
            name='team',
            field=models.ForeignKey(
                on_delete=models.CASCADE,
                related_name='players',
                to='tracker.team',
            ),
        ),
        migrations.AlterField(
            model_name='game',
            name='team',
            field=models.ForeignKey(
                on_delete=models.CASCADE,
                related_name='games',
                to='tracker.team',
            ),
        ),
        migrations.AddConstraint(
            model_name='player',
            constraint=models.UniqueConstraint(
                fields=['team', 'jersey_number'],
                name='unique_jersey_per_team',
            ),
        ),
    ]
