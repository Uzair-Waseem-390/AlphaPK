# Project Instructions

## Always plan before changing anything

Before making any code change (edits, new files, migrations, running commands that write data), first show the user a plan: what you intend to change, why, and which files/commands are involved. Let the user review and refine the plan. Do not start implementing until the user explicitly approves it.

**Exception**: if the user's message is itself a direct, explicit instruction to fix/solve/implement something right now (e.g. "fix it", "solve this error", "just do it"), skip the plan-first step and go straight to work.

When in doubt about whether a message counts as that explicit go-ahead, show the plan first and ask.

## Never assume — ask when unclear

While planning, do not silently assume behavior, requirements, or edge-case handling on your own. If anything about the request is ambiguous, underspecified, or has more than one reasonable interpretation, ask the user directly instead of guessing.

When asking, also give your best recommendation (with a short reason) so the user has a default to react to instead of a blank question.

**Mixed messages need extra care.** A message that's mostly discussion/questions but contains one imperative sentence buried inside it ("...and I want you to also do X") is still a doubt-worthy case, not automatic clearance to act. Don't cherry-pick the one actionable-sounding line out of an otherwise exploratory message — if the overall message reads as "let's talk this through," treat the whole thing that way and confirm before touching code, even if one sentence sounds like an instruction.

## Verification discipline (this project's standard, not just a suggestion)

Before calling any backend change done:
1. `python manage.py check`, then `makemigrations`/`migrate`.
2. Run the relevant `backfill_*` command(s) and confirm the numbers match a manual sanity check.
3. Test live through the **actual API view path** (e.g. `APIRequestFactory` + `force_authenticate` calling the real view class), not just the service function directly — this project has caught real bugs that only showed up at the view/serializer layer.
4. Confirm permission enforcement (403 for non-admin) on anything new.
5. Clean up any test data created during verification, then re-run the backfill command(s) to confirm they're idempotent and the numbers return to baseline.

Don't skip straight to "build it and assume it's right" — this project has a track record of catching real, non-obvious bugs specifically because of this discipline (e.g. the tax-payment cash_in_hand bug, the FIFO cost basis nuance).

## Any new feature that touches `cash_in_hand` must wire THREE places, from day one

Learned the hard way once (tax payments) — don't repeat it. Any new source of cash movement needs, in the same pass, not added later:
1. A live sync function in `cash_flow/services.py`.
2. A line item in `get_cash_in_hand_breakdown()` (`cash_flow/selectors.py`) — otherwise the number moves but nothing explains why.
3. Inclusion in `backfill_cashflow.py` — otherwise re-running that command (which happens often for verification) silently undoes the deduction/addition.

## Architecture conventions established in this project

- **O(1) dashboard stats**: every app with dashboard/report-header numbers gets its own singleton model (mirrors `CashFlow`/`TaxFlow`/`CashManagementFlow`/`AssetFlow`) — stored fields, updated via an internal `_adjust_*` function, never computed live by summing rows at request time.
- **No cron/celery.** Time-based calculations (depreciation, investor growth, etc.) use a "catch-up on view" pattern instead — a function that posts any missing periods when the relevant object/stats endpoint is actually read. Triggered by real requests, not a scheduler.
- Every new Django app follows the same shape: `models.py`, `permissions.py` (`IsAdminOrSuperuser`, admin/superuser-only throughout), `selectors.py` (reads), `services.py` (writes, `@transaction.atomic`), `serializers.py`, `views.py` (thin, generics-based), `urls.py`, `admin.py`, a `backfill_<app>` management command.
- Frontend mirrors this: `services/<app>Api.js`, `hooks/use<App>.js`, one page per concern under `pages/<app>/`, a collapsible nav section in `Layout.jsx`, routes in `App.jsx`. List views must use the global default pagination (no `pagination_class` overrides).
- Rate/percentage inputs: the user always types a plain whole number (e.g. `15` for 15%); the frontend converts to/from the fraction the backend stores. Never make the user type `0.15`.

## Git

Never run `git commit` or any commit-adjacent action unless explicitly asked in that exact turn — the user handles all commits themselves.
