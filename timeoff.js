// Time-off calendar logic: dates, leave rules, event layout and the demo data.
// Plain script: index.html loads it with <script src>, Node loads it with require().
// Rules ported from kargulstudio/calender-app-design (MIT): lib/dates.ts, lib/leave.ts, calendar/layout.ts.
(function (root) {
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const MONTHS_SHORT = MONTHS.map((m) => m.slice(0, 3));
  const WEEKDAYS_SHORT = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  const pad = (n) => String(n).padStart(2, "0");

  // Days are "YYYY-MM-DD" keys in local time, so nothing drifts across time zones.
  const toKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const fromKey = (k) => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); };
  const addDays = (k, n) => { const d = fromKey(k); d.setDate(d.getDate() + n); return toKey(d); };
  function addMonths(k, n) {
    const d = fromKey(k), day = d.getDate();
    d.setDate(1); d.setMonth(d.getMonth() + n);
    d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
    return toKey(d);
  }
  const dayOfWeek = (k) => fromKey(k).getDay();
  const startOfWeek = (k, ws = 0) => addDays(k, -((dayOfWeek(k) - ws + 7) % 7));
  const weekDays = (k, ws = 0) => Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(k, ws), i));
  const monthGrid = (k, ws = 0) => Array.from({ length: 42 }, (_, i) => addDays(startOfWeek(k.slice(0, 8) + "01", ws), i));
  function isoWeek(k) {
    const t = fromKey(k);
    t.setDate(t.getDate() - ((t.getDay() + 6) % 7) + 3);
    const first = new Date(t.getFullYear(), 0, 4);
    return 1 + Math.round(((t - first) / 86400000 - 3 + ((first.getDay() + 6) % 7)) / 7);
  }
  const diffDays = (a, b) => Math.round((fromKey(b) - fromKey(a)) / 86400000);
  const rangeKeys = (a, b) => Array.from({ length: Math.max(0, diffDays(a, b) + 1) }, (_, i) => addDays(a, i));
  const isWeekend = (k) => [0, 6].includes(dayOfWeek(k));
  const formatShort = (k) => `${MONTHS_SHORT[fromKey(k).getMonth()]} ${fromKey(k).getDate()}`;
  function formatRange(a, b) {
    const x = fromKey(a), y = fromKey(b);
    return x.getMonth() === y.getMonth() && x.getFullYear() === y.getFullYear()
      ? `${formatShort(a)} – ${y.getDate()}` : `${formatShort(a)} – ${formatShort(b)}`;
  }
  function formatTime(min, fmt = "24h") {
    if (min === 1440) return fmt === "24h" ? "24:00" : "12:00 AM";
    const m = ((min % 1440) + 1440) % 1440, h = Math.floor(m / 60);
    if (fmt === "24h") return `${pad(h)}:${pad(m % 60)}`;
    return `${h % 12 || 12}:${pad(m % 60)} ${h < 12 ? "AM" : "PM"}`;
  }
  const parseTime = (v) => { const [h, m] = v.split(":").map(Number); return (h || 0) * 60 + (m || 0); };

  // Leave rules.
  const LEAVE_TYPES = ["Time off", "Sick", "Extra leave", "Half-day leave", "Personal"];
  const LEAVE_COLORS = { "Time off": "green", Sick: "blue", "Extra leave": "pink", "Half-day leave": "green", Personal: "orange" };
  const WORKDAY_MINUTES = 480;
  const workingDays = (from, to, holidays) => {
    const off = new Set(holidays.map((h) => h.date));
    return rangeKeys(from, to).filter((d) => !isWeekend(d) && !off.has(d));
  };
  function formatDays(n) {
    const r = Math.round(n * 100) / 100;
    return Number.isInteger(r) ? String(r) : r.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  }
  function durationLabel(days, hours) {
    const parts = [];
    if (days) parts.push(`${days} ${days === 1 ? "day" : "days"}`);
    if (hours) parts.push(`${hours} ${hours === 1 ? "hour" : "hours"}`);
    return parts.join(" ") || "0 hours";
  }
  function computeLeaveStats(s, today) {
    const year = today.slice(0, 4);
    const mine = s.requests.filter((r) => r.from.slice(0, 4) === year);
    const sum = (rs) => rs.reduce((a, r) => a + r.days, 0);
    const approved = mine.filter((r) => r.status === "approved"), pending = mine.filter((r) => r.status === "pending");
    const used = sum(approved), pendingDays = sum(pending), upcoming = sum(approved.filter((r) => r.from >= today));
    return {
      available: Math.max(0, s.settings.contractDays + s.settings.carryoverDays - used - pendingDays),
      pendingCount: pending.length, pendingDays, upcoming, taken: used - upcoming,
      contract: s.settings.contractDays, carryover: s.settings.carryoverDays,
      holidays: s.holidays.filter((h) => h.date.slice(0, 4) === year).length,
    };
  }
  let seq = 0;
  const uid = (p) => `${p}-${Date.now().toString(36)}${(seq++).toString(36)}`;
  function measureRequest(s, input) {
    if (!input.allDay) {
      const minutes = Math.max(0, input.end - input.start);
      return { days: minutes / WORKDAY_MINUTES, label: durationLabel(0, Math.round((minutes / 60) * 10) / 10) };
    }
    const n = workingDays(input.from, input.to, s.holidays).length;
    return { days: n, label: durationLabel(n, 0) };
  }
  function submitRequest(s, input) {
    const m = measureRequest(s, input);
    const req = {
      id: uid("rq"), status: "pending", type: input.type, duration: m.label, days: m.days,
      from: input.from, to: input.allDay ? input.to : input.from, allDay: input.allDay,
      start: input.allDay ? undefined : input.start, end: input.allDay ? undefined : input.end,
      notes: (input.notes || "").trim() || input.type, submittedAt: new Date().toISOString(),
    };
    const color = LEAVE_COLORS[req.type];
    const evs = req.allDay
      ? rangeKeys(req.from, req.to).map((date) => ({ id: uid("ev"), title: req.type, date, start: 0, end: 1440, allDay: true, color, requestId: req.id }))
      : [{ id: uid("ev"), title: req.type, date: req.from, start: req.start, end: req.end, allDay: false, color, note: "Pending", requestId: req.id }];
    s.requests.unshift(req);
    s.events.push(...evs);
    return req;
  }

  // Week grid layout: one hour = 64px, 15-minute snapping, overlaps side by side.
  const HOUR_HEIGHT = 64;
  const snap = (m, step = 15) => Math.round(m / step) * step;
  function layoutDay(events) {
    const out = [];
    let cluster = [], clusterEnd = -1, ends = [];
    const flush = () => { cluster.forEach((c) => out.push({ ...c, columns: ends.length })); cluster = []; ends = []; };
    for (const event of [...events].sort((a, b) => a.start - b.start || b.end - a.end)) {
      if (event.start >= clusterEnd && cluster.length) flush();
      let column = ends.findIndex((e) => e <= event.start);
      if (column === -1) { column = ends.length; ends.push(event.end); } else ends[column] = event.end;
      cluster.push({ event, column });
      clusterEnd = Math.max(clusterEnd, event.end);
    }
    if (cluster.length) flush();
    return out;
  }

  // The data the design shows: week of Nov 8-14, 2026, Tue Nov 10 selected.
  const DESIGN_DATE = "2026-11-10";
  function createSeed() {
    const h = (hh, mm = 0) => hh * 60 + mm;
    const E = (id, title, date, start, end, color, extra = {}) => ({ id, title, date, start, end, allDay: start === 0 && end === 1440, color, ...extra });
    const R = (id, status, type, duration, days, from, to, allDay, notes, extra = {}) => ({ id, status, type, duration, days, from, to, allDay, notes, submittedAt: "2026-03-01T10:00:00.000Z", ...extra });
    const hol = [["01-01", "New Year's Day"], ["01-26", "Republic Day"], ["03-04", "Holi"], ["04-03", "Good Friday"], ["05-01", "Labour Day"], ["06-26", "Muharram"],
      ["08-15", "Independence Day"], ["10-02", "Gandhi Jayanti"], ["10-20", "Dussehra"], ["11-14", "Diwali"], ["11-24", "Guru Nanak Jayanti"], ["12-25", "Christmas Day"]];
    return {
      version: 1,
      settings: { weekStartsOn: 0, timeFormat: "24h", dayStartHour: 6, contractDays: 12, carryoverDays: 4 },
      holidays: hol.map(([d, name], i) => ({ id: `ho-${i + 1}`, date: `2026-${d}`, name })),
      events: [
        E("ev-1", "Time off", "2026-11-09", 0, 1440, "green", { requestId: "rq-5" }),
        E("ev-2", "Personal matters", "2026-11-08", h(11), h(12), "cyan"),
        E("ev-3", "Personal appointment", "2026-11-10", h(7), h(9), "orange", { note: "Pending", requestId: "rq-6" }),
        E("ev-4", "Extra leave", "2026-11-10", h(11), h(13), "pink", { note: "From carryover days" }),
        E("ev-5", "Submit medical certificate", "2026-11-11", h(10), h(11), "blue"),
        E("ev-6", "Update time tracking", "2026-11-12", h(7, 30), h(8), "cyan"),
        E("ev-7", "Benefits review", "2026-11-12", h(12), h(13), "blue"),
        E("ev-8", "Half-day leave", "2026-11-13", h(8), h(12), "green", { note: "Approved", requestId: "rq-7" }),
        E("ev-9", "Team sync", "2026-10-26", h(9, 30), h(10), "blue"),
        E("ev-10", "Design review", "2026-10-27", h(14), h(15, 30), "purple"),
        E("ev-11", "Payroll cut-off", "2026-10-30", 0, 1440, "orange"),
        E("ev-12", "1:1 with manager", "2026-11-04", h(11), h(11, 30), "cyan"),
        E("ev-13", "Time off", "2026-12-23", 0, 1440, "green", { requestId: "rq-8" }),
        E("ev-14", "Time off", "2026-12-24", h(8), h(12), "green", { note: "Approved", requestId: "rq-8" }),
        E("ev-15", "Time off", "2026-12-28", h(9), h(15), "green", { note: "Pending", requestId: "rq-9" }),
      ],
      requests: [
        R("rq-1", "approved", "Time off", "2 days 4 hours", 2.5, "2026-04-19", "2026-04-22", true, "Family vacation"),
        R("rq-2", "declined", "Sick", "1 day 2 hours", 1.25, "2026-04-17", "2026-04-19", true, "Submitted without medical certificate"),
        R("rq-3", "approved", "Time off", "1 day 4 hours", 1.5, "2026-04-12", "2026-04-16", true, "Traveling out of town"),
        R("rq-4", "approved", "Time off", "1 day", 1, "2026-04-08", "2026-04-14", true, "Personal appointment"),
        R("rq-5", "approved", "Time off", "1 day", 1, "2026-11-09", "2026-11-09", true, "Long weekend"),
        R("rq-6", "pending", "Personal", "2 hours", 0.25, "2026-11-10", "2026-11-10", false, "Personal appointment", { start: h(7), end: h(9) }),
        R("rq-7", "approved", "Half-day leave", "4 hours", 0.5, "2026-11-13", "2026-11-13", false, "Half-day leave", { start: h(8), end: h(12) }),
        R("rq-8", "approved", "Time off", "1 day 4 hours", 1.5, "2026-12-23", "2026-12-24", true, "Holiday travel"),
        R("rq-9", "pending", "Time off", "6 hours", 0.75, "2026-12-28", "2026-12-28", false, "Moving apartments", { start: h(9), end: h(15) }),
      ],
    };
  }

  const api = {
    MONTHS, MONTHS_SHORT, WEEKDAYS_SHORT, LEAVE_TYPES, LEAVE_COLORS, HOUR_HEIGHT, DESIGN_DATE,
    toKey, fromKey, addDays, addMonths, startOfWeek, weekDays, monthGrid, isoWeek, diffDays, rangeKeys, isWeekend,
    formatShort, formatRange, formatTime, parseTime, workingDays, formatDays, durationLabel, computeLeaveStats,
    measureRequest, submitRequest, snap, layoutDay, createSeed,
  };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Timeoff = api;

  // `node timeoff.js --demo`: the design week and the stats panel, as text.
  if (typeof require === "function" && typeof module === "object" && require.main === module) {
    const s = createSeed(), today = "2026-10-26", days = weekDays(DESIGN_DATE);
    console.log(`${MONTHS[10]}, 2026 · Week ${isoWeek(days[1])} · ${formatRange(days[0], days[6])}`);
    for (const d of days) {
      const hol = s.holidays.find((x) => x.date === d);
      const evs = s.events.filter((e) => e.date === d).sort((a, b) => a.start - b.start)
        .map((e) => (e.allDay ? `[${e.title}]` : `${formatTime(e.start)}-${formatTime(e.end)} ${e.title}`));
      if (hol) evs.unshift(`[${hol.name}]`);
      console.log(`  ${WEEKDAYS_SHORT[dayOfWeek(d)]} ${fromKey(d).getDate()}  ${evs.join(" · ") || "-"}`);
    }
    const st = computeLeaveStats(s, today), n = (x, w) => `${formatDays(x)} ${x === 1 ? w : w + "s"}`;
    console.log("Time off stats:");
    console.log(`  ${n(st.available, "day")} available · ${st.pendingCount} pending · ${n(st.upcoming, "day")} upcoming · ${n(st.contract, "day")} per year · ${n(st.carryover, "day")} extra · ${st.holidays} holidays`);
    const r = submitRequest(s, { type: "Time off", from: "2026-11-16", to: "2026-11-22", allDay: true });
    console.log(`Request Nov 16-22 → ${r.duration} (weekend skipped) → ${n(computeLeaveStats(s, today).available, "day")} left`);
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
