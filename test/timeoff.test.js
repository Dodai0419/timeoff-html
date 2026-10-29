// Ported from the upstream vitest suites: lib/dates.test.ts, lib/leave.test.ts, calendar/layout.test.ts.
const test = require("node:test");
const assert = require("node:assert/strict");
const T = require("../timeoff.js");

test("builds the design's Sunday-first week around Tue Nov 10, 2026", () => {
  assert.deepEqual(T.weekDays("2026-11-10", 0), ["2026-11-08", "2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14"]);
  assert.equal(T.startOfWeek("2026-11-10", 1), "2026-11-09");
});

test("reports ISO week 46 for that week", () => {
  assert.equal(T.isoWeek("2026-11-09"), 46);
  assert.equal(T.isoWeek("2026-01-01"), 1);
  assert.equal(T.isoWeek("2027-01-01"), 53);
});

test("formats ranges within and across months", () => {
  assert.equal(T.formatRange("2026-11-08", "2026-11-14"), "Nov 8 – 14");
  assert.equal(T.formatRange("2026-10-25", "2026-10-31"), "Oct 25 – 31");
  assert.equal(T.formatRange("2026-11-29", "2026-12-05"), "Nov 29 – Dec 5");
});

test("adds days and months without drifting", () => {
  assert.equal(T.addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(T.addMonths("2026-01-31", 1), "2026-02-28");
  assert.equal(T.diffDays("2026-11-08", "2026-11-14"), 6);
});

test("returns a 6x7 month grid starting on the week start", () => {
  const grid = T.monthGrid("2026-11-10", 0);
  assert.equal(grid.length, 42);
  assert.equal(grid[0], "2026-11-01");
});

test("formats and parses times in 24h and 12h", () => {
  assert.equal(T.formatTime(7 * 60), "07:00");
  assert.equal(T.formatTime(13 * 60 + 30, "12h"), "1:30 PM");
  assert.equal(T.formatTime(0, "12h"), "12:00 AM");
  assert.equal(T.parseTime("09:45"), 585);
});

test("reproduces the stats shown in the design from the seed", () => {
  const s = T.computeLeaveStats(T.createSeed(), "2026-10-26");
  assert.equal(s.available, 7);
  assert.equal(s.pendingCount, 2);
  assert.equal(s.upcoming, 3);
  assert.equal(s.contract, 12);
  assert.equal(s.carryover, 4);
  assert.equal(s.holidays, 12);
});

test("skips weekends and public holidays when counting days", () => {
  const holidays = [{ id: "h", date: "2026-11-11", name: "Test" }];
  assert.equal(T.workingDays("2026-11-09", "2026-11-15", holidays).length, 4);
});

test("labels durations naturally", () => {
  assert.equal(T.durationLabel(1, 0), "1 day");
  assert.equal(T.durationLabel(2, 4), "2 days 4 hours");
  assert.equal(T.durationLabel(0, 1), "1 hour");
  assert.equal(T.formatDays(0.75), "0.75");
  assert.equal(T.formatDays(7), "7");
});

const ev = (id, start, end) => ({ id, title: id, date: "2026-11-10", start, end, allDay: false, color: "blue" });

test("layoutDay gives non-overlapping events the full width", () => {
  assert.deepEqual(T.layoutDay([ev("a", 420, 540), ev("b", 660, 780)]).map((p) => p.columns), [1, 1]);
});

test("layoutDay splits overlapping events into columns", () => {
  const out = T.layoutDay([ev("a", 540, 660), ev("b", 600, 720), ev("c", 690, 750)]);
  const by = Object.fromEntries(out.map((p) => [p.event.id, p]));
  assert.equal(by.a.column, 0);
  assert.equal(by.b.column, 1);
  assert.equal(by.c.column, 0);
  assert.ok(out.every((p) => p.columns === 2));
});

test("snaps to 15-minute steps", () => {
  assert.equal(T.snap(607), 600);
  assert.equal(T.snap(608), 615);
});

// New: the request flow the dialog uses (same rules as upstream measureRequest/submitRequest).
test("a new all-day request counts working days and lowers the balance", () => {
  const s = T.createSeed();
  const r = T.submitRequest(s, { type: "Time off", from: "2026-11-16", to: "2026-11-22", allDay: true, notes: "" });
  assert.equal(r.days, 5);
  assert.equal(r.duration, "5 days");
  assert.equal(r.status, "pending");
  assert.equal(s.events.filter((e) => e.requestId === r.id).length, 7);
  assert.equal(T.computeLeaveStats(s, "2026-10-26").available, 2);
});

test("a timed request is measured in hours of an 8-hour day", () => {
  const s = T.createSeed();
  const r = T.submitRequest(s, { type: "Personal", from: "2026-11-11", allDay: false, start: 540, end: 690, notes: " " });
  assert.equal(r.days, 150 / 480);
  assert.equal(r.duration, "2.5 hours");
  assert.equal(r.notes, "Personal");
});
