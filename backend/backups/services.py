from itertools import chain

from django.apps import apps
from django.conf import settings
from django.core import serializers
from django.core.exceptions import FieldDoesNotExist
from django.core.management import call_command
from django.db import connections, transaction
from django.db.migrations.recorder import MigrationRecorder

from .models import BackupFlow, BackupHistory


# ---------------------------------------------------------------------------
# Model discovery
# ---------------------------------------------------------------------------

def _iter_backup_models():
    """
    Every model across the project's own apps (EXTERNAL_APPS) — never
    Django's own framework tables (auth groups/permissions, sessions,
    contenttypes, JWT blacklist), and never this app's own bookkeeping
    models (BackupFlow/BackupHistory — backing up backup metadata is
    pointless and would grow every run).
    """
    for app_label in settings.EXTERNAL_APPS:
        if app_label == "backups":
            continue
        try:
            app_config = apps.get_app_config(app_label)
        except LookupError:
            continue
        for model in app_config.get_models():
            yield model


def _get_timestamp_field(model) -> str | None:
    """
    Prefer 'updated_at' (AuditMixin's edit-tracking field) for incremental
    filtering; fall back to 'created_at' if that's all a model has; None
    means this model has no timestamp to filter by, so every backup —
    incremental or not — includes it in full (cheap, these are small
    lookup/config tables).
    """
    for field_name in ("updated_at", "created_at"):
        try:
            model._meta.get_field(field_name)
            return field_name
        except FieldDoesNotExist:
            continue
    return None


def _base_queryset(model):
    """
    Full backup content, not the soft-delete-filtered default — a backup
    that silently dropped soft-deleted rows wouldn't be a real backup.
    """
    manager = model.all_objects if hasattr(model, "all_objects") else model._default_manager
    return manager.all()


# ---------------------------------------------------------------------------
# Collection — the one function every backup endpoint (local/remote,
# full/incremental) funnels through
# ---------------------------------------------------------------------------

def collect_backup_data(*, since=None, as_of) -> dict:
    """
    Returns {
        "fixture_yaml": "<single Django-fixture-format YAML string>",
        "manifest_models": [{"label": ..., "count": ...}, ...],
        "row_count": <total>,
    }

    `fixture_yaml` is ONE combined serialization of every included row,
    across every model, in the exact format `manage.py dumpdata --format yaml`
    produces — which means restoring it is just `manage.py loaddata <file>`,
    no custom import script needed. Model order follows settings.EXTERNAL_APPS (already
    roughly FK-dependency-ordered: users, purchases, billing, ... last),
    same order `loaddata` would need to insert rows without FK violations.

    `as_of` is captured ONCE by the caller before this runs — every model is
    filtered by that same fixed timestamp, so the backup represents one
    precise, reproducible point in time regardless of how long collection
    itself takes or what writes land on the live tables while it runs.
    """
    manifest_models = []
    total_rows = 0
    querysets = []

    for model in _iter_backup_models():
        label = f"{model._meta.app_label}.{model._meta.model_name}"
        qs = _base_queryset(model)

        ts_field = _get_timestamp_field(model)
        if ts_field:
            qs = qs.filter(**{f"{ts_field}__lte": as_of})
            if since is not None:
                qs = qs.filter(**{f"{ts_field}__gt": since})

        count = qs.count()
        if count == 0:
            continue

        querysets.append(qs.order_by("pk"))
        manifest_models.append({"label": label, "count": count})
        total_rows += count

    fixture_yaml = serializers.serialize("yaml", chain(*querysets))
    return {"fixture_yaml": fixture_yaml, "manifest_models": manifest_models, "row_count": total_rows}


# ---------------------------------------------------------------------------
# Local delivery — one fixture file, streamed straight back; nothing kept
# server-side. Restoring it is exactly `manage.py loaddata <file>`.
# ---------------------------------------------------------------------------

def run_local_backup(*, backup_type: str, user) -> tuple[bytes, str]:
    """
    backup_type: BackupHistory.BackupType.FULL | INCREMENTAL
    Returns (file_bytes, filename). Raises on failure (view logs the
    BackupHistory row either way, via try/except around this call).
    """
    from django.utils import timezone

    as_of = timezone.now()
    flow = BackupFlow.get_instance()
    since = flow.local_last_backup_at if backup_type == BackupHistory.BackupType.INCREMENTAL else None

    try:
        collected = collect_backup_data(since=since, as_of=as_of)
    except Exception as exc:
        BackupHistory.objects.create(
            backup_type=backup_type, destination=BackupHistory.Destination.LOCAL,
            status=BackupHistory.Status.FAILED, covers_from=since, covers_to=as_of,
            error_message=str(exc), triggered_by=user,
        )
        raise

    BackupHistory.objects.create(
        backup_type=backup_type, destination=BackupHistory.Destination.LOCAL,
        status=BackupHistory.Status.SUCCESS, covers_from=since, covers_to=as_of,
        row_count=collected["row_count"], triggered_by=user,
    )
    flow.local_last_backup_at = as_of
    flow.save(update_fields=["local_last_backup_at"])

    filename = f"backup-{backup_type}-{as_of.strftime('%Y%m%d-%H%M%S')}.yaml"
    return collected["fixture_yaml"].encode("utf-8"), filename


# ---------------------------------------------------------------------------
# Remote delivery — real schema mirror on the configured Postgres target
# ---------------------------------------------------------------------------

def remote_backup_configured() -> bool:
    return "backup_remote" in settings.DATABASES


def _get_applied_migrations(database_alias: str) -> set:
    return set(MigrationRecorder(connections[database_alias]).migration_qs.values_list("app", "name"))


def _ensure_remote_schema_synced() -> bool:
    """
    Compares applied migrations between 'default' (this working codebase's
    schema) and 'backup_remote'. Applies whatever the remote is missing —
    idempotent, and safe for the AddField/CreateModel-only migrations this
    project has (Postgres doesn't rebuild-and-drop-unrelated-columns the way
    SQLite did in the incident earlier this session).

    Returns True if the remote's schema had to change. The caller uses this
    to force a FULL backup afterward regardless of what was requested — a
    safety re-baseline so nothing from before the schema change is assumed
    already covered by an incremental watermark.

    Raises if the remote has migrations local doesn't — an unexpected
    divergence; proceeding against an unknown schema would be unsafe.
    """
    local_applied = _get_applied_migrations("default")
    remote_applied = _get_applied_migrations("backup_remote")

    extra_on_remote = remote_applied - local_applied
    if extra_on_remote:
        raise RuntimeError(
            f"Remote backup database has migrations not present in this codebase: "
            f"{sorted(extra_on_remote)}. Refusing to back up against an unexpectedly "
            f"diverged schema — investigate before retrying."
        )

    missing_on_remote = local_applied - remote_applied
    if not missing_on_remote:
        return False

    call_command("migrate", database="backup_remote", interactive=False, verbosity=0)

    still_missing = local_applied - _get_applied_migrations("backup_remote")
    if still_missing:
        raise RuntimeError(f"Remote database still missing migrations after migrate: {sorted(still_missing)}")

    return True


def run_remote_backup(*, backup_type: str, user) -> dict:
    """
    Validates (and if needed, brings up to date) the remote database's
    schema before ever touching data, then loads the collected dataset
    directly into it via Django's deserializer. Returns a small summary
    dict for the response.
    """
    from django.utils import timezone

    if not remote_backup_configured():
        raise RuntimeError("No remote backup database configured (BACKUP_DATABASE is not set).")

    schema_migrated = _ensure_remote_schema_synced()
    if schema_migrated:
        # Schema just changed on remote — force a full re-baseline instead
        # of trusting the old incremental watermark to still be meaningful.
        backup_type = BackupHistory.BackupType.FULL

    as_of = timezone.now()
    flow = BackupFlow.get_instance()
    since = flow.remote_last_backup_at if backup_type == BackupHistory.BackupType.INCREMENTAL else None

    try:
        collected = collect_backup_data(since=since, as_of=as_of)

        with transaction.atomic(using="backup_remote"):
            for deserialized_obj in serializers.deserialize("yaml", collected["fixture_yaml"]):
                deserialized_obj.save(using="backup_remote")
    except Exception as exc:
        BackupHistory.objects.create(
            backup_type=backup_type, destination=BackupHistory.Destination.REMOTE,
            status=BackupHistory.Status.FAILED, covers_from=since, covers_to=as_of,
            error_message=str(exc), triggered_by=user, schema_migrated=schema_migrated,
        )
        raise

    BackupHistory.objects.create(
        backup_type=backup_type, destination=BackupHistory.Destination.REMOTE,
        status=BackupHistory.Status.SUCCESS, covers_from=since, covers_to=as_of,
        row_count=collected["row_count"], triggered_by=user, schema_migrated=schema_migrated,
    )
    flow.remote_last_backup_at = as_of
    flow.save(update_fields=["remote_last_backup_at"])

    return {
        "backup_type": backup_type,
        "covers_from": since,
        "covers_to": as_of,
        "row_count": collected["row_count"],
        "models": collected["manifest_models"],
        "schema_migrated": schema_migrated,
    }
