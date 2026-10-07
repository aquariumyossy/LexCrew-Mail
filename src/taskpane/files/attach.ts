import {
  FileReadError,
  FileSource,
  fileKind,
} from "../../shared/attachedFiles";
import { isLoopbackUrl } from "../../shared/ocr";
import { Settings, readImage } from "../api";
import { ocrBytes } from "./ocr";
import { readBytes } from "./read";

/* global AbortSignal, File */

export function readErrorMessage(error: unknown): string {
  if (error instanceof FileReadError) {
    return error.message;
  }
  const detail = error instanceof Error && error.message ? error.message : String(error);
  return detail ? `読み取りに失敗しました（${detail}）` : "読み取りに失敗しました。";
}

export function badgeLabel(source: FileSource): string {
  switch (source.status) {
    case "extracting":
      return "読み取り中";
    case "needsOcr":
      return "OCR待ち";
    case "ocr":
      return `${source.done}/${source.total} ページ`;
    case "error":
      return source.message;
    case "ready":
      return "読取済";
    default: {
      const unexpected: never = source;
      return unexpected;
    }
  }
}

/**
 * Reads one picked file. The caller drops the row if the badge was removed,
 * because this function keeps reporting until the read ends.
 */
export async function ingestFile(options: {
  file: File;
  base: { id: string; name: string; size: number; mtime: number };
  settings: Settings;
  signal: AbortSignal;
  onUpdate: (source: FileSource) => void;
  onRemote: () => void;
}): Promise<void> {
  const bytes = await options.file.arrayBuffer();
  options.signal.throwIfAborted();
  await ingestBytes({ ...options, name: options.file.name, bytes });
}

type FileBase = { id: string; name: string; size: number; mtime: number };

/** Vision read for a scan. The caller already decided this file should be read now. */
export async function ocrScan(options: {
  name: string;
  bytes: ArrayBuffer;
  base: FileBase;
  pages: number;
  settings: Settings;
  signal: AbortSignal;
  onUpdate: (source: FileSource) => void;
  onRemote: () => void;
}): Promise<void> {
  const { base, signal, onUpdate } = options;
  if (!options.settings.llmBaseUrl.trim() || !options.settings.llmApiKey.trim()) {
    throw new FileReadError("画像を読むには接続の設定が必要です。設定で URL と APIキーを入れてください。");
  }
  if (!isLoopbackUrl(options.settings.llmBaseUrl)) {
    options.onRemote();
  }
  onUpdate({ ...base, status: "ocr", done: 0, total: options.pages });
  const text = await ocrBytes(
    { name: options.name, bytes: options.bytes, image: fileKind(options.name) === "image" },
    options.pages,
    (image, pageSignal) => readImage(options.settings, image, pageSignal),
    (done, total) => onUpdate({ ...base, status: "ocr", done, total }),
    signal
  );
  onUpdate({ ...base, status: "ready", origin: text.origin, body: text.body, truncated: text.truncated });
}

/** Shared read for a picked file and for a mail attachment. The caller owns the row. */
export async function ingestBytes(options: {
  name: string;
  bytes: ArrayBuffer;
  base: FileBase;
  settings: Settings;
  signal: AbortSignal;
  onUpdate: (source: FileSource) => void;
  onRemote: () => void;
  /** When set, a scan waits instead of calling the vision model. Mail uses this. */
  deferScan?: boolean;
}): Promise<void> {
  const { base, onUpdate } = options;
  onUpdate({ ...base, status: "extracting" });
  const read = await readBytes(options.name, options.bytes);
  if (read.status === "text") {
    onUpdate({ ...base, status: "ready", ...read.text });
    return;
  }
  if (options.deferScan) {
    onUpdate({ ...base, status: "needsOcr", pages: read.pages });
    return;
  }
  await ocrScan({ ...options, pages: read.pages });
}
