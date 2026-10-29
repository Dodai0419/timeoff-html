---
name: timeoff-html
description: Make or adapt a time-off / leave calendar that opens as a single HTML page with no build step. Week, day and month views, drag-to-create, a request dialog that counts working days, and a live leave-balance panel. Use when someone wants a leave planner, PTO calendar, holiday calendar or a calendar UI prototype without npm.
---

# timeoff-html

Two files do everything: `index.html` (UI and styles) and `timeoff.js` (dates, leave rules, layout, demo data).

## Steps
1. Open `index.html` in a browser. It works from `file://`.
2. To change the data, edit `createSeed()` in `timeoff.js`:
   - `settings.contractDays`, `settings.carryoverDays`: the yearly allowance
   - `holidays`: `{ id, date: "YYYY-MM-DD", name }`. Requests skip these and weekends.
   - `events`, `requests`: the starting calendar
   - `DESIGN_DATE`: the week the calendar opens on
   Then click **Reset demo data** in the sidebar, because saved state lives in `localStorage` under `timeoff-html:v1`.
3. To restyle, change the CSS variables at the top of `index.html` (`--brand`, `--green-bg`, ...).
   The dark palette sits in the `prefers-color-scheme: dark` block.
4. Check the rules after any change:
   `node --test` (14 tests) and `node timeoff.js --demo`.

## Rules
- All-day request = working days between From and To (weekends and holidays skipped).
- Timed request = minutes / 480 (an 8-hour day).
- Available = contract + carryover - approved - pending, for the current year.
