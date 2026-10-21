import { HostMode, MailDraft, asStringList, emptyDraft } from "../shared/draft";
import { historyKey } from "./conversationState";
import { parseConversation, sealDraftWrite, ThreadMessage } from "../shared/draftGate";
import { Party, normalizeAddress } from "../shared/memory";
import { Appointment, formatLocal } from "../shared/freeSlots";
import { MailFontStamp } from "../shared/mailFont";
import { NeedsReplyScanRequest } from "../shared/needsReply";

type KuruHost = {
  getContext(): string;
  readItem(): string;
  readParties(): string;
  readHeader(): string;
  readConversation(): string;
  writeDraft(json: string): string;
  readCalendar(json: string): string;
  listMailFiles(): string;
  readMailFile(index: number): Promise<string>;
  searchSent(json: string): Promise<string>;
  searchNeedsReply?(json: string): Promise<string>;
  selectNeedsReply?(json: string): Promise<string>;
  openNeedsReply?(json: string): Promise<string>;
};

export type MailWellFile = { index: number; name: string; size: number };

function bridge(): KuruHost {
  const host = (window as unknown as { kuru?: KuruHost }).kuru;
  if (!host) {
    throw new Error("Outlook の LexCrew から開いてください。");
  }
  return host;
}

export function outlookReady(): boolean {
  return Boolean((window as unknown as { kuru?: KuruHost }).kuru);
}

export function currentHostMode(): HostMode {
  const parsed = JSON.parse(bridge().getContext()) as { mode?: HostMode };
  return parsed.mode ?? "none";
}

export const HOST_ITEM_UNKNOWN = "このウィンドウのメールを特定できません。";

export function readHostContext(): { conversationId: string; itemId: string; error: string; mode: string } {
  const parsed = JSON.parse(bridge().getContext()) as {
    conversationId?: unknown;
    itemId?: unknown;
    error?: unknown;
    mode?: unknown;
  };
  return {
    conversationId: typeof parsed.conversationId === "string" ? parsed.conversationId : "",
    itemId: typeof parsed.itemId === "string" ? parsed.itemId : "",
    error: typeof parsed.error === "string" ? parsed.error : "",
    mode: typeof parsed.mode === "string" ? parsed.mode : "",
  };
}

function readContext(): { conversationId: string; itemId: string; error: string; mode: string } {
  return readHostContext();
}

export function openThreadKey(): string {
  if (!outlookReady()) return "";
  return readContext().conversationId;
}

export function openItemId(): string {
  if (!outlookReady()) return "";
  return readContext().itemId;
}

export function conversationKey(): string {
  const context = readContext();
  const stored = sessionStorage.getItem("kuru.tempKey");
  const temp = stored || `temp_${Date.now().toString(36)}`;
  if (!stored && !context.conversationId && !context.itemId) {
    sessionStorage.setItem("kuru.tempKey", temp);
  }
  return historyKey(context.conversationId, context.itemId, temp);
}

export type OpenItem = MailDraft & { from: string };

export type MailHeader = {
  subject: string;
  from: string;
  to: string[];
  cc: string[];
  bcc: string[];
};

export function readMailHeader(): MailHeader | null {
  if (!outlookReady()) return null;
  try {
    const parsed = JSON.parse(bridge().readHeader()) as {
      ok?: unknown;
      subject?: unknown;
      from?: unknown;
      to?: unknown;
      cc?: unknown;
      bcc?: unknown;
    };
    if (parsed.ok !== true) return null;
    return {
      subject: typeof parsed.subject === "string" ? parsed.subject : "",
      from: typeof parsed.from === "string" ? parsed.from : "",
      to: asStringList(parsed.to),
      cc: asStringList(parsed.cc),
      bcc: asStringList(parsed.bcc),
    };
  } catch {
    return null;
  }
}

export function readConversation(): { messages: ThreadMessage[]; source: string } {
  if (!outlookReady()) return { messages: [], source: "" };
  try {
    const parsed = JSON.parse(bridge().readConversation()) as { source?: unknown };
    const source = typeof parsed.source === "string" ? parsed.source.slice(0, 400_000) : "";
    return { messages: parseConversation(parsed), source };
  } catch {
    return { messages: [], source: "" };
  }
}

export function readParties(): Party[] {
  if (!outlookReady()) return [];
  try {
    const parsed = JSON.parse(bridge().readParties()) as { parties?: unknown };
    if (!Array.isArray(parsed.parties)) return [];
    const parties: Party[] = [];
    for (const row of parsed.parties) {
      if (!row || typeof row !== "object") continue;
      const record = row as { role?: unknown; name?: unknown; address?: unknown };
      const role = record.role;
      if (role !== "from" && role !== "to" && role !== "cc" && role !== "bcc") continue;
      const address = normalizeAddress(typeof record.address === "string" ? record.address : "");
      if (!address) continue;
      parties.push({ role, name: typeof record.name === "string" ? record.name : "", address });
    }
    return parties;
  } catch {
    return [];
  }
}

export async function readOpenItem(): Promise<OpenItem> {
  const parsed = JSON.parse(bridge().readItem()) as MailDraft & { error?: string; from?: unknown; preface?: unknown };
  if (parsed.error) {
    throw new Error(parsed.error);
  }
  const { error: _error, preface: _preface, ...fields } = parsed;
  return {
    ...emptyDraft(),
    ...fields,
    citations: parsed.citations ?? [],
    from: typeof parsed.from === "string" ? parsed.from : "",
  };
}

export async function readCalendar(from: Date, to: Date): Promise<Appointment[]> {
  const result = bridge().readCalendar(JSON.stringify({ from: formatLocal(from), to: formatLocal(to) }));
  const parsed = JSON.parse(result) as { error?: string; appointments?: Appointment[] };
  if (parsed.error) {
    throw new Error(parsed.error);
  }
  return Array.isArray(parsed.appointments) ? parsed.appointments : [];
}

export function listMailFiles(): { files: MailWellFile[]; error?: string } {
  const parsed = JSON.parse(bridge().listMailFiles()) as { files?: MailWellFile[]; error?: string };
  return { files: Array.isArray(parsed.files) ? parsed.files : [], error: parsed.error };
}

export async function readMailFile(index: number): Promise<ArrayBuffer> {
  const raw = await bridge().readMailFile(index);
  let value: unknown = raw;
  if (typeof value === "string") {
    value = JSON.parse(value);
  }
  if (typeof value === "string") {
    value = JSON.parse(value);
  }
  const parsed = value as { data?: string; error?: string };
  if (parsed.error) {
    throw new Error(parsed.error);
  }
  if (!parsed.data) {
    throw new Error("添付の中身が空です。");
  }
  const binary = atob(parsed.data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export type SentMailHit = {
  subject: string;
  to: string;
  addresses: string[];
  sentOn: string;
  folder: string;
  excerpt: string;
  prior: string;
};

export type ReceivedMailHit = {
  subject: string;
  from: string;
  address: string;
  receivedOn: string;
  folder: string;
  excerpt: string;
};

export async function searchSentMail(query: string, address: string): Promise<{ sent: SentMailHit[]; received: ReceivedMailHit[] }> {
  const raw = await bridge().searchSent(JSON.stringify({ q: query, address }));
  let value: unknown = raw;
  if (typeof value === "string") {
    value = JSON.parse(value);
  }
  if (typeof value === "string") {
    value = JSON.parse(value);
  }
  const parsed = value as { error?: string; sent?: SentMailHit[]; received?: ReceivedMailHit[] };
  if (!parsed || typeof parsed !== "object") {
    throw new Error("送信済みの検索結果が不正です。");
  }
  if (parsed.error) {
    throw new Error(parsed.error);
  }
  return {
    sent: Array.isArray(parsed.sent) ? parsed.sent : [],
    received: Array.isArray(parsed.received) ? parsed.received : [],
  };
}

export async function writeDraft(draft: MailDraft, font: MailFontStamp, options?: { headerApproved?: boolean }): Promise<string> {
  const result = bridge().writeDraft(
    JSON.stringify({ ...sealDraftWrite(draft, options?.headerApproved === true), mailFont: font })
  );
  if (result.startsWith("エラー:")) {
    throw new Error(result.slice("エラー:".length).trim());
  }
  return result;
}

const NEEDS_REPLY_ADDIN = "要返信の検索には、この版のアドインを入れ直してください。";

function hostJson(raw: unknown): unknown {
  let value = raw;
  for (let i = 0; i < 2 && typeof value === "string"; i += 1) {
    value = JSON.parse(value);
  }
  return value;
}

function needsReplyError(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const error = (value as { error?: unknown }).error;
  return typeof error === "string" && error.trim() ? error.trim() : null;
}

export async function scanNeedsReply(request: NeedsReplyScanRequest): Promise<unknown> {
  const host = bridge();
  if (typeof host.searchNeedsReply !== "function") throw new Error(NEEDS_REPLY_ADDIN);
  return hostJson(await host.searchNeedsReply(JSON.stringify(request)));
}

async function ackNeedsReply(kind: "select" | "open", entryId: string, storeId: string): Promise<void> {
  const host = bridge();
  const call = kind === "select" ? host.selectNeedsReply : host.openNeedsReply;
  if (typeof call !== "function") throw new Error(NEEDS_REPLY_ADDIN);
  const error = needsReplyError(hostJson(await call(JSON.stringify({ entryId, storeId }))));
  if (error) throw new Error(error);
}

export function jumpToNeedsReply(entryId: string, storeId: string): Promise<void> {
  return ackNeedsReply("select", entryId, storeId);
}

export function openNeedsReplyWindow(entryId: string, storeId: string): Promise<void> {
  return ackNeedsReply("open", entryId, storeId);
}
