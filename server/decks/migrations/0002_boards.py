from django.db import migrations


def add_boards(apps, schema_editor):
    for v in apps.get_model("decks", "DeckVersion").objects.all():
        v.list = {"side": [], "maybe": [], **v.list}
        v.save(update_fields=["list"])


class Migration(migrations.Migration):
    dependencies = [("decks", "0001_initial")]
    operations = [migrations.RunPython(add_boards, migrations.RunPython.noop)]
