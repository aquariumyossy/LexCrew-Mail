import { describe, expect, it } from "vitest";
import { copyArrayBuffer } from "./copyBytes";

describe("copyArrayBuffer", () => {
  it("keeps the caller buffer after the copy is transferred like pdf.js does", () => {
    const original = new Uint8Array([0x25, 0x50, 0x44, 0x46]).buffer;
    const copy = copyArrayBuffer(original);
    expect(copy.buffer).not.toBe(original);
    expect([...copy]).toEqual([0x25, 0x50, 0x44, 0x46]);

    const transferred = copy.buffer;
    structuredClone(transferred, { transfer: [transferred] });

    expect(() => new Uint8Array(original)).not.toThrow();
    expect([...new Uint8Array(original)]).toEqual([0x25, 0x50, 0x44, 0x46]);
  });
});
