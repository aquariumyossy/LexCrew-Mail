import {
  clampTimeoutMs,
  DEFAULT_ARGOS_BASE_URL,
  DEFAULT_CONTEXT_LIMIT,
  DEFAULT_MODEL,
  DEFAULT_THINKING_BUDGET,
  DEFAULT_TIMEOUT_MS,
  MAX_TOOL_ROUNDS,
  SETTINGS_STORAGE_KEY,
} from "../shared/constants";
import { StreamAccumulator, takeSseData } from "../shared/stream";
import { ArgosHit } from "../shared/argos";
import { Appointment, formatLocal, normalizeSlotQuery, SlotQuery } from "../shared/freeSlots";
import { CommittedFile } from "../shared/attachedFiles";
import { normalizeMaxToolRounds, ToolCall, ToolDefinition } from "../shared/tools";
import { normalizeThinkingBudget, normalizeThinkingLevel, ThinkingLevel } from "../shared/thinking";
import { MailFontId, normalizeMailFontId, normalizeMailFontSizePt } from "../shared/mailFont";
import { Memory, PersonNote, WritingNote } from "../shared/memory";
import { applyAdopt, ConnectionFields, ConnectionView, settingsForStorage } from "./connectionState";

export type StoredChatMessage = {
  role: string;
  content: string;
  reasoningContent?: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
};

export type Settings = {
  llmBaseUrl: string;
  llmApiKey: string;
  model: string;
  searxngUrl: string;
  argosBaseUrl: string;
  argosApiKey: string;
  timeoutMs: number;
  thinkingLevel: ThinkingLevel;
  thinkingBudget: number;
  contextLimit: number;
  /** 0 means no cap. */
  maxToolRounds: number;
  excludedWeekdays: number[];
  slotDayStart: string;
  slotDayEnd: string;
  slotMinutes: SlotQuery["slotMinutes"];
  maxSlots: number;
  cooldownMinutes: SlotQuery["cooldownMinutes"];
  slotFromTomorrow: boolean;
  slotFromDayAfter: boolean;
  calendarOutlook: boolean;
  calendarGoogle: boolean;
  googleIcalUrl: string;
  readMailAttachments: boolean;
  mailFontId: MailFontId;
  mailFontSizePt: number;
};

export type TextSetting =
  | "llmBaseUrl"
  | "llmApiKey"
  | "model"
  | "searxngUrl"
  | "argosBaseUrl"
  | "argosApiKey";

function normalizeContextLimit(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return DEFAULT_CONTEXT_LIMIT;
  }
  return Math.round(value);
}

export function loadSettings(): Settings {
  const empty: Settings = {
    llmBaseUrl: "",
    llmApiKey: "",
    model: DEFAULT_MODEL,
    searxngUrl: "",
    argosBaseUrl: DEFAULT_ARGOS_BASE_URL,
    argosApiKey: "",
    timeoutMs: DEFAULT_TIMEOUT_MS,
    thinkingLevel: "medium",
    thinkingBudget: DEFAULT_THINKING_BUDGET,
    contextLimit: DEFAULT_CONTEXT_LIMIT,
    maxToolRounds: MAX_TOOL_ROUNDS,
    ...slotDefaults(),
    ...normalizeCalendarSource(null),
    readMailAttachments: true,
    mailFontId: normalizeMailFontId(undefined),
    mailFontSizePt: normalizeMailFontSizePt(undefined),
  };
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) {
      return empty;
    }
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      ...empty,
      ...parsed,
      timeoutMs: clampTimeoutMs(typeof parsed.timeoutMs === "number" ? parsed.timeoutMs : DEFAULT_TIMEOUT_MS),
      thinkingLevel: normalizeThinkingLevel(parsed.thinkingLevel),
      thinkingBudget: normalizeThinkingBudget(parsed.thinkingBudget),
      contextLimit: normalizeContextLimit(parsed.contextLimit),
      maxToolRounds: normalizeMaxToolRounds(parsed.maxToolRounds),
      ...slotFields(parsed),
      ...normalizeCalendarSource(parsed),
      readMailAttachments: normalizeReadMailAttachments(parsed.readMailAttachments),
      mailFontId: normalizeMailFontId(parsed.mailFontId),
      mailFontSizePt: normalizeMailFontSizePt(parsed.mailFontSizePt),
    };
  } catch {
    return empty;
  }
}

function slotDefaults(): Pick<Settings, "excludedWeekdays" | "slotDayStart" | "slotDayEnd" | "slotMinutes" | "maxSlots" | "cooldownMinutes" | "slotFromTomorrow" | "slotFromDayAfter"> {
  const query = normalizeSlotQuery(null);
  return {
    excludedWeekdays: query.excludedWeekdays,
    slotDayStart: query.dayStart,
    slotDayEnd: query.dayEnd,
    slotMinutes: query.slotMinutes,
    maxSlots: query.maxSlots,
    cooldownMinutes: query.cooldownMinutes,
    slotFromTomorrow: query.fromTomorrow,
    slotFromDayAfter: query.fromDayAfter,
  };
}

export function normalizeReadMailAttachments(value: unknown): boolean {
  return typeof value === "boolean" ? value : true;
}

export function normalizeCalendarSource(parsed: Partial<Pick<Settings, "calendarOutlook" | "calendarGoogle" | "googleIcalUrl">> | null | undefined): Pick<Settings, "calendarOutlook" | "calendarGoogle" | "googleIcalUrl"> {
  const row = parsed ?? {};
  return {
    calendarOutlook: typeof row.calendarOutlook === "boolean" ? row.calendarOutlook : true,
    calendarGoogle: typeof row.calendarGoogle === "boolean" ? row.calendarGoogle : false,
    googleIcalUrl: typeof row.googleIcalUrl === "string" ? row.googleIcalUrl.trim() : "",
  };
}

export function slotQueryFromSettings(settings: Pick<Settings, "excludedWeekdays" | "slotDayStart" | "slotDayEnd" | "slotMinutes" | "maxSlots" | "cooldownMinutes" | "slotFromTomorrow" | "slotFromDayAfter">): SlotQuery {
  return normalizeSlotQuery({
    excludedWeekdays: settings.excludedWeekdays,
    dayStart: settings.slotDayStart,
    dayEnd: settings.slotDayEnd,
    slotMinutes: settings.slotMinutes,
    maxSlots: settings.maxSlots,
    cooldownMinutes: settings.cooldownMinutes,
    fromTomorrow: settings.slotFromTomorrow,
    fromDayAfter: settings.slotFromDayAfter,
  });
}

function slotFields(parsed: Partial<Settings>): ReturnType<typeof slotDefaults> {
  const query = normalizeSlotQuery({
    excludedWeekdays: parsed.excludedWeekdays,
    dayStart: parsed.slotDayStart,
    dayEnd: parsed.slotDayEnd,
    slotMinutes: parsed.slotMinutes,
    maxSlots: parsed.maxSlots,
    cooldownMinutes: parsed.cooldownMinutes,
    fromTomorrow: parsed.slotFromTomorrow,
    fromDayAfter: parsed.slotFromDayAfter,
  });
  return {
    excludedWeekdays: query.excludedWeekdays,
    slotDayStart: query.dayStart,
    slotDayEnd: query.dayEnd,
    slotMinutes: query.slotMinutes,
    maxSlots: query.maxSlots,
    cooldownMinutes: query.cooldownMinutes,
    slotFromTomorrow: query.fromTomorrow,
    slotFromDayAfter: query.fromDayAfter,
  };
}

export async function readGoogleCalendar(url: string, from: Date, to: Date): Promise<Appointment[]> {
  const payload = await postJson<{ appointments?: Appointment[] }>("/api/calendar/ical", {
    url,
    from: formatLocal(from),
    to: formatLocal(to),
  });
  return Array.isArray(payload.appointments) ? payload.appointments : [];
}

let keepConnectionInStorage = true;

export function setKeepConnectionInStorage(keep: boolean): void {
  keepConnectionInStorage = keep;
}

export function saveSettings(settings: Settings): void {
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settingsForStorage(settings, keepConnectionInStorage)));
}

export function connectionFields(settings: Settings): ConnectionFields {
  return {
    llmBaseUrl: settings.llmBaseUrl,
    llmApiKey: settings.llmApiKey,
    searxngUrl: settings.searxngUrl,
  };
}

export async function fetchConnection(): Promise<ConnectionView> {
  const res = await fetch("/api/connection");
  const payload = (await res.json()) as ConnectionView & { error?: string };
  if (!res.ok) throw new Error(payload.error || `通信に失敗しました。${res.status}`);
  return payload;
}

export async function adoptStoredConnection(fields: ConnectionFields): Promise<ConnectionView> {
  return postJson<ConnectionView>("/api/connection", fields);
}

export async function saveStoredConnection(fields: ConnectionFields): Promise<void> {
  const res = await fetch("/api/connection", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fields),
  });
  const payload = (await res.json()) as { error?: string };
  if (!res.ok) throw new Error(payload.error || `通信に失敗しました。${res.status}`);
}

export function takeAdoptedSettings(settings: Settings, result: ConnectionView): Settings {
  const applied = applyAdopt(settings, result);
  setKeepConnectionInStorage(applied.keepConnection);
  return applied.settings;
}

export async function fetchMemory(): Promise<Memory> {
  const res = await fetch("/api/memory");
  const payload = (await res.json()) as Partial<Memory> & { error?: string };
  if (!res.ok) throw new Error(payload.error || `通信に失敗しました。${res.status}`);
  return {
    notes: Array.isArray(payload.notes) ? payload.notes : [],
    people: Array.isArray(payload.people) ? payload.people : [],
  };
}

export async function saveNotes(notes: WritingNote[]): Promise<WritingNote[]> {
  const payload = await sendJson<{ notes: WritingNote[] }>("PUT", "/api/memory/notes", { notes });
  return payload.notes;
}

export async function savePerson(address: string, body: { name: string; text: string }): Promise<PersonNote> {
  return sendJson<PersonNote>("PUT", `/api/memory/people/${encodeURIComponent(address)}`, body);
}

export async function removePerson(address: string): Promise<void> {
  await sendJson<{ ok: boolean }>("DELETE", `/api/memory/people/${encodeURIComponent(address)}`);
}

async function sendJson<T>(method: "PUT" | "DELETE", path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error(payload.error || `通信に失敗しました。${res.status}`);
  return payload;
}

async function postJson<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  const payload = (await res.json()) as T & { error?: string };
  if (!res.ok) {
    throw new Error(payload.error || `通信に失敗しました。${res.status}`);
  }
  return payload;
}

export async function readImage(settings: Settings, image: string, signal?: AbortSignal): Promise<string> {
  const res = await fetch("/api/ocr", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      llmBaseUrl: settings.llmBaseUrl,
      llmApiKey: settings.llmApiKey,
      model: settings.model,
      image,
      timeoutMs: settings.timeoutMs,
    }),
    signal,
  });
  const payload = (await res.json()) as { text?: string; error?: string };
  if (!res.ok) {
    throw new Error(payload.error || `通信に失敗しました。${res.status}`);
  }
  return payload.text ?? "";
}

export async function chat(
  settings: Settings,
  messages: unknown[],
  tools: ToolDefinition[],
  options: { signal?: AbortSignal; onDelta?: (snapshot: { content: string; reasoningContent: string }) => void } = {}
): Promise<{ content: string; reasoningContent: string; toolCalls: ToolCall[] }> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify({
      llmBaseUrl: settings.llmBaseUrl,
      llmApiKey: settings.llmApiKey,
      model: settings.model,
      messages,
      tools,
      timeoutMs: settings.timeoutMs,
      thinkingLevel: settings.thinkingLevel,
      thinkingBudget: settings.thinkingBudget,
    }),
    signal: options.signal,
  });
  if (!res.ok) {
    const payload = (await res.json()) as { error?: string };
    throw new Error(payload.error || `通信に失敗しました。${res.status}`);
  }
  const acc = new StreamAccumulator();
  if (!res.body) throw new Error("ストリーム応答の本体が空です。");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const taken = takeSseData(buffer);
    buffer = taken.rest;
    for (const event of taken.events) {
      if (event === "[DONE]") continue;
      try {
        options.onDelta?.(acc.ingest(JSON.parse(event)));
      } catch (error) {
        if (error instanceof SyntaxError) continue;
        throw error;
      }
    }
  }
  return acc.finish();
}

export function searchWeb(settings: Settings, q: string) {
  return postJson<{ results: Array<{ title: string; url: string; content: string }> }>("/api/search", {
    searxngUrl: settings.searxngUrl,
    q,
  });
}

export function searchArgos(settings: Settings, query: string, pathPrefixes: string[], limit?: number, signal?: AbortSignal) {
  return postJson<{ results: ArgosHit[] }>("/api/argos/search", {
    argosBaseUrl: settings.argosBaseUrl,
    argosApiKey: settings.argosApiKey,
    query,
    pathPrefixes,
    ...(limit ? { limit } : {}),
  }, signal);
}

export type HealthReport = {
  llm?: { ok: boolean; error?: string; models?: string[] };
  searxng?: { ok: boolean; error?: string };
  argos?: { ok: boolean; error?: string };
};

export async function checkHealth(settings: Settings): Promise<HealthReport> {
  const res = await fetch("/api/health", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      llmBaseUrl: settings.llmBaseUrl,
      llmApiKey: settings.llmApiKey,
      searxngUrl: settings.searxngUrl,
      argosBaseUrl: settings.argosBaseUrl,
      argosApiKey: settings.argosApiKey,
    }),
  });
  return (await res.json()) as HealthReport;
}

export function loadScopes(settings: Settings, signal?: AbortSignal) {
  return postJson<{ recent?: ScopeRow[]; scopes?: ScopeRow[] }>("/api/argos/scopes", {
    argosBaseUrl: settings.argosBaseUrl,
    argosApiKey: settings.argosApiKey,
  }, signal);
}

export type ScopeRow = { path: string; label: string; isRoot?: boolean };

export async function listConversations(conversationKey = ""): Promise<Array<{ id: string; title: string; updatedAt: number; conversationKey: string }>> {
  const query = conversationKey ? `?conversationKey=${encodeURIComponent(conversationKey)}` : "";
  const res = await fetch(`/api/conversations${query}`);
  const payload = (await res.json()) as {
    error?: string;
    conversations?: Array<{ id: string; title: string; updatedAt: number; conversationKey?: string }>;
  };
  if (!res.ok) {
    throw new Error(payload.error || "会話を読めません。");
  }
  return (payload.conversations ?? []).map((row) => ({ ...row, conversationKey: row.conversationKey ?? "" }));
}

export async function deleteConversation(id: string): Promise<void> {
  const res = await fetch(`/api/conversations/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const payload = (await res.json()) as { error?: string };
    throw new Error(payload.error || "会話を削除できません。");
  }
}

export function ensureConversation(conversationKey: string, fresh = false) {
  return postJson<{ id: string }>("/api/conversations", { conversationKey, fresh });
}

export async function loadConversation(conversationId: string): Promise<{ messages: StoredChatMessage[]; files: CommittedFile[] }> {
  const res = await fetch(`/api/conversations/${conversationId}`);
  const payload = (await res.json()) as {
    error?: string;
    files?: CommittedFile[];
    messages?: Array<{ role: string; content: string; reasoningContent?: string; toolCallsJson?: string; toolCallId?: string }>;
  };
  if (!res.ok) {
    throw new Error(payload.error || "会話を読めません。");
  }
  return {
    messages: (payload.messages ?? []).map((message) => ({
      role: message.role,
      content: message.content,
      reasoningContent: message.reasoningContent || "",
      tool_calls: message.toolCallsJson ? (JSON.parse(message.toolCallsJson) as ToolCall[]) : undefined,
      tool_call_id: message.toolCallId || undefined,
    })),
    files: Array.isArray(payload.files) ? payload.files : [],
  };
}

export async function loadMessages(conversationId: string): Promise<StoredChatMessage[]> {
  const loaded = await loadConversation(conversationId);
  return loaded.messages;
}

export async function saveConversationFiles(conversationId: string, files: CommittedFile[]): Promise<CommittedFile[]> {
  const res = await fetch(`/api/conversations/${conversationId}/files`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ files }),
  });
  const payload = (await res.json()) as { files?: CommittedFile[]; error?: string };
  if (!res.ok) {
    throw new Error(payload.error || "資料を保存できません。");
  }
  return payload.files ?? [];
}

export function storeMessage(conversationId: string, message: Record<string, unknown>) {
  return postJson<unknown>(`/api/conversations/${conversationId}/messages`, message);
}
