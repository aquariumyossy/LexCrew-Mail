import { describe, expect, it } from "vitest";
import { LAN_HTTP_WARNING, plainHttpLanWarning } from "./endpoint";

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
