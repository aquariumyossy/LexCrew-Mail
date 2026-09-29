import { describe, expect, it } from "vitest";
import { mailFontSizeFromInput, mailFontStamp, normalizeMailFontId, normalizeMailFontSizePt } from "./mailFont";

describe("normalizeMailFontId", () => {
  it("falls back to Yu Gothic for unknown or non-string ids", () => {
    expect(normalizeMailFontId("comic-sans")).toBe("yu-gothic");
    expect(normalizeMailFontId(3)).toBe("yu-gothic");
    expect(normalizeMailFontId(undefined)).toBe("yu-gothic");
    expect(normalizeMailFontId("meiryo")).toBe("meiryo");
  });
});

describe("normalizeMailFontSizePt", () => {
  it("falls back to 10.5 for invalid sizes", () => {
    for (const value of [undefined, "10.5", 10.2, 7, 40, Number.NaN]) {
      expect(normalizeMailFontSizePt(value)).toBe(10.5);
    }
  });

  it("keeps sizes on the half-point grid", () => {
    for (const value of [10.5, 11, 8, 36]) {
      expect(normalizeMailFontSizePt(value)).toBe(value);
    }
  });
});

describe("mailFontStamp", () => {
  it("keeps Calibri as its own far-east name", () => {
    expect(mailFontStamp({ mailFontId: "calibri", mailFontSizePt: 11 })).toEqual({ ascii: "Calibri", fareast: "Calibri", sizePt: 11 });
  });

  it("resolves Yu Gothic", () => {
    expect(mailFontStamp({ mailFontId: "yu-gothic", mailFontSizePt: 10.5 })).toEqual({ ascii: "Yu Gothic", fareast: "游ゴシック", sizePt: 10.5 });
  });
});

describe("mailFontSizeFromInput", () => {
  it("rejects empty, off-step, and out-of-range input", () => {
    expect(mailFontSizeFromInput("")).toBeNull();
    expect(mailFontSizeFromInput("10.2")).toBeNull();
    expect(mailFontSizeFromInput("7")).toBeNull();
    expect(mailFontSizeFromInput("10.5")).toBe(10.5);
    expect(mailFontSizeFromInput("12")).toBe(12);
  });
});
