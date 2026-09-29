import { CALENDAR_UNREAD_NOTE, CalendarEvent, EventQuery, resolveRange, selectEvents } from "../shared/calendarEvents";
import { Appointment, findFreeSlots, FreeSlot, slotWindow } from "../shared/freeSlots";
import { readGoogleCalendar, slotQueryFromSettings, Settings } from "./api";
import { readCalendar } from "./host";

const UNREAD = "予定表は読んでいません。候補は対応時間だけです。";

export async function loadAppointments(settings: Settings, from: Date, to: Date): Promise<Appointment[]> {
  const appointments: Appointment[] = [];
  if (settings.calendarOutlook) {
    appointments.push(...(await readCalendar(from, to)));
  }
  if (settings.calendarGoogle) {
    const url = settings.googleIcalUrl.trim();
    if (!url) throw new Error("Google カレンダーの非公開 URL を入力してください。");
    appointments.push(...(await readGoogleCalendar(url, from, to)));
  }
  return appointments;
}

export async function collectFreeSlots(settings: Settings): Promise<{ slots: FreeSlot[]; note: string; events: number }> {
  const now = new Date();
  const range = slotWindow(now);
  const appointments = await loadAppointments(settings, range.from, range.to);
  const found = findFreeSlots(now, appointments, slotQueryFromSettings(settings));
  if (settings.calendarOutlook || settings.calendarGoogle) {
    return { ...found, events: appointments.length };
  }
  return { ...found, note: found.note ? `${found.note} ${UNREAD}` : UNREAD, events: 0 };
}

export async function collectEvents(
  settings: Settings,
  query: EventQuery,
  now = new Date()
): Promise<{ events: CalendarEvent[]; note: string }> {
  const range = resolveRange(now, query);
  if (!range.ok) throw new Error(range.error);
  if (!settings.calendarOutlook && !settings.calendarGoogle) {
    return { events: [], note: CALENDAR_UNREAD_NOTE };
  }
  return selectEvents(await loadAppointments(settings, range.from, range.to), query.q);
}
