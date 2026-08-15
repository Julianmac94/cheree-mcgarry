# docs/ index

What's current vs historical, so you don't build against a retired design by accident.

## Current

- **`registration-form-spec.md`** — `/register`, the self-registration page. Still accurate.
- **`audit-2026-06-22.md`** — a point-in-time audit. Historical by nature (it's a snapshot, not a spec), not stale in the sense of being wrong — just describes 2026-06-22, not today.

## Superseded — kept for historical context, don't build against these

- **`halaxy-onboarding-spec.md`** — the old "Set up in Halaxy" wizard design. Fully removed 2026-08-15; the dashboard doesn't write to Halaxy at all now. See `../CLAUDE.md`.
- **`fee-menu-draft.md`** — fee-to-invoice mapping for the wizard above. No longer applicable; `/book` has no fee-menu concept.

## For the real, current picture

Start with `../CLAUDE.md` (conventions + gotchas) and `../ARCHITECTURE.md` (how the system fits together). `../CHANGELOG.md` has the history of how it got here, including why the two "superseded" docs above exist at all.
