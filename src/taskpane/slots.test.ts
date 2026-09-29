import { CALENDAR_UNREAD_NOTE } from "../shared/calendarEvents";
import { Settings } from "./api";
import { collectEvents } from "./slots";

const off = { calendarOutlook: false, calendarGoogle: false, googleIcalUrl: "" } as Settings;
const outlook = { calendarOutlook: true, calendarGoogle: false, googleIcalUrl: "" } as Settings;

describe("collectEvents", () => {
  it("says the calendar was not read when both sources are off", async () => {
    await expect(collectEvents(off, { kind: "preset", preset: "today", q: "" }, new Date(2026, 8, 29))).resolves.toEqual({
      events: [],
      note: CALENDAR_UNREAD_NOTE,
    });
  });

  it("throws when the calendar cannot be read instead of reporting no events", async () => {
    await expect(collectEvents(outlook, { kind: "preset", preset: "today", q: "" }, new Date(2026, 8, 29))).rejects.toThrow();
  });
});
