# Heading-based journal reviews implementation plan

**Goal:** Prepend a fresh editable H1 with every template; select one H1 section for concise reviews and consistent member statistics.

**Architecture:** Every H1 starts one journal, ending before the next H1. A persisted heading ID survives renaming/reordering. Statistical dates are separate from titles and fixed at first review. New section-keyed cloud tables retain legacy reviews through an additive migration; original tables remain intact. Same-date member badges remain deduplicated.

**Tech Stack:** Vanilla JavaScript, WorkBuddy Cloud PostgreSQL/RPC, node:test and jsdom.

Inline execution in this session; preserve existing authentication, model providers and private data.

- [x] Template: update `collaboration-core.js`, `collaboration.js`, `editor.js`; `editor.prepend(fragment)` with a fresh H1 every time, including repeated dates. Regression tests in `tests/collaboration.test.cjs` and `tests/editor.test.cjs` assert two inserts produce two headings above existing text.
- [x] Sections: update `agent-core.js` with stable IDs, `section(editor,id)` and a persisted date; preserve those attributes only when loading trusted stored HTML. Clipboard/template copies strip IDs. Tests cover arbitrary/duplicate labels, adjacent sections, rename/reorder and empty content.
- [x] UI: update `index.html`, `journal-agent.js`, `agent.css` inside the existing comments sidebar, with a selected-heading toolbar action, heading selection, locate-source button, statistical date and an explicit start button. First open chooses top section without starting inference. Switching selection cancels stale responses; save/restore uses document + section ID.
- [x] Output: prompt a short conclusion, one reason per dimension, one or two next steps; collapse quoted evidence. Keep strict evidence/score validation. Member summary counts latest review per section, mean score and qualified percentage; badges still count unique dates.
- [ ] Cloud: add `cloud/005-heading-reviews.sql`; copy legacy rows using `date:YYYY-MM-DD` IDs, maintain authenticated-only RPC writes, validate section ID against saved HTML and document revision, freeze statistical date after first save. Retain existing SQL validation and old records. WorkBuddy applies atomic migration and verifies with synthetic rollback-only transactions.
- [ ] Validate: `npm run check`, `npm test`, `npm run build`; live native-model smoke test with two synthetic H1 journals verifies only selected source is sent and concise JSON validates. Publish only `dist/` to original WorkBuddy app; compare deployed asset hashes. Commit/push only source, tests and docs.
