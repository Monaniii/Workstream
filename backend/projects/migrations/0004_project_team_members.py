from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("projects", "0003_project_actual_completion_date_and_more"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name="project",
            name="team_members",
            field=models.ManyToManyField(
                blank=True,
                related_name="team_projects",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
    ]
