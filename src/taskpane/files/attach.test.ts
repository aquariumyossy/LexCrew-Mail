import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Settings } from "../api";
import { badgeLabel, ingestBytes } from "./attach";
import { ocrBytes } from "./ocr";
import { readBytes } from "./read";

vi.mock("./read", () => ({
  readBytes: vi.fn(),
}));

vi.mock("./ocr", () => ({
  ocrBytes: vi.fn(),
}));

vi.mock("../api", () => ({
  readImage: vi.fn(),
}));

const base = { id: "1", name: "scan.pdf", size: 4, mtime: 0 };
const bytes = new ArrayBuffer(4);
const signal = new AbortController().signal;

function connection(llmBaseUrl: string, llmApiKey: string): Settings {
  return { llmBaseUrl, llmApiKey } as Settings;
}

beforeEach(() => {
  vi.mocked(readBytes).mockReset();
  vi.mocked(ocrBytes).mockReset();
});

describe("badgeLabel", () => {
  it("names a scan that is waiting for the button", () => {
    expect(badgeLabel({ ...base, status: "needsOcr", pages: 3 })).toBe("OCR待ち");
    expect(badgeLabel({ ...base, status: "ready", origin: "text", body: "本文", truncated: false })).toBe("読取済");
  });
});

describe("ingestBytes", () => {
  it("leaves a mail scan waiting and does not call the vision model", async () => {
    vi.mocked(readBytes).mockResolvedValue({ status: "scan", pages: 4 });
    const seen: Array<{ status: string; pages?: number }> = [];
    const onRemote = vi.fn();
    await ingestBytes({
      name: base.name,
      bytes,
      base,
      settings: connection("https://llm.example", "key"),
      signal,
      onUpdate: (source) => seen.push(source),
      onRemote,
      deferScan: true,
    });
    expect(ocrBytes).not.toHaveBeenCalled();
    expect(onRemote).not.toHaveBeenCalled();
    expect(seen.at(-1)).toEqual({ ...base, status: "needsOcr", pages: 4 });
  });

  it("still finishes a text file when the scan would wait", async () => {
    vi.mocked(readBytes).mockResolvedValue({ status: "text", text: { origin: "text", body: "本文", truncated: false } });
    const seen: Array<{ status: string; body?: string }> = [];
    await ingestBytes({
      name: "memo.txt",
      bytes,
      base: { ...base, name: "memo.txt" },
      settings: connection("", ""),
      signal,
      onUpdate: (source) => seen.push(source),
      onRemote: () => undefined,
      deferScan: true,
    });
    expect(ocrBytes).not.toHaveBeenCalled();
    expect(seen.at(-1)).toMatchObject({ status: "ready", origin: "text", body: "本文" });
  });

  it("starts OCR for a scan the user picked", async () => {
    vi.mocked(readBytes).mockResolvedValue({ status: "scan", pages: 2 });
    vi.mocked(ocrBytes).mockResolvedValue({ origin: "ocr", body: "読んだ", truncated: false });
    const seen: Array<{ status: string; body?: string }> = [];
    await ingestBytes({
      name: base.name,
      bytes,
      base,
      settings: connection("http://127.0.0.1:9", "key"),
      signal,
      onUpdate: (source) => seen.push(source),
      onRemote: () => undefined,
    });
    expect(ocrBytes).toHaveBeenCalledTimes(1);
    expect(seen.at(-1)).toMatchObject({ status: "ready", origin: "ocr", body: "読んだ" });
  });
});
