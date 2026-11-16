from django.db import migrations, models


def mark(apps, schema_editor):
    # until now a game without a pod was always a practice game
    apps.get_model("games", "Game").objects.filter(pod=None).update(practice=True)


class Migration(migrations.Migration):

    dependencies = [("games", "0002_practice")]

    operations = [
        migrations.AddField(model_name="game", name="practice", field=models.BooleanField(default=False)),
        migrations.RunPython(mark, migrations.RunPython.noop),
    ]
