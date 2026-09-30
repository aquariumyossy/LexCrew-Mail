export const SLOT_MINUTES = [30, 60, 90, 120] as const;
export const COOLDOWN_MINUTES = [0, 15, 30] as const;
export const HORIZON_DAYS = 14;
export const MIN_HORIZON_DAYS = 7;
export const MAX_HORIZON_DAYS = 60;
export const DEFAULT_EXCLUDED_WEEKDAYS = [0, 6];
export const DEFAULT_DAY_START = "09:00";
export const DEFAULT_DAY_END = "18:00";
export const DEFAULT_SLOT_MINUTES = 60;
export const DEFAULT_MAX_SLOTS = 3;
export const DEFAULT_COOLDOWN_MINUTES = 0;

export type SlotMinutes = (typeof SLOT_MINUTES)[number];
export type CooldownMinutes = (typeof COOLDOWN_MINUTES)[number];

export type SlotQuery = {
  excludedWeekdays: number[];
  dayStart: string;
  dayEnd: string;
  slotMinutes: SlotMinutes;
  maxSlots: number;
  cooldownMinutes: CooldownMinutes;
  fromTomorrow: boolean;
  fromDayAfter: boolean;
  horizonDays: number;
};

export type Appointment = {
  start: string;
  end: string;
  busy: boolean;
  allDay: boolean;
  subject?: string;
  location?: string;
};

export type FreeSlot = {
  start: string;
  end: string;
};

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

export function defaultSlotQuery(): SlotQuery {
  return {
    excludedWeekdays: [...DEFAULT_EXCLUDED_WEEKDAYS],
    dayStart: DEFAULT_DAY_START,
    dayEnd: DEFAULT_DAY_END,
    slotMinutes: DEFAULT_SLOT_MINUTES,
    maxSlots: DEFAULT_MAX_SLOTS,
    cooldownMinutes: DEFAULT_COOLDOWN_MINUTES,
    fromTomorrow: true,
    fromDayAfter: true,
    horizonDays: HORIZON_DAYS,
  };
}

export function normalizeSlotQuery(value: Partial<SlotQuery> | null | undefined): SlotQuery {
  const base = defaultSlotQuery();
  const row = value ?? {};
  const excluded = Array.isArray(row.excludedWeekdays)
    ? uniqueWeekdays(row.excludedWeekdays)
    : base.excludedWeekdays;
  const dayStart = clock(row.dayStart);
  const dayEnd = clock(row.dayEnd);
  const hours = dayStart && dayEnd && minutesOf(dayStart) < minutesOf(dayEnd)
    ? { dayStart, dayEnd }
    : { dayStart: base.dayStart, dayEnd: base.dayEnd };
  return {
    excludedWeekdays: excluded,
    dayStart: hours.dayStart,
    dayEnd: hours.dayEnd,
    slotMinutes: oneOf(SLOT_MINUTES, row.slotMinutes, base.slotMinutes),
    maxSlots: clampCount(row.maxSlots, base.maxSlots),
    cooldownMinutes: oneOf(COOLDOWN_MINUTES, row.cooldownMinutes, base.cooldownMinutes),
    fromTomorrow: flag(row.fromTomorrow, base.fromTomorrow),
    fromDayAfter: flag(row.fromDayAfter, base.fromDayAfter),
    horizonDays: clampHorizon(row.horizonDays, base.horizonDays),
  };
}

export function slotWindow(now: Date, horizonDays: number = HORIZON_DAYS): { from: Date; to: Date } {
  const from = startOfDay(now);
  return { from, to: addDays(from, clampHorizon(horizonDays, HORIZON_DAYS)) };
}

export function formatLocal(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function findFreeSlots(now: Date, appointments: Appointment[], raw: Partial<SlotQuery> | SlotQuery): { slots: FreeSlot[]; note: string } {
  const query = normalizeSlotQuery(raw);
  if (query.excludedWeekdays.length >= WEEKDAYS.length) {
    return { slots: [], note: "すべての曜日が空き枠の対象外です。" };
  }
  const open = minutesOf(query.dayStart);
  const close = minutesOf(query.dayEnd);
  if (query.slotMinutes > close - open) {
    return { slots: [], note: "枠の長さが対応時間に収まりません。" };
  }
  const window = slotWindow(now, query.horizonDays);
  const blocks = busyBlocks(appointments, query.cooldownMinutes);
  const byDay = new Map<string, Array<{ start: Date; end: Date }>>();
  const lead = firstOpenDay(window.from, query.excludedWeekdays, query.fromDayAfter ? 2 : query.fromTomorrow ? 1 : 0, query.horizonDays);
  for (let i = lead; i < query.horizonDays; i += 1) {
    const day = addDays(window.from, i);
    if (query.excludedWeekdays.includes(day.getDay())) continue;
    const dayStart = atMinutes(day, open);
    const dayEnd = atMinutes(day, close);
    let cursor = dayStart;
    if (sameDay(day, now) && now.getTime() > dayStart.getTime()) {
      const step = query.slotMinutes * 60_000;
      const jumps = Math.ceil((now.getTime() - dayStart.getTime()) / step);
      cursor = new Date(dayStart.getTime() + jumps * step);
    }
    const found: Array<{ start: Date; end: Date }> = [];
    while (cursor.getTime() + query.slotMinutes * 60_000 <= dayEnd.getTime()) {
      const end = new Date(cursor.getTime() + query.slotMinutes * 60_000);
      if (!overlaps(cursor, end, blocks)) found.push({ start: cursor, end });
      cursor = new Date(cursor.getTime() + query.slotMinutes * 60_000);
    }
    if (found.length) byDay.set(dayKey(day), mergeRuns(found));
  }
  const picked = pickSlots(byDay, query.maxSlots);
  if (!picked.length) return { slots: [], note: "この期間に空いている枠はありません。" };
  return {
    slots: picked.map((slot) => ({ start: formatLocal(slot.start), end: formatLocal(slot.end) })),
    note: "",
  };
}

function firstOpenDay(today: Date, excluded: number[], count: number, horizonDays: number): number {
  if (count <= 0) return 0;
  let seen = 0;
  for (let i = 1; i < horizonDays; i += 1) {
    if (excluded.includes(addDays(today, i).getDay())) continue;
    seen += 1;
    if (seen === count) return i;
  }
  return horizonDays;
}

function mergeRuns(slots: Array<{ start: Date; end: Date }>): Array<{ start: Date; end: Date }> {
  const runs: Array<{ start: Date; end: Date }> = [];
  for (const slot of slots) {
    const last = runs.at(-1);
    if (last && last.end.getTime() === slot.start.getTime()) {
      last.end = slot.end;
    } else {
      runs.push({ start: slot.start, end: slot.end });
    }
  }
  return runs;
}

function pickSlots(
  byDay: Map<string, Array<{ start: Date; end: Date }>>,
  maxSlots: number
): Array<{ start: Date; end: Date }> {
  const picked: Array<{ start: Date; end: Date }> = [];
  const rest: Array<{ start: Date; end: Date }> = [];
  for (const runs of byDay.values()) {
    const longest = runs.reduce((best, run) =>
      run.end.getTime() - run.start.getTime() > best.end.getTime() - best.start.getTime() ? run : best
    );
    if (picked.length < maxSlots) picked.push(longest);
    for (const run of runs) if (run !== longest) rest.push(run);
  }
  rest.sort((a, b) => a.start.getTime() - b.start.getTime());
  for (const run of rest) {
    if (picked.length >= maxSlots) break;
    picked.push(run);
  }
  return picked.sort((a, b) => a.start.getTime() - b.start.getTime());
}

function busyBlocks(appointments: Appointment[], cooldownMinutes: number): Array<{ start: number; end: number }> {
  const blocks: Array<{ start: number; end: number }> = [];
  const pad = cooldownMinutes * 60_000;
  for (const item of appointments) {
    if (item.busy === false) continue;
    const start = parseLocal(item.start);
    const end = parseLocal(item.end);
    if (!start || !end || end.getTime() <= start.getTime()) continue;
    if (item.allDay) {
      for (const day of allDaySpan(start, end)) {
        blocks.push({ start: day.getTime(), end: addDays(day, 1).getTime() });
      }
      continue;
    }
    blocks.push({ start: start.getTime() - pad, end: end.getTime() + pad });
  }
  return blocks;
}

function allDaySpan(start: Date, end: Date): Date[] {
  const first = startOfDay(start);
  const endDay = startOfDay(end);
  const exclusive = end.getHours() === 0 && end.getMinutes() === 0 && endDay.getTime() > first.getTime();
  const last = exclusive ? endDay : addDays(endDay, 1);
  const days: Date[] = [];
  for (let cursor = first; cursor.getTime() < last.getTime(); cursor = addDays(cursor, 1)) {
    days.push(cursor);
  }
  return days;
}

function overlaps(start: Date, end: Date, blocks: Array<{ start: number; end: number }>): boolean {
  const a = start.getTime();
  const b = end.getTime();
  return blocks.some((block) => a < block.end && block.start < b);
}

export function parseLocal(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]), 0, 0);
}

function clock(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return `${match[1]}:${match[2]}`;
}

function minutesOf(value: string): number {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function flag(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function oneOf<T extends number>(options: readonly T[], value: unknown, fallback: T): T {
  const n = typeof value === "number" ? value : Number(value);
  return options.includes(n as T) ? (n as T) : fallback;
}

function clampCount(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(10, Math.max(1, Math.round(n)));
}

function clampHorizon(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(MAX_HORIZON_DAYS, Math.max(MIN_HORIZON_DAYS, Math.round(n)));
}

function uniqueWeekdays(values: unknown[]): number[] {
  const found = new Set<number>();
  for (const value of values) {
    const n = typeof value === "number" ? value : Number(value);
    if (WEEKDAYS.includes(n)) found.add(n);
  }
  return [...found].sort((a, b) => a - b);
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function atMinutes(day: Date, minutes: number): Date {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(minutes / 60), minutes % 60, 0, 0);
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function dayKey(date: Date): string {
  return formatLocal(startOfDay(date)).slice(0, 10);
}
