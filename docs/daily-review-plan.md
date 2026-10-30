# 当日日结点评与勋章 Implementation Plan

**Goal:** Any signed-in member can request an LLM review of the viewed member document's current Shanghai-date section; high-quality entries earn persistent document badges and cumulative 3/7/30-day achievements.

**Architecture:** Reuse the existing continuous editor and daily section extractor. The WorkBuddy native LLM judges three dimensions; the app validates JSON, evidence and revision before saving through authenticated database RPC. Stable document IDs own badges, not the clicking user's identity. A unique document/date record prevents repeated clicks increasing counts. All model errors remain errors, with no simulated production assessment.

**Tech Stack:** Vanilla JavaScript, WorkBuddy Cloud SDK streaming LLM/database RPC, Postgres RLS, Node/jsdom development tests. No local production backend.

- [x] Verify native SDK synthetic inference and obtain actual model response evidence without real journal text.
- [x] Core: strict Shanghai date/H1 scoping, template detection, 20k input limit, JSON rubric validation, quote evidence validation and grade calculation. Model scores each criterion 0..5; quality requires all >=3 and sum>=12 (80/100). Criterion badges require >=4 on a qualified day.
- [x] UI: visible “点评今日日结” button in each document, explicit member/date, model progress/cancel/retry, score reasons and suggestions, badge collection with locked/unlocked states. Refuse stale content/account/document responses.
- [x] Cloud: persistent reviews, unique qualifying days, catalog awards/milestones via authenticated RPC; idempotent concurrent saves, saved document rev verification, no anonymous or direct badge writes. Record client-supplied LLM provenance honestly; this is informal encouragement, not tamper-proof certification.
- [x] Test missing/duplicate dates, cross-day privacy, model invalid output, errors, stale responses, duplicate rewards, member document ownership and timezone boundaries. Verify real SQL role isolation and rollback synthetic records.
- [x] Build, preview, deploy through original WorkBuddy app, verify live assets; commit/push feature branch with docs and CI. Preserve existing OTP/comment behavior.

Research: reviewed MIT achievements-engine and Trophy UI; use lightweight document-owned event deduplication and badge collection presentation. Do not import a React/server framework solely for these features. Reuse our own daily-section extractor; any future copied third-party implementation must retain its license.

Validation completed 2026-10-30: 27 isolated tests passed; GitHub Actions passed for feature commit 82035ab. WorkBuddy native hunyuan-chat synthetic review completed with finish_reason=stop and passed the production parser. Real database role tests and six strict-type negative cases passed with rollback. Original site deployed; all nine live asset SHA256 hashes match dist. No real journals were submitted for testing or given test badges.
