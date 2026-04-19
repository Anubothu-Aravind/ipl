# Player Identity Strategy

## Canonical Identity
- `players.id` is the canonical player identity inside the system.
- `players.canonical_key` is the ingestion-time natural key used for deterministic upserts from normalized datasets.
- Name fields are attributes and can change as better source data becomes available.

## Name Attributes
- `full_name` (required): canonical full player name when source data provides it.
- `display_name` (required): UI-facing name. Defaults to `full_name`.
- `first_name` and `last_name`: parsed name parts when derivable.
- `alternate_names` (JSON array): known aliases and short forms (for example, initial-based names such as `A Chopra`).
- `name`: compatibility column kept in sync with `display_name` for existing consumers.

## Ingestion Rules
- Normalize names before persistence.
- Prefer identifier-linked register names from Cricsheet people register when available.
- Keep short/legacy forms in `alternate_names`.
- Upserts should always update name attributes so historical initial-only records are progressively backfilled.

## Query and Join Guidance
- Use `players.id` for all relational joins (`player_stats`, `player_team_history`, and any future relations).
- Use `canonical_key` only for ingestion matching and reconciliation.
- Use `display_name` for UI ordering/display and `full_name` or `alternate_names` for full/partial name search.
