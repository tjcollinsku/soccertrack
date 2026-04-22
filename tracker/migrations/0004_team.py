from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('tracker', '0003_alter_statevent_stat_type'),
    ]

    operations = [
        migrations.CreateModel(
            name='Team',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=120, unique=True)),
                ('slug', models.SlugField(max_length=140, unique=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
            ],
            options={'ordering': ['name']},
        ),
        migrations.AddField(
            model_name='player',
            name='team',
            field=models.ForeignKey(
                null=True,
                on_delete=models.CASCADE,
                related_name='players',
                to='tracker.team',
            ),
        ),
        migrations.AddField(
            model_name='game',
            name='team',
            field=models.ForeignKey(
                null=True,
                on_delete=models.CASCADE,
                related_name='games',
                to='tracker.team',
            ),
        ),
    ]
