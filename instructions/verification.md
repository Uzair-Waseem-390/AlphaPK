# Verification checklist (required, not optional)

Before step 1: if this is the first `migrate` this session, or DATABASES/
`.env` may have changed, read `instructions/database-safety.md` FIRST —
`migrate`/`makemigrations` are not safe to run on autopilot.

1. `python manage.py check`, then `makemigrations`/`migrate` (local dev DB only, unless the user has explicitly confirmed the target).
2. Run relevant `backfill_*` command(s), sanity-check numbers manually.
3. Test through the **actual API view** (`APIRequestFactory` + `force_authenticate`), not just the service function — bugs have hidden at the view/serializer layer before.
4. Confirm 403 for non-admin on anything new.
5. Clean up test data, re-run backfill command(s) to confirm idempotency (numbers return to baseline).
