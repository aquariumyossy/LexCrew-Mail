import { Appointment } from "./freeSlots";

export const EVENT_PRESETS = ["today", "tomorrow", "this_week", "next_week"] as const;
export const MAX_LISTED_EVENTS = 40;
export const MAX_EVENT_SUBJECT_CHARS = 120;
export const MAX_EVENT_LOCATION_CHARS = 80;
export const MAX_EVENT_SPAN_DAYS = 31;
export const CALENDAR_UNREAD_NOTE = "予定表は読んでいません。";

export type EventPreset = (typeof EVENT_PRESETS)[number];

export type EventQuery =
  | { kind: "preset"; preset: EventPreset; q: string }
  | { kind: "range"; from: string; to: string; q: string };

export type CalendarEvent = {
  start: string;
  end: string;
  allDay: boolean;
  busy: boolean;
  subject: string;
  location: string;
};

const PRESET_LABEL: Record<EventPreset, string> = {
  today: "今日の予定",
  tomorrow: "明日の予定",
  this_week: "今週の予定",
  next_week: "来週の予定",
};

export function eventChipLabel(query: EventQuery): string {
  if (query.q) return `予定「${query.q}」`;
  if (query.kind === "preset") return PRESET_LABEL[query.preset];
  return "予定";
}

export function parseEventQuery(args: Record<string, unknown>): { ok: true; query: EventQuery } | { ok: false; error: string } {
  const q = typeof args.q === "string" ? args.q.trim() : "";
  const presetRaw = typeof args.preset === "string" ? args.preset.trim() : "";
  if (presetRaw) {
    if (!isPreset(presetRaw)) return { ok: false, error: "予定の期間が不正です。" };
    return { ok: true, query: { kind: "preset", preset: presetRaw, q } };
  }
  const from = typeof args.from === "string" ? args.from.trim() : "";
  const to = typeof args.to === "string" ? args.to.trim() : "";
  if (!from && !to) return { ok: true, query: { kind: "preset", preset: "today", q } };
  const query: EventQuery = { kind: "range", from, to, q };
  const range = resolveRange(new Date(2000, 0, 1), query);
  if (!range.ok) return range;
  return { ok: true, query };
}

export function resolveRange(now: Date, query: EventQuery): { ok: true; from: Date; to: Date } | { ok: false; error: string } {
  if (query.kind === "preset") {
    const today = startOfDay(now);
    if (query.preset === "today") return { ok: true, from: today, to: addDays(today, 1) };
    if (query.preset === "tomorrow") {
      const from = addDays(today, 1);
      return { ok: true, from, to: addDays(from, 1) };
    }
    const week = startOfWeek(today);
    const from = query.preset === "next_week" ? addDays(week, 7) : week;
    return { ok: true, from, to: addDays(from, 7) };
  }
  if (!isDay(query.from) || !isDay(query.to)) return { ok: false, error: "予定の期間が不正です。" };
  const from = parseDay(query.from);
  const last = parseDay(query.to);
  if (last.getTime() < from.getTime()) return { ok: false, error: "予定の期間が不正です。" };
  const to = addDays(last, 1);
  const span = Math.round((to.getTime() - from.getTime()) / 86_400_000);
  if (span > MAX_EVENT_SPAN_DAYS) return { ok: false, error: "予定の期間が不正です。" };
  return { ok: true, from, to };
}

export function selectEvents(appointments: Appointment[], q: string): { events: CalendarEvent[]; note: string } {
  const needle = q.trim();
  const rows = appointments
    .map(toEvent)
    .filter((row): row is CalendarEvent => row !== null)
    .filter((row) => !needle || row.subject.includes(needle));
  rows.sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end) || a.subject.localeCompare(b.subject, "ja"));
  const unique: CalendarEvent[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const key = `${row.start}\n${row.end}\n${row.subject}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(row);
  }
  const clipped = unique.length > MAX_LISTED_EVENTS;
  return {
    events: unique.slice(0, MAX_LISTED_EVENTS).map(clipEvent),
    note: clipped ? `${MAX_LISTED_EVENTS}件で打ち切りました。` : "",
  };
}

function toEvent(item: Appointment): CalendarEvent | null {
  const start = minuteStamp(item.start);
  const end = minuteStamp(item.end);
  if (!start || !end) return null;
  return {
    start,
    end,
    allDay: item.allDay === true,
    busy: item.busy !== false,
    subject: (item.subject ?? "").trim(),
    location: (item.location ?? "").trim(),
  };
}

function clipEvent(item: CalendarEvent): CalendarEvent {
  return {
    ...item,
    subject: clip(item.subject, MAX_EVENT_SUBJECT_CHARS),
    location: clip(item.location, MAX_EVENT_LOCATION_CHARS),
  };
}

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}

function minuteStamp(value: string): string | null {
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})/.exec(value);
  return match ? match[1] : null;
}

function isPreset(value: string): value is EventPreset {
  return (EVENT_PRESETS as readonly string[]).includes(value);
}

function isDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = parseDay(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` === value;
}

function parseDay(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function startOfWeek(day: Date): Date {
  const start = startOfDay(day);
  const sinceMonday = (start.getDay() + 6) % 7;
  return addDays(start, -sinceMonday);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}
