import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [("games", "0004_gameplayer_version"), ("pods", "0001_initial")]

    operations = [
        migrations.AlterField(model_name="game", name="pod", field=models.ForeignKey(
            null=True, on_delete=django.db.models.deletion.CASCADE, related_name="games", to="pods.pod")),
        migrations.AddField(model_name="game", name="practice", field=models.BooleanField(default=False)),
    ]
