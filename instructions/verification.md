# Verification checklist (required, not optional)

1. `python manage.py check`, then `makemigrations`/`migrate`.
2. Run relevant `backfill_*` command(s), sanity-check numbers manually.
3. Test through the **actual API view** (`APIRequestFactory` + `force_authenticate`), not just the service function — bugs have hidden at the view/serializer layer before.
4. Confirm 403 for non-admin on anything new.
5. Clean up test data, re-run backfill command(s) to confirm idempotency (numbers return to baseline).
