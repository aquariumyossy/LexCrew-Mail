import {
  CHARS_PER_TOKEN,
  CONVERSATION_BUDGET_RATIO,
  FILE_BUDGET_RATIO,
  MAX_ATTACHED_FILES,
  MAX_FILE_CHARS,
  MAX_IMAGE_BYTES,
  MAX_PDF_BYTES,
} from "./constants";

export type FileOrigin = "text" | "ocr";

export type FileIdentity = { size: number; mtime: number };

export type FileBody = {
  origin: FileOrigin;
  body: string;
  truncated: boolean;
};

export type CommittedFile = { id: string; name: string; via?: "mail" } & FileBody & FileIdentity;

type Picked = { id: string; name: string } & FileIdentity;

export type FileSource =
  | (Picked & { status: "extracting" })
  | (Picked & { status: "ocr"; done: number; total: number })
  | (Picked & { status: "ready" } & FileBody)
  | (Picked & { status: "error"; message: string });

export type FileKind = "pdf" | "text" | "image" | "docx" | "sheet";

export class FileReadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FileReadError";
  }
}

const KINDS: Record<string, FileKind> = {
  pdf: "pdf",
  txt: "text",
  md: "text",
  markdown: "text",
  png: "image",
  jpg: "image",
  jpeg: "image",
  jpe: "image",
  gif: "image",
  webp: "image",
  docx: "docx",
  xlsx: "sheet",
};

const KNOWN_UNSUPPORTED: Record<string, string> = {
  doc: "古い .doc は読めません。.docx で保存し直してください。",
  xls: "古い .xls は読めません。.xlsx で保存し直してください。",
  jtd: "一太郎の .jtd は読めません。PDF か .docx にしてください。",
  pptx: "PowerPoint は読めません。PDF にしてください。",
  ppt: "PowerPoint は読めません。PDF にしてください。",
};

export const ACCEPTED_EXTENSIONS = Object.keys(KINDS).map((ext) => `.${ext}`);

export function fileExtension(name: string): string {
  const dot = (name || "").lastIndexOf(".");
  return dot < 0 ? "" : name.slice(dot + 1).toLowerCase();
}

export function fileKind(name: string): FileKind | null {
  return KINDS[fileExtension(name)] || null;
}

export function maxBytes(kind: FileKind): number {
  return kind === "image" ? MAX_IMAGE_BYTES : MAX_PDF_BYTES;
}

function mib(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))}MB`;
}

/** Why this file cannot be attached, or an empty string when it can. */
export function rejectReason(file: { name: string; size: number }): string {
  const ext = fileExtension(file.name);
  const kind = fileKind(file.name);
  if (!kind) {
    return KNOWN_UNSUPPORTED[ext] || "この形式は読めません。PDF・テキスト・画像・Word・Excel のいずれかにしてください。";
  }
  if (file.size <= 0) {
    return "中身が空です。";
  }
  const limit = maxBytes(kind);
  if (file.size > limit) {
    return `${mib(limit)} を超えるので読めません。`;
  }
  return "";
}

export function tooManyFiles(attached: number, adding: number): boolean {
  return attached + adding > MAX_ATTACHED_FILES;
}

export function decodeUtf8(bytes: ArrayBuffer | Uint8Array): string {
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let text: string;
  try {
    text = decoder.decode(bytes);
  } catch {
    throw new FileReadError("文字コードが UTF-8 ではありません。UTF-8 で保存し直してください。");
  }
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/**
 * A PDF with nothing on its text layer is a scan. One readable character is
 * enough to trust the layer. Rasterising a file that already carries text
 * costs a vision call per page.
 */
export function pdfHasTextLayer(pages: string[]): boolean {
  return pages.some((page) => page.trim().length > 0);
}

export function pdfPagesToText(pages: string[], origin: FileOrigin = "text"): FileBody {
  const body = pages
    .map((page) => page.replace(/[ \t]+\n/g, "\n").trim())
    .filter((page) => page.length > 0)
    .join("\n\n");
  return { origin, body, truncated: false };
}

export function sameFile(a: { name: string } & FileIdentity, b: { name: string } & FileIdentity): boolean {
  return a.name === b.name && a.size === b.size && a.mtime === b.mtime;
}

export function mergeFiles(kept: CommittedFile[], incoming: CommittedFile[]): CommittedFile[] {
  const out = [...kept];
  for (const file of incoming) {
    const byId = out.findIndex((row) => row.id === file.id);
    if (byId >= 0) {
      out[byId] = file;
      continue;
    }
    const byName = out.findIndex((row) => row.name === file.name && (row.via ?? "") === (file.via ?? ""));
    if (byName >= 0) {
      out[byName] = file;
      continue;
    }
    out.push(file);
  }
  return out;
}

export function isPending(source: FileSource): boolean {
  return source.status === "extracting" || source.status === "ocr";
}

export function isReady(source: FileSource): source is Extract<FileSource, { status: "ready" }> {
  return source.status === "ready";
}

export function commit(source: Extract<FileSource, { status: "ready" }>): CommittedFile {
  return {
    id: source.id,
    name: source.name,
    size: source.size,
    mtime: source.mtime,
    origin: source.origin,
    body: source.body,
    truncated: source.truncated,
  };
}

/**
 * How many characters of attached file may ride along. `reservedChars` is what
 * the rest of this request already takes, so a narrow window still leaves room
 * for the conversation.
 */
export function fileCharBudget(contextLimit: number, reservedChars = 0): number {
  if (!Number.isFinite(contextLimit) || contextLimit <= 0) {
    return 0;
  }
  const fromLimit = Math.floor(contextLimit * FILE_BUDGET_RATIO * CHARS_PER_TOKEN);
  const forAttachments = Math.floor(contextLimit * (1 - CONVERSATION_BUDGET_RATIO) * CHARS_PER_TOKEN);
  const room = forAttachments - Math.max(0, reservedChars);
  return Math.max(0, Math.min(MAX_FILE_CHARS, fromLimit, room));
}

/**
 * Split a budget over sizes so no one file starves the others. Everyone gets an
 * equal share, and whatever a small file leaves over goes back to the large ones.
 */
export function shareOut(sizes: number[], budget: number): number[] {
  const out = sizes.map(() => 0);
  let remaining = Math.max(0, budget);
  let open = sizes.map((_, index) => index);
  while (open.length > 0 && remaining > 0) {
    const share = Math.floor(remaining / open.length);
    if (share <= 0) {
      break;
    }
    const over = open.filter((index) => sizes[index] > share);
    if (over.length === open.length) {
      for (const index of open) {
        out[index] = share;
      }
      return out;
    }
    let used = 0;
    for (const index of open) {
      if (sizes[index] <= share) {
        out[index] = sizes[index];
        used += sizes[index];
      }
    }
    remaining -= used;
    open = over;
  }
  return out;
}

function capBody<T extends FileBody>(file: T, allowance: number): T {
  if (file.body.length <= allowance) {
    return file;
  }
  return { ...file, body: file.body.slice(0, allowance), truncated: true };
}

/** Fit the conversation's files into this turn's budget, fairly. */
export function clampFiles(files: CommittedFile[], budget: number): CommittedFile[] {
  const sizes = files.map((file) => file.body.length);
  const total = sizes.reduce((sum, size) => sum + size, 0);
  if (total <= budget) {
    return files;
  }
  const allowances = shareOut(sizes, budget);
  return files.map((file, index) => capBody(file, allowances[index]));
}

export const FILES_MARKER = "--- 添付ファイル ---";
export const TRUNCATION_NOTE = "…（この先は長いので添付していません）";

const ORIGIN_LABELS: Record<FileOrigin, string> = {
  text: "テキスト読み取り",
  ocr: "OCR 読み取り",
};

function fileBlock(file: CommittedFile, index: number): string {
  const lines = [`[${index}] ${file.name}（${ORIGIN_LABELS[file.origin]}）`, file.body || "（本文は読み取れませんでした）"];
  if (file.truncated) {
    lines.push(TRUNCATION_NOTE);
  }
  return lines.join("\n");
}

export function renderFilesForModel(files: CommittedFile[]): string {
  if (!files.length) {
    return "";
  }
  return `\n\n${FILES_MARKER}\n${files.map((file, index) => fileBlock(file, index + 1)).join("\n\n")}`;
}

/** What the transcript keeps. The names and the size, never the text. */
export function filesStub(files: CommittedFile[]): string {
  const lines = files.map((file, index) => {
    const chars = file.body.length.toLocaleString("ja-JP");
    const cut = file.truncated ? "、長いので途中まで" : "";
    return `[${index + 1}] ${file.name} ${chars} 字${cut}`;
  });
  lines.push("（資料はこの会話に保存してあり、毎ターン渡しています）");
  return lines.join("\n");
}

export function ridingFiles(files: CommittedFile[], contextLimit: number, reservedChars = 0): CommittedFile[] {
  return clampFiles(files, fileCharBudget(contextLimit, reservedChars));
}

export function modelTurnText(instruction: string, files: CommittedFile[], contextLimit: number, reservedChars = 0): string {
  return instruction + renderFilesForModel(ridingFiles(files, contextLimit, reservedChars));
}

export function historyTurnText(instruction: string, files: CommittedFile[], contextLimit: number, reservedChars = 0): string {
  const riding = ridingFiles(files, contextLimit, reservedChars);
  if (!riding.length) {
    return instruction;
  }
  return `${instruction}\n\n${FILES_MARKER}\n${filesStub(riding)}`;
}

/** The stored user line. The marker is the same one `historyTurnText` writes. */
export function splitHistoryFiles(content: string): { instruction: string; files: string } {
  const marker = `\n\n${FILES_MARKER}\n`;
  const at = content.indexOf(marker);
  if (at < 0) {
    return { instruction: content, files: "" };
  }
  return { instruction: content.slice(0, at), files: content.slice(at + marker.length) };
}

export function filesChars(files: CommittedFile[]): number {
  return files.reduce((total, file) => total + file.body.length, 0);
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/** Stored transcripts are untyped until this parse. Image bytes are not a field. */
export function parseCommittedFiles(value: unknown): CommittedFile[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const out: CommittedFile[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") {
      continue;
    }
    const row = raw as Record<string, unknown>;
    const origin = row.origin === "ocr" ? "ocr" : row.origin === "text" ? "text" : null;
    const id = str(row.id);
    const name = str(row.name);
    if (!origin || !id || !name) {
      continue;
    }
    const file: CommittedFile = {
      id,
      name,
      origin,
      body: str(row.body),
      truncated: row.truncated === true,
      size: num(row.size),
      mtime: num(row.mtime),
    };
    if (row.via === "mail") {
      file.via = "mail";
    }
    out.push(file);
  }
  return out;
}
