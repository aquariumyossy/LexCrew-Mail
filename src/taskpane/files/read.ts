import { MAX_FILE_CHARS } from "../../shared/constants";
import {
  FileBody,
  FileReadError,
  decodeUtf8,
  fileKind,
  pdfHasTextLayer,
  pdfPagesToText,
} from "../../shared/attachedFiles";
import { officeText } from "../../shared/extract/package";
import { openPdf, readPdfPages } from "./pdf";

export type ByteRead = { status: "text"; text: FileBody } | { status: "scan"; pages: number };

async function reading<T>(label: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof FileReadError) {
      throw error;
    }
    const detail = error instanceof Error && error.message ? error.message : String(error);
    throw new FileReadError(`${label}を読めませんでした（${detail}）`);
  }
}

async function readPdf(bytes: ArrayBuffer): Promise<ByteRead> {
  const handle = await openPdf(bytes);
  try {
    const pages = await readPdfPages(handle.doc, MAX_FILE_CHARS);
    if (!pdfHasTextLayer(pages)) {
      return { status: "scan", pages: handle.doc.numPages };
    }
    const text = pdfPagesToText(pages, "text");
    return { status: "text", text: capText(text) };
  } finally {
    await handle.close();
  }
}

function capText(text: FileBody): FileBody {
  if (text.body.length <= MAX_FILE_CHARS) {
    return text;
  }
  return { ...text, body: text.body.slice(0, MAX_FILE_CHARS), truncated: true };
}

/** Text layer, plain text, or a scan that still needs a vision read. */
export async function readBytes(name: string, bytes: ArrayBuffer): Promise<ByteRead> {
  const kind = fileKind(name);
  if (kind === "image") {
    return { status: "scan", pages: 1 };
  }
  if (kind === "pdf") {
    return reading("PDF", () => readPdf(bytes));
  }
  if (kind === "text") {
    const body = await reading("ファイル", () => Promise.resolve(decodeUtf8(bytes)));
    return { status: "text", text: capText({ origin: "text", body: body.trim(), truncated: false }) };
  }
  if (kind === "docx" || kind === "sheet") {
    const label = kind === "docx" ? "Word" : "Excel";
    const body = await reading(label, () => officeText(name, bytes));
    return { status: "text", text: capText({ origin: "text", body, truncated: false }) };
  }
  throw new FileReadError("この形式は読めません。PDF・テキスト・画像・Word・Excel のいずれかにしてください。");
}
