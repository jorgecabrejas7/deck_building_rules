from django.db import migrations, models


def fold(apps, schema_editor):
    # "pods" only meant: readable by the pods the deck is in. Being in a pod now says that by itself.
    apps.get_model("decks", "Deck").objects.filter(visibility="pods").update(visibility="private")


class Migration(migrations.Migration):

    dependencies = [("decks", "0003_version_name")]

    operations = [
        migrations.RunPython(fold, migrations.RunPython.noop),
        migrations.AlterField(model_name="deck", name="visibility", field=models.CharField(
            choices=[("private", "private"), ("link", "link")], default="private", max_length=10)),
    ]
