import { describe, expect, it } from "vitest";
import { MAX_OCR_PAGE_CHARS, RASTER_QUALITY, RASTER_WIDTH } from "./constants";
import { EMPTY_SCAN_ERROR, OCR_PROMPT, clipPage, isLoopbackUrl, visionUnsupportedMessage } from "./ocr";

describe("OCR_PROMPT", () => {
  it("asks for the text as written, and a blank page stays blank", () => {
    expect(OCR_PROMPT).toContain("そのまま書き出して");
    expect(OCR_PROMPT).toContain("要約");
    expect(OCR_PROMPT).toContain("空で返して");
    expect(EMPTY_SCAN_ERROR).toContain("読み取れません");
  });

  it("writes chart edges under 〔図〕 and does not invent kinship", () => {
    expect(OCR_PROMPT).toContain("〔図〕");
    expect(OCR_PROMPT).toContain("山田太郎 → 山田花子");
    expect(OCR_PROMPT).toContain("山田太郎 ┄ 山田花子");
    expect(OCR_PROMPT).toContain("端点は箱の文字を短くせず");
    expect(OCR_PROMPT).toContain("親子、婚姻、養子とは書きません");
    expect(OCR_PROMPT).toContain("タブ区切り");
    expect(OCR_PROMPT).toContain("表は図にしません");
    expect(OCR_PROMPT).toContain("図が無いページでは「〔図〕」を書きません");
  });
});

describe("raster constants", () => {
  it("keeps the width and quality that preserved a thin stroke", () => {
    expect(RASTER_WIDTH).toBe(1700);
    expect(RASTER_QUALITY).toBe(0.92);
  });
});

describe("visionUnsupportedMessage", () => {
  it("names the setting to change when the model cannot see", () => {
    for (const detail of [
      "this model does not support image input",
      "Vision is not enabled for this deployment",
      "invalid request: content must be a string",
    ]) {
      expect(visionUnsupportedMessage(detail)).toContain("画像に対応したモデル");
    }
  });

  it("leaves an unrelated failure to be reported as it came", () => {
    expect(visionUnsupportedMessage("context length exceeded")).toBeNull();
    expect(visionUnsupportedMessage("")).toBeNull();
  });
});

describe("isLoopbackUrl", () => {
  it("knows the pictures are staying on this machine", () => {
    for (const url of ["http://127.0.0.1:8080/v1", "https://localhost:28765", "http://[::1]:1234/v1", "127.0.0.1:8080"]) {
      expect(isLoopbackUrl(url)).toBe(true);
    }
  });

  it("treats anything else, including an empty setting, as elsewhere", () => {
    for (const url of ["https://api.example.com/v1", "http://192.168.1.20:8080", "", "   "]) {
      expect(isLoopbackUrl(url)).toBe(false);
    }
  });
});

describe("clipPage", () => {
  it("clips a long page on a character boundary", () => {
    const long = "あ".repeat(MAX_OCR_PAGE_CHARS + 10);
    expect([...clipPage(long)].length).toBe(MAX_OCR_PAGE_CHARS);
    expect(clipPage("第1条")).toBe("第1条");
  });
});
