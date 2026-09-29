import { resolveRange, selectEvents } from "./calendarEvents";
import { Appointment } from "./freeSlots";

const tuesday = new Date(2026, 8, 29);
const sunday = new Date(2026, 8, 27);

function event(start: string, subject: string, extra: Partial<Appointment> = {}): Appointment {
  return { start, end: extra.end ?? "2026-09-29T11:00", busy: true, allDay: false, subject, location: "", ...extra };
}

describe("resolveRange", () => {
  it("cuts today, tomorrow, this week, and next week from a Tuesday", () => {
    expect(resolveRange(tuesday, { kind: "preset", preset: "today", q: "" })).toEqual({
      ok: true,
      from: new Date(2026, 8, 29),
      to: new Date(2026, 8, 30),
    });
    expect(resolveRange(tuesday, { kind: "preset", preset: "tomorrow", q: "" })).toEqual({
      ok: true,
      from: new Date(2026, 8, 30),
      to: new Date(2026, 9, 1),
    });
    expect(resolveRange(tuesday, { kind: "preset", preset: "this_week", q: "" })).toEqual({
      ok: true,
      from: new Date(2026, 8, 28),
      to: new Date(2026, 9, 5),
    });
    expect(resolveRange(tuesday, { kind: "preset", preset: "next_week", q: "" })).toEqual({
      ok: true,
      from: new Date(2026, 9, 5),
      to: new Date(2026, 9, 12),
    });
  });

  it("starts the week on the previous Monday when today is Sunday", () => {
    expect(resolveRange(sunday, { kind: "preset", preset: "this_week", q: "" })).toEqual({
      ok: true,
      from: new Date(2026, 8, 21),
      to: new Date(2026, 8, 28),
    });
  });

  it("rejects a span longer than 31 days and keeps a 31-day span", () => {
    expect(resolveRange(tuesday, { kind: "range", from: "2026-09-01", to: "2026-10-02", q: "" }).ok).toBe(false);
    expect(resolveRange(tuesday, { kind: "range", from: "2026-09-01", to: "2026-10-01", q: "" })).toEqual({
      ok: true,
      from: new Date(2026, 8, 1),
      to: new Date(2026, 9, 2),
    });
    expect(resolveRange(tuesday, { kind: "range", from: "2026-13-01", to: "2026-13-02", q: "" }).ok).toBe(false);
  });
});

describe("selectEvents", () => {
  it("keeps an event that started before the caller's window and sorts by start", () => {
    const found = selectEvents(
      [
        event("2026-09-29T15:00", "打合せ", { end: "2026-09-29T16:00", busy: false, location: "事務所" }),
        event("2026-09-28T18:00:00", "弁論", { end: "2026-09-29T10:00:30" }),
      ],
      ""
    );
    expect(found.note).toBe("");
    expect(found.events).toEqual([
      { start: "2026-09-28T18:00", end: "2026-09-29T10:00", allDay: false, busy: true, subject: "弁論", location: "" },
      { start: "2026-09-29T15:00", end: "2026-09-29T16:00", allDay: false, busy: false, subject: "打合せ", location: "事務所" },
    ]);
  });

  it("matches a subject substring and misses a paraphrase", () => {
    const rows = [event("2026-09-29T10:00", "口頭弁論"), event("2026-09-29T13:00", "会議", { end: "2026-09-29T14:00" })];
    expect(selectEvents(rows, "弁論").events.map((row) => row.subject)).toEqual(["口頭弁論"]);
    expect(selectEvents(rows, "裁判").events).toEqual([]);
    expect(selectEvents(rows, "").events).toHaveLength(2);
  });

  it("drops a duplicate start, end, and subject", () => {
    const found = selectEvents(
      [
        event("2026-09-29T10:00", "口頭弁論", { location: "東京地裁" }),
        event("2026-09-29T10:00:00", "口頭弁論", { location: "別の場所" }),
      ],
      ""
    );
    expect(found.events).toHaveLength(1);
    expect(found.events[0]?.subject).toBe("口頭弁論");
  });

  it("stops at 40 events and clips long text", () => {
    const rows = Array.from({ length: 41 }, (_, index) =>
      event(`2026-09-29T10:${String(index).padStart(2, "0")}`, `件${index}`, { end: "2026-09-29T11:00" })
    );
    const capped = selectEvents(rows, "");
    expect(capped.events).toHaveLength(40);
    expect(capped.note).toBe("40件で打ち切りました。");
    expect(capped.events[0]?.subject).toBe("件0");
    const long = selectEvents([event("2026-09-29T10:00", "あ".repeat(121), { location: "い".repeat(81) })], "");
    expect(long.events[0]?.subject).toBe(`${"あ".repeat(120)}…`);
    expect(long.events[0]?.location).toBe(`${"い".repeat(80)}…`);
  });

  it("keeps an all-day flag", () => {
    const found = selectEvents([event("2026-09-29T00:00:00", "期日", { end: "2026-09-30T00:00:00", allDay: true })], "");
    expect(found.events[0]?.allDay).toBe(true);
  });
});
