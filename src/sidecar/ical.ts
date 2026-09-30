import ical, { EventInstance, VEvent } from "node-ical";
import { Appointment, formatLocal } from "../shared/freeSlots";

const MAX_BYTES = 16_000_000;
const MAX_HOPS = 5;
const MAX_EVENTS = 1500;
const FETCH_MS = 60_000;

export function assertGoogleIcalUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error("Google カレンダーの URL が不正です。");
  }
  if (url.username || url.password || url.protocol !== "https:" || url.hostname !== "calendar.google.com" || !url.pathname.startsWith("/calendar/ical/")) {
    throw new Error("Google カレンダーの非公開 URL を入力してください。");
  }
  return url;
}

export async function fetchGoogleIcs(raw: string): Promise<string> {
  let current = assertGoogleIcalUrl(raw);
  for (let hop = 0; hop < MAX_HOPS; hop += 1) {
    const res = await fetch(current, { redirect: "manual", signal: AbortSignal.timeout(FETCH_MS) });
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) throw new Error("Google カレンダーを読めません。");
      current = assertGoogleIcalUrl(new URL(location, current).toString());
      continue;
    }
    if (!res.ok) throw new Error("Google カレンダーを読めません。");
    return readLimited(res);
  }
  throw new Error("Google カレンダーを読めません。");
}

export function appointmentsFromIcs(ics: string, from: Date, to: Date): Appointment[] {
  const parsed = ical.parseICS(ics);
  const appointments: Appointment[] = [];
  for (const item of Object.values(parsed)) {
    if (!item || item.type !== "VEVENT") continue;
    let instances: EventInstance[] = [];
    try {
      instances = ical.expandRecurringEvent(item as VEvent, { from, to, expandOngoing: true });
    } catch {
      continue;
    }
    for (const instance of instances) {
      if (appointments.length >= MAX_EVENTS) return appointments;
      const row = toAppointment(instance, from, to);
      if (row) appointments.push(row);
    }
  }
  return appointments;
}

function toAppointment(instance: EventInstance, from: Date, to: Date): Appointment | null {
  if (String(instance.event.status ?? "").toUpperCase() === "CANCELLED") return null;
  const busy = String(instance.event.transparency ?? "").toUpperCase() !== "TRANSPARENT";
  if (instance.isFullDay) {
    const startDay = wallDate(instance.start);
    const endDay = wallDate(instance.end ?? addDays(instance.start, 1));
    if (!startDay || !endDay || endDay <= startDay) return null;
    const start = `${startDay}T00:00:00`;
    const end = `${endDay}T00:00:00`;
    if (!overlaps(start, end, from, to)) return null;
    return { start, end, busy, allDay: true, ...eventText(instance) };
  }
  if (!instance.end || instance.end.getTime() <= instance.start.getTime()) return null;
  if (instance.end.getTime() <= from.getTime() || instance.start.getTime() >= to.getTime()) return null;
  return { start: formatLocal(instance.start), end: formatLocal(instance.end), busy, allDay: false, ...eventText(instance) };
}

function eventText(instance: EventInstance): { subject: string; location: string } {
  return { subject: icsText(instance.summary), location: icsText(instance.event.location) };
}

function icsText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (value && typeof value === "object" && "val" in value && typeof value.val === "string") return value.val.trim();
  return "";
}

function overlaps(start: string, end: string, from: Date, to: Date): boolean {
  const a = Date.parse(start);
  const b = Date.parse(end);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return true;
  return a < to.getTime() && from.getTime() < b;
}

function wallDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

async function readLimited(res: Response): Promise<string> {
  if (!res.body) throw new Error("Google カレンダーを読めません。");
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BYTES) {
      await reader.cancel();
      throw new Error("Google カレンダーが大きすぎます。");
    }
    chunks.push(value);
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
}
