import { formatLocal } from "../shared/freeSlots";
import { appointmentsFromIcs, assertGoogleIcalUrl } from "./ical";

const from = new Date(2026, 8, 1);
const to = new Date(2026, 9, 1);

function ics(body: string): string {
  return `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${body}END:VCALENDAR\r\n`;
}

describe("appointmentsFromIcs", () => {
  it("keeps a timed event as local wall clock", () => {
    const start = new Date(Date.UTC(2026, 8, 28, 0, 0));
    const end = new Date(Date.UTC(2026, 8, 28, 1, 0));
    const found = appointmentsFromIcs(
      ics("BEGIN:VEVENT\r\nUID:a\r\nDTSTART:20260928T000000Z\r\nDTEND:20260928T010000Z\r\nSUMMARY:meet\r\nEND:VEVENT\r\n"),
      from,
      to
    );
    expect(found).toEqual([{ start: formatLocal(start), end: formatLocal(end), busy: true, allDay: false, subject: "meet", location: "" }]);
  });

  it("keeps an all-day event on the ICS date", () => {
    const found = appointmentsFromIcs(
      ics("BEGIN:VEVENT\r\nUID:b\r\nDTSTART;VALUE=DATE:20260925\r\nDTEND;VALUE=DATE:20260926\r\nSUMMARY:off\r\nEND:VEVENT\r\n"),
      from,
      to
    );
    expect(found).toEqual([{ start: "2026-09-25T00:00:00", end: "2026-09-26T00:00:00", busy: true, allDay: true, subject: "off", location: "" }]);
  });

  it("marks a transparent event free and drops a cancelled event", () => {
    const found = appointmentsFromIcs(
      ics(
        [
          "BEGIN:VEVENT",
          "UID:c",
          "DTSTART:20260928T000000Z",
          "DTEND:20260928T010000Z",
          "TRANSP:TRANSPARENT",
          "END:VEVENT",
          "BEGIN:VEVENT",
          "UID:d",
          "DTSTART:20260928T020000Z",
          "DTEND:20260928T030000Z",
          "STATUS:CANCELLED",
          "END:VEVENT",
        ].join("\r\n") + "\r\n"
      ),
      from,
      to
    );
    expect(found).toHaveLength(1);
    expect(found[0]?.busy).toBe(false);
    expect(found[0]?.subject).toBe("");
  });

  it("keeps a summary and a location, including a summary with a language parameter", () => {
    const found = appointmentsFromIcs(
      ics("BEGIN:VEVENT\r\nUID:g\r\nDTSTART:20260928T000000Z\r\nDTEND:20260928T010000Z\r\nSUMMARY;LANGUAGE=ja:口頭弁論\r\nLOCATION:東京地裁\r\nEND:VEVENT\r\n"),
      from,
      to
    );
    expect(found).toHaveLength(1);
    expect(found[0]?.subject).toBe("口頭弁論");
    expect(found[0]?.location).toBe("東京地裁");
  });

  it("expands a weekly event and skips EXDATE", () => {
    const found = appointmentsFromIcs(
      ics(
        [
          "BEGIN:VEVENT",
          "UID:e",
          "DTSTART:20260907T000000Z",
          "DTEND:20260907T010000Z",
          "RRULE:FREQ=WEEKLY;COUNT=4",
          "EXDATE:20260914T000000Z",
          "END:VEVENT",
        ].join("\r\n") + "\r\n"
      ),
      from,
      to
    );
    const starts = found.map((row) => row.start);
    expect(starts).toContain(formatLocal(new Date(Date.UTC(2026, 8, 7, 0, 0))));
    expect(starts).not.toContain(formatLocal(new Date(Date.UTC(2026, 8, 14, 0, 0))));
    expect(starts).toContain(formatLocal(new Date(Date.UTC(2026, 8, 21, 0, 0))));
  });

  it("keeps an event that started before the window", () => {
    const found = appointmentsFromIcs(
      ics("BEGIN:VEVENT\r\nUID:f\r\nDTSTART:20260831T230000Z\r\nDTEND:20260901T020000Z\r\nEND:VEVENT\r\n"),
      new Date(2026, 8, 1, 0, 0),
      new Date(2026, 8, 2, 0, 0)
    );
    expect(found).toHaveLength(1);
    expect(found[0]?.start).toBe(formatLocal(new Date(Date.UTC(2026, 7, 31, 23, 0))));
  });
});

describe("assertGoogleIcalUrl", () => {
  it("accepts a private Google calendar URL and rejects anything else", () => {
    expect(assertGoogleIcalUrl("https://calendar.google.com/calendar/ical/a/private-x/basic.ics").hostname).toBe("calendar.google.com");
    expect(() => assertGoogleIcalUrl("http://calendar.google.com/calendar/ical/a/basic.ics")).toThrow("非公開 URL");
    expect(() => assertGoogleIcalUrl("https://evil.example/calendar/ical/a/basic.ics")).toThrow("非公開 URL");
    expect(() => assertGoogleIcalUrl("https://user:secret@calendar.google.com/calendar/ical/a/basic.ics")).toThrow("非公開 URL");
    expect(() => assertGoogleIcalUrl("not a url")).toThrow("不正");
  });
});
