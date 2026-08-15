# Changelog

Human-readable history of what changed and why. Not a full commit log (`git log` is that) — the moments that actually shifted how the system works or is used.

Starts 2026-08-15, the day this file was created — everything before that is reconstructed from git history and is necessarily less complete. Keep entries going forward.

## 2026-08-15

**Restored `/book`, recovering a week of undocumented production work.** `/book` — a full rewrite of the dashboard, built around "no Halaxy writes, Google Calendar is the real system of record" — had been deployed straight to production via `vercel --prod` the week prior and never pushed to git. A routine `git push` today silently reverted production back to the pre-`/book` state (git had no record `/book` existed at all). Recovered the actual deployed source via the Vercel API and merged it onto the same day's safety work rather than reverting past it. See `ARCHITECTURE.md` for the deploy-drift explanation and `CLAUDE.md` for what's current.

**Removed every dashboard flow that creates a patient or appointment in Halaxy.** An exhaustive audit found seven independent code paths across the old admin-ui.js dashboard that could create a Halaxy patient or book a Halaxy appointment — a "Set up in Halaxy" wizard, a "New Appointment" modal, three smaller variants, plus two already-dead ones. All removed; the two Halaxy-write API endpoints that remain (`halaxy_appt_action`, `halaxy_coverage` POST) are now unreachable from any UI and are flagged for full removal.

**Merged PR #54** — fixed the Inbox's calendar-event window silently truncating at ~91 days (a chunk of it was actually 30 days), which had caused several real clients' sessions to age out of view unresolved for months. Added QFES claim ID (funder reference number) tracking and a consolidated per-client "Needs action" view. This was in the old dashboard, since superseded by `/book`'s Board, but the underlying calendar-window fix carried forward into `calendar-pending.js`'s current default.

**Repo cleanup.** Consolidated four scattered local copies of the codebase into one canonical location. Deleted 60+ stale branches (both local and on GitHub) that were fully merged or superseded snapshots, confirmed via manual content-tracing before removal. Closed two stale/duplicate PRs.

## 2026-08-13 (git-recorded)

Fix months-old sessions vanishing from the Inbox + QFES claim ID support (PR #54, merged 2026-08-15 above).

## Undated, sometime before 2026-08-09 (not in git — reconstructed from the recovered `/book` deployment)

**`/book` built and shipped, `/admin` and `/admin-new` retired.** A ground-up rewrite of the dashboard: Google Calendar as the sole source of truth for sessions (structured title/description instead of Halaxy matching), a Board (kanban: triage → booked → outcome → billing → remittance → closed), Web Push notifications, and a QFES ISA form staging tool at `/book/qfes`. Deployed via CLI, never committed — see the 2026-08-15 entry above for how that played out.

## 2026-06-03 (git-recorded)

**Halaxy onboarding wizard + registration webhook.** Added the dashboard-driven "Set up in Halaxy" flow (since fully removed, 2026-08-15) and the `/register` self-registration page's Patient·Create webhook (still current — see `docs/registration-form-spec.md`). Retired an earlier manual "paste a Halaxy URL" onboarding flow. Inbox gained merge/dismiss and combined issue-bucket features (since superseded by `/book`'s Board).

## 2026-05-15 to 2026-05-31 (git-recorded)

Original admin-ui.js dashboard built out in phases: unified pipeline (enquiries + clients + Halaxy), billing tracker + calendar intake queue, mobile UI pass, registration email system. All of this dashboard was superseded by `/book` and deleted 2026-08-15.

## 2026-05-12/13 (git-recorded)

Initial public site build (`index.html`, `sessions.html`, `about.html`, `info.html`) and early visual design passes.
