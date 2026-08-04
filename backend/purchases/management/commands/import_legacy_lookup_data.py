from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from backend.settings import DATA_GMAIL

MIGRATION_USER_EMAIL = DATA_GMAIL
if not MIGRATION_USER_EMAIL:
    raise CommandError("DATA_GMAIL is not set in settings.py")

# Order matters: Product depends on Category/Shelf already existing in the
# new DB (looked up by name), so those must run first.
TABLE_ORDER = ["category", "shelf", "supplier", "product"]


class Command(BaseCommand):
    help = (
        "One-off/reusable import of lookup data (Category, Shelf, Supplier, Product) "
        "from the legacy DB (settings.DATABASES['legacy']) into the current default DB. "
        "Schema/relationships are identical between the two DBs; only these four tables "
        "are copied. Safe to re-run: existing rows (matched by name/code) are skipped."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--tables", nargs="+", choices=TABLE_ORDER, default=None,
            help="Subset of tables to import (default: all four, in dependency order).",
        )
        parser.add_argument(
            "--dry-run", action="store_true",
            help="Report what would be created/skipped without writing anything.",
        )

    def handle(self, *args, **options):
        from purchases.models import Category, Shelf, Supplier, Product

        requested = set(options["tables"] or TABLE_ORDER)
        dry_run = options["dry_run"]

        User = get_user_model()
        try:
            migration_user = User.objects.get(email=MIGRATION_USER_EMAIL)
        except User.DoesNotExist:
            raise CommandError(
                f"Migration attribution user '{MIGRATION_USER_EMAIL}' does not exist "
                f"in the target database. Create this user first, then re-run."
            )

        summary = {}
        # In --dry-run, category/shelf rows are never actually written, so the
        # product step (which looks them up by name) needs to know what this
        # same run *would have* created, on top of what already exists.
        dry_run_names = {"category": set(), "shelf": set()}

        if "category" in requested:
            summary["category"] = self._import_simple(
                Category, "name", migration_user, dry_run, dry_run_names["category"],
            )
        if "shelf" in requested:
            summary["shelf"] = self._import_simple(
                Shelf, "name", migration_user, dry_run, dry_run_names["shelf"],
            )
        if "supplier" in requested:
            summary["supplier"] = self._import_supplier(Supplier, migration_user, dry_run)
        if "product" in requested:
            summary["product"] = self._import_product(
                Product, Category, Shelf, migration_user, dry_run, dry_run_names,
            )

        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS("Import summary" + (" (dry run)" if dry_run else "") + ":"))
        for table, counts in summary.items():
            self.stdout.write(
                f"  {table}: created={counts['created']} skipped={counts['skipped']} errors={counts['errors']}"
            )

    # -----------------------------------------------------------------
    # Helpers
    # -----------------------------------------------------------------

    def _stamp(self, model, pk, row):
        """created_at/updated_at are auto_now_add/auto_now — .create() always
        overwrites them to "now", so restore the legacy timestamps afterward."""
        model.all_objects.filter(pk=pk).update(
            created_at=row.created_at, updated_at=row.updated_at,
        )

    def _import_simple(self, model, unique_field, migration_user, dry_run, dry_run_names=None):
        created = skipped = errors = 0
        legacy_rows = model.all_objects.using("legacy").all()

        for row in legacy_rows:
            lookup = {unique_field: getattr(row, unique_field)}
            if model.all_objects.filter(**lookup).exists():
                skipped += 1
                continue

            if dry_run:
                created += 1
                if dry_run_names is not None:
                    dry_run_names.add(getattr(row, unique_field))
                continue

            try:
                with transaction.atomic():
                    new_row = model.all_objects.create(
                        **{unique_field: getattr(row, unique_field)},
                        description=row.description,
                        created_by=migration_user,
                        updated_by=migration_user,
                        deleted_by=migration_user if row.is_deleted else None,
                        deleted_at=row.deleted_at,
                        is_deleted=row.is_deleted,
                    )
                    self._stamp(model, new_row.pk, row)
                created += 1
            except Exception as exc:
                errors += 1
                self.stderr.write(self.style.WARNING(
                    f"  [{model.__name__}] failed to import '{getattr(row, unique_field)}': {exc}"
                ))

        return {"created": created, "skipped": skipped, "errors": errors}

    def _import_supplier(self, Supplier, migration_user, dry_run):
        created = skipped = errors = 0
        legacy_rows = Supplier.all_objects.using("legacy").all()

        for row in legacy_rows:
            if Supplier.all_objects.filter(code=row.code).exists():
                skipped += 1
                continue

            if dry_run:
                created += 1
                continue

            try:
                with transaction.atomic():
                    new_row = Supplier.all_objects.create(
                        name=row.name,
                        code=row.code,
                        created_by=migration_user,
                        updated_by=migration_user,
                        deleted_by=migration_user if row.is_deleted else None,
                        deleted_at=row.deleted_at,
                        is_deleted=row.is_deleted,
                    )
                    self._stamp(Supplier, new_row.pk, row)
                created += 1
            except Exception as exc:
                errors += 1
                self.stderr.write(self.style.WARNING(
                    f"  [Supplier] failed to import '{row.code}': {exc}"
                ))

        return {"created": created, "skipped": skipped, "errors": errors}

    def _import_product(self, Product, Category, Shelf, migration_user, dry_run, dry_run_names=None):
        created = skipped = errors = 0
        legacy_rows = Product.all_objects.using("legacy").select_related("category", "shelf").all()
        dry_run_names = dry_run_names or {"category": set(), "shelf": set()}

        for row in legacy_rows:
            if Product.all_objects.filter(code=row.code).exists():
                skipped += 1
                continue

            new_category = Category.all_objects.filter(name=row.category.name).first()
            new_shelf = Shelf.all_objects.filter(name=row.shelf.name).first()
            category_ok = new_category is not None or row.category.name in dry_run_names["category"]
            shelf_ok = new_shelf is not None or row.shelf.name in dry_run_names["shelf"]
            if not category_ok or not shelf_ok:
                errors += 1
                missing = []
                if not category_ok:
                    missing.append(f"category '{row.category.name}'")
                if not shelf_ok:
                    missing.append(f"shelf '{row.shelf.name}'")
                self.stderr.write(self.style.WARNING(
                    f"  [Product] skipping '{row.code}': missing {', '.join(missing)} in target DB "
                    f"(import category/shelf first)"
                ))
                continue

            if dry_run:
                created += 1
                continue

            try:
                with transaction.atomic():
                    new_row = Product.all_objects.create(
                        name=row.name,
                        code=row.code,
                        category=new_category,
                        shelf=new_shelf,
                        created_by=migration_user,
                        updated_by=migration_user,
                        deleted_by=migration_user if row.is_deleted else None,
                        deleted_at=row.deleted_at,
                        is_deleted=row.is_deleted,
                    )
                    self._stamp(Product, new_row.pk, row)
                created += 1
            except Exception as exc:
                errors += 1
                self.stderr.write(self.style.WARNING(
                    f"  [Product] failed to import '{row.code}': {exc}"
                ))

        return {"created": created, "skipped": skipped, "errors": errors}
