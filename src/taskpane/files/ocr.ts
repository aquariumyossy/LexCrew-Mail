import { MAX_OCR_PAGES, RASTER_QUALITY, RASTER_WIDTH } from "../../shared/constants";
import { FileBody, FileReadError, pdfPagesToText } from "../../shared/attachedFiles";
import { EMPTY_SCAN_ERROR } from "../../shared/ocr";
import { openPdf } from "./pdf";

/* global AbortSignal, File, HTMLCanvasElement, document, FileReader */

function canvasImage(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL("image/jpeg", RASTER_QUALITY);
}

/** A picture is already an image, so it goes to the model as it stands. */
export function imageDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new FileReadError("画像を読み込めませんでした。"));
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      if (result.startsWith("data:image/")) {
        resolve(result);
      } else {
        reject(new FileReadError("画像として読み込めませんでした。"));
      }
    };
    reader.readAsDataURL(file);
  });
}

async function renderPdfPages(
  bytes: ArrayBuffer,
  limit: number,
  onPage: (page: string, index: number) => Promise<void>,
  signal: AbortSignal
): Promise<void> {
  const handle = await openPdf(bytes);
  try {
    const pages = Math.min(handle.doc.numPages, limit);
    for (let number = 1; number <= pages; number += 1) {
      signal.throwIfAborted();
      const page = await handle.doc.getPage(number);
      try {
        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: RASTER_WIDTH / base.width });
        const canvas = document.createElement("canvas");
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        const context = canvas.getContext("2d");
        if (!context) {
          throw new FileReadError("このパソコンでは PDF を画像にできませんでした。");
        }
        await page.render({ canvas, canvasContext: context, viewport }).promise;
        await onPage(canvasImage(canvas), number - 1);
        canvas.width = 0;
        canvas.height = 0;
      } finally {
        page.cleanup();
      }
    }
  } finally {
    await handle.close();
  }
}

export async function ocrBytes(
  input: { name: string; bytes: ArrayBuffer; image: boolean },
  pages: number,
  readPage: (image: string, signal: AbortSignal) => Promise<string>,
  onProgress: (done: number, total: number) => void,
  signal: AbortSignal
): Promise<FileBody & { truncated: boolean }> {
  const total = Math.min(Math.max(1, pages), MAX_OCR_PAGES);
  const read: string[] = [];
  const page = async (image: string, index: number) => {
    signal.throwIfAborted();
    read[index] = await readPage(image, signal);
    onProgress(read.filter((item) => item !== undefined).length, total);
  };
  if (input.image || !input.name.toLowerCase().endsWith(".pdf")) {
    await page(await imageDataUrl(new Blob([input.bytes])), 0);
  } else {
    await renderPdfPages(input.bytes, total, page, signal);
  }
  const text = pdfPagesToText(read, "ocr");
  if (!text.body) {
    throw new FileReadError(EMPTY_SCAN_ERROR);
  }
  return { ...text, truncated: pages > total };
}
