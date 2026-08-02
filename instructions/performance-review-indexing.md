# Performance Review — Indexing

Analyze every model and recommend proper indexing only where it is actually needed.

Don't blindly add indexes; consider existing indexes, composite indexes, query patterns, read/write trade-offs, and redundancy.

## Search columns (icontains)

Production runs on Supabase/PostgreSQL. Every column searched with
`icontains` MUST be backed by a pg_trgm GIN expression index —
`USING gin (upper(<col>) gin_trgm_ops)` — created in a vendor-guarded
migration (no-op on SQLite dev; pattern:
`purchases/migrations/0010_product_trigram_search_indexes.py`).

- Keep `icontains` in the ORM — that is exactly the lookup the trigram
  index serves.
- A plain `db_index=True` B-tree CANNOT serve a `%term%` match and is not
  an acceptable substitute — flag any unindexed `icontains` search as a
  finding.
- When reviewing an app, enumerate every `icontains` usage (including ones
  reached through joins, e.g. `supplier__name__icontains`) and check each
  target column has its trigram index.
