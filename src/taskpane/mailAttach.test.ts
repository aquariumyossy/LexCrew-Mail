import { afterEach, describe, expect, it, vi } from "vitest";
import { SETTINGS_STORAGE_KEY } from "../shared/constants";
import { loadSettings, normalizeReadMailAttachments } from "./api";
import { planMailAttach } from "./mailAttach";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("normalizeReadMailAttachments", () => {
  it("defaults to on unless the stored value is a boolean", () => {
    expect(normalizeReadMailAttachments(undefined)).toBe(true);
    expect(normalizeReadMailAttachments("no")).toBe(true);
    expect(normalizeReadMailAttachments(false)).toBe(false);
    expect(normalizeReadMailAttachments(true)).toBe(true);
  });

  it("keeps an existing saved choice and turns a missing key on", () => {
    stubSettings(null);
    expect(loadSettings().readMailAttachments).toBe(true);
    stubSettings("{}");
    expect(loadSettings().readMailAttachments).toBe(true);
    stubSettings(JSON.stringify({ readMailAttachments: false }));
    expect(loadSettings().readMailAttachments).toBe(false);
    stubSettings(JSON.stringify({ readMailAttachments: "no" }));
    expect(loadSettings().readMailAttachments).toBe(true);
  });
});

describe("loadSettings mail font", () => {
  it("defaults, keeps valid choices, and falls back on bad ones", () => {
    stubSettings(null);
    expect(loadSettings()).toMatchObject({ mailFontId: "yu-gothic", mailFontSizePt: 10.5 });
    stubSettings(JSON.stringify({ mailFontId: "meiryo", mailFontSizePt: 12 }));
    expect(loadSettings()).toMatchObject({ mailFontId: "meiryo", mailFontSizePt: 12 });
    stubSettings(JSON.stringify({ mailFontId: "no", mailFontSizePt: 10.2 }));
    expect(loadSettings()).toMatchObject({ mailFontId: "yu-gothic", mailFontSizePt: 10.5 });
  });
});

describe("planMailAttach", () => {
  const pdf = { index: 1, name: "契約.pdf", size: 10 };
  const doc = { index: 2, name: "別紙.docx", size: 20 };

  it("reads only attachments that are not already held", () => {
    expect(planMailAttach(true, { files: [pdf, doc] }, [{ name: pdf.name, size: pdf.size }])).toEqual({
      kind: "read",
      files: [doc],
    });
    expect(planMailAttach(true, { files: [pdf] }, [{ name: pdf.name, size: 11 }])).toEqual({
      kind: "read",
      files: [pdf],
    });
  });

  it("hints when reading is off and an attachment is still unread", () => {
    expect(planMailAttach(false, { files: [pdf] }, [])).toEqual({ kind: "hint" });
    expect(planMailAttach(false, { files: [pdf] }, [{ name: pdf.name, size: pdf.size }])).toEqual({ kind: "quiet" });
  });

  it("stays quiet when there is nothing to read or the item is not a mail", () => {
    expect(planMailAttach(true, { files: [] }, [])).toEqual({ kind: "quiet" });
    expect(planMailAttach(true, { files: [], error: "メールが選択されていません。" }, [])).toEqual({ kind: "quiet" });
    expect(planMailAttach(false, { files: [], error: "添付を読めるメールがありません。" }, [])).toEqual({ kind: "quiet" });
  });

  it("surfaces an unexpected list error", () => {
    expect(planMailAttach(true, { files: [], error: "添付を読めません。" }, [])).toEqual({
      kind: "error",
      text: "添付を読めません。",
    });
  });
});

function stubSettings(raw: string | null): void {
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => (key === SETTINGS_STORAGE_KEY ? raw : null),
    setItem: () => undefined,
    removeItem: () => undefined,
  });
}
