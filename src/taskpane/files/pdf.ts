import { copyArrayBuffer } from "../../shared/copyBytes";
import { GlobalWorkerOptions, getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs";

/* global URL, window */

/**
 * The worker is a file beside the task pane, not a bundle chunk. Named `.js`
 * so the host serves it as script. An absolute URL, because pdf.js falls back
 * to importing this path on the main thread when workers are refused.
 */
GlobalWorkerOptions.workerSrc = new URL("assets/pdf.worker.js", window.location.href).href;

const PDF_ASSETS = new URL("assets/pdf/", window.location.href).href;

export type PdfHandle = {
  doc: PDFDocumentProxy;
  close: () => Promise<void>;
};

export async function openPdf(bytes: ArrayBuffer): Promise<PdfHandle> {
  const task = getDocument({
    data: copyArrayBuffer(bytes),
    // Without the CMap, a Japanese text layer comes back empty and the file
    // is sent to the vision model as if it were a scan.
    cMapUrl: `${PDF_ASSETS}cmaps/`,
    standardFontDataUrl: `${PDF_ASSETS}standard_fonts/`,
    wasmUrl: `${PDF_ASSETS}wasm/`,
    iccUrl: `${PDF_ASSETS}iccs/`,
  });
  const doc = await task.promise;
  return { doc, close: () => task.destroy() };
}

/** One string per page, in order, so an empty layer is visible as such. */
export async function readPdfPages(doc: PDFDocumentProxy, maxChars: number): Promise<string[]> {
  const pages: string[] = [];
  let used = 0;
  for (let number = 1; number <= doc.numPages; number += 1) {
    if (used >= maxChars) {
      break;
    }
    const page = await doc.getPage(number);
    try {
      const content = await page.getTextContent();
      const parts: string[] = [];
      for (const item of content.items) {
        if (!("str" in item)) {
          continue;
        }
        parts.push(item.str);
        if (item.hasEOL) {
          parts.push("\n");
        }
      }
      const text = parts.join("").slice(0, Math.max(0, maxChars - used));
      pages.push(text);
      used += text.length;
    } finally {
      page.cleanup();
    }
  }
  return pages;
}
