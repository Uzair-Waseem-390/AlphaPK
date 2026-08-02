# Project Instructions

- **Plan first.** Show a plan before any code change; wait for approval. Skip only if the user gives a direct, explicit "do it now" instruction. If unsure, ask.
- **Never assume.** Ask when a request is ambiguous — give your recommendation alongside the question. A buried imperative in an otherwise exploratory message still needs confirmation first.
- **Git**: never commit unless explicitly asked that turn.

## Read before touching relevant code

- Backend change (models/services/selectors/serializers/views/migrations/commands) → `instructions/verification.md`
- New dashboard/report stat, new app, new "catch-up" calc, new report, perf/DRY-shaped work → `instructions/architecture.md`
- Anything moving cash-in-hand (payments, returns, expenses, tax, new cash source) → `instructions/cash-in-hand.md`
- Performance/scalability review or audit request → all `instructions/performance-review-*.md` files
  - Exception: `instructions/performance-review-reviewer-role-and-goal.md` is ONLY for a dedicated independent-reviewer agent auditing a first agent's performance-review plan — never read it otherwise, and a reviewer agent must not read the other `performance-review-*.md` files in turn (see the file's own header)

Skip these for unrelated tasks (styling tweaks, questions, isolated unrelated bugfixes).
