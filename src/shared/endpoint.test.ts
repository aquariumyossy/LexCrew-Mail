import { describe, expect, it } from "vitest";
import { LAN_HTTP_WARNING, lanHttpDismissalKey, plainHttpLanWarning, visibleLanHttpWarning, withLanHttpDismissed } from "./endpoint";

describe("plainHttpLanWarning", () => {
  it("warns for plain http to a LAN host", () => {
    expect(plainHttpLanWarning("http://192.168.1.8:8000/v1")).toBe(LAN_HTTP_WARNING);
    expect(plainHttpLanWarning("HTTP://10.0.0.2/v1")).toBe(LAN_HTTP_WARNING);
  });

  it("stays quiet for https, loopback, and an empty setting", () => {
    expect(plainHttpLanWarning("https://192.168.1.8/v1")).toBeNull();
    expect(plainHttpLanWarning("http://127.0.0.1:8000/v1")).toBeNull();
    expect(plainHttpLanWarning("http://localhost:8000/v1")).toBeNull();
    expect(plainHttpLanWarning("http://[::1]:8000/v1")).toBeNull();
    expect(plainHttpLanWarning("")).toBeNull();
    expect(plainHttpLanWarning("192.168.1.8:8000")).toBeNull();
  });
});

describe("visible LAN notice", () => {
  const lan = "http://192.168.1.8:8000/v1";
  const other = "http://10.0.0.2/v1";

  it("hides the notice after that URL is dismissed", () => {
    const dismissed = withLanHttpDismissed({ llmBaseUrl: lan, dismissedLanHttpUrl: "" }, lan);
    expect(visibleLanHttpWarning(lan, "")).toBe(LAN_HTTP_WARNING);
    expect(visibleLanHttpWarning(dismissed.llmBaseUrl, dismissed.dismissedLanHttpUrl)).toBeNull();
    expect(plainHttpLanWarning(lan)).toBe(LAN_HTTP_WARNING);
  });

  it("stays dismissed for the same URL, including surrounding spaces", () => {
    const dismissed = withLanHttpDismissed({ llmBaseUrl: `  ${lan}  `, dismissedLanHttpUrl: "" }, `  ${lan}  `);
    expect(dismissed.dismissedLanHttpUrl).toBe(lanHttpDismissalKey(lan));
    expect(visibleLanHttpWarning(lan, dismissed.dismissedLanHttpUrl)).toBeNull();
    expect(visibleLanHttpWarning(`  ${lan}  `, dismissed.dismissedLanHttpUrl)).toBeNull();
  });

  it("shows again when the URL changes to another plain LAN address", () => {
    const dismissed = withLanHttpDismissed({ llmBaseUrl: lan, dismissedLanHttpUrl: "" }, lan);
    expect(visibleLanHttpWarning(other, dismissed.dismissedLanHttpUrl)).toBe(LAN_HTTP_WARNING);
    expect(plainHttpLanWarning(other)).toBe(LAN_HTTP_WARNING);
    expect(visibleLanHttpWarning("https://192.168.1.8/v1", "")).toBeNull();
    expect(visibleLanHttpWarning("http://127.0.0.1:8000/v1", "")).toBeNull();
  });
});
