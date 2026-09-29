import { normalizeCalendarSource } from "./api";

describe("normalizeCalendarSource", () => {
  it("defaults to Outlook only and drops garbage", () => {
    expect(normalizeCalendarSource(null)).toEqual({
      calendarOutlook: true,
      calendarGoogle: false,
      googleIcalUrl: "",
    });
    expect(
      normalizeCalendarSource({
        calendarOutlook: "no" as unknown as boolean,
        calendarGoogle: 1 as unknown as boolean,
        googleIcalUrl: "  https://calendar.google.com/calendar/ical/a/basic.ics  ",
      })
    ).toEqual({
      calendarOutlook: true,
      calendarGoogle: false,
      googleIcalUrl: "https://calendar.google.com/calendar/ical/a/basic.ics",
    });
    expect(normalizeCalendarSource({ calendarOutlook: false, calendarGoogle: true, googleIcalUrl: "" })).toEqual({
      calendarOutlook: false,
      calendarGoogle: true,
      googleIcalUrl: "",
    });
  });
});