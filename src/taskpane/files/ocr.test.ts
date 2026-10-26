import { afterEach, describe, expect, it, vi } from "vitest";
import { ocrBytes } from "./ocr";

vi.mock("./pdf", () => ({
  openPdf: vi.fn(),
}));

/**
 * Node has no FileReader. Browsers turn a blob with no type into
 * application/octet-stream, and imageDataUrl refuses that URL.
 */
function installBrowserDataUrlReader(): void {
  class BrowserFileReader {
    result: string | null = null;
    onload: null | (() => void) = null;
    onerror: null | (() => void) = null;
    readAsDataURL(blob: Blob): void {
      const type = blob.type || "application/octet-stream";
      void blob.arrayBuffer().then(
        (buffer) => {
          this.result = `data:${type};base64,${Buffer.from(buffer).toString("base64")}`;
          this.onload?.();
        },
        () => {
          this.onerror?.();
        }
      );
    }
  }
  vi.stubGlobal("FileReader", BrowserFileReader);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const signal = new AbortController().signal;

async function readAsImage(name: string, bytes: ArrayBuffer): Promise<string> {
  let seen = "";
  const text = await ocrBytes(
    { name, bytes, image: true },
    1,
    async (image) => {
      seen = image;
      return "読んだ";
    },
    () => undefined,
    signal
  );
  expect(text).toEqual({ origin: "ocr", body: "読んだ", truncated: false });
  return seen;
}

describe("ocrBytes images", () => {
  it("sends 20261021mints.png to the model as an image data url", async () => {
    installBrowserDataUrlReader();
    const bytes = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).buffer;
    const url = await readAsImage("20261021mints.png", bytes);
    expect(url).toBe(`data:image/png;base64,${Buffer.from(bytes).toString("base64")}`);
  });

  it("keeps the mime of every picture type the app already accepts", async () => {
    installBrowserDataUrlReader();
    const bytes = Uint8Array.from([1, 2, 3, 4]).buffer;
    const payload = Buffer.from(bytes).toString("base64");
    const cases: Array<[string, string]> = [
      ["図.PNG", "image/png"],
      ["図.jpg", "image/jpeg"],
      ["図.JPEG", "image/jpeg"],
      ["図.jpe", "image/jpeg"],
      ["図.gif", "image/gif"],
      ["図.webp", "image/webp"],
    ];
    for (const [name, mime] of cases) {
      expect(await readAsImage(name, bytes)).toBe(`data:${mime};base64,${payload}`);
    }
  });
});
