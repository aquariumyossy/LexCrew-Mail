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
  if (source.status === "extracting") {
    return "読み取り中";
  }
  if (source.status === "ocr") {
    return `${source.done}/${source.total} ページ`;
  }
  if (source.status === "error") {
    return source.message;
  }
  return "読取済";
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

/** Shared read for a picked file and for a mail attachment. The caller owns the row. */
export async function ingestBytes(options: {
  name: string;
  bytes: ArrayBuffer;
  base: { id: string; name: string; size: number; mtime: number };
  settings: Settings;
  signal: AbortSignal;
  onUpdate: (source: FileSource) => void;
  onRemote: () => void;
}): Promise<void> {
  const { base, signal, onUpdate } = options;
  onUpdate({ ...base, status: "extracting" });
  const read = await readBytes(options.name, options.bytes);
  if (read.status === "text") {
    onUpdate({ ...base, status: "ready", ...read.text });
    return;
  }
  if (!options.settings.llmBaseUrl.trim() || !options.settings.llmApiKey.trim()) {
    throw new FileReadError("画像を読むには接続の設定が必要です。設定で URL と APIキーを入れてください。");
  }
  if (!isLoopbackUrl(options.settings.llmBaseUrl)) {
    options.onRemote();
  }
  onUpdate({ ...base, status: "ocr", done: 0, total: read.pages });
  const text = await ocrBytes(
    { name: options.name, bytes: options.bytes, image: fileKind(options.name) === "image" },
    read.pages,
    (image, pageSignal) => readImage(options.settings, image, pageSignal),
    (done, total) => onUpdate({ ...base, status: "ocr", done, total }),
    signal
  );
  onUpdate({ ...base, status: "ready", origin: text.origin, body: text.body, truncated: text.truncated });
}
