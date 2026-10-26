import { indexHitsForModel } from "../shared/argos";
import { decideApply, MailDraft, parseMailDraft } from "../shared/draft";
import { refuseStaleWrite } from "./conversationState";
import { DraftChange, gateDraftWrite, ThreadSnapshot } from "../shared/draftGate";
import { draftForeignError } from "../shared/japaneseHan";
import { sanitizeMailHtml } from "../shared/mailHtml";
import { fitContext } from "../shared/context";
import { mailFontStamp } from "../shared/mailFont";
import { systemPrompt } from "../shared/prompts";
import { compactSearchReplay } from "../shared/searchReplay";
import {
  TOOL_APPLY_DRAFT,
  TOOL_FIND_FREE_SLOTS,
  TOOL_FIND_NEEDS_REPLY,
  TOOL_GET_OPEN_ITEM,
  TOOL_LIST_EVENTS,
  TOOL_SEARCH,
  TOOL_SEARCH_INDEX,
  TOOL_SEARCH_SENT,
  ToolCall,
  buildTools,
  normalizeMaxToolRounds,
  parseToolCall,
  toolRoundLimitNotice,
} from "../shared/tools";
import { presentUntrusted, stripSteeringMarks } from "../shared/untrusted";
import { Settings, StoredChatMessage, chat, searchArgos, searchWeb } from "./api";
import { currentHostMode, readOpenItem, searchSentMail, writeDraft } from "./host";
import { collectEvents, collectFreeSlots } from "./slots";

type ChatMessage = StoredChatMessage & { reasoning_content?: string };

export async function runTurn(input: {
  settings: Settings;
  history: StoredChatMessage[];
  instruction: string;
  hasFiles?: boolean;
  memory: string;
  mail: string;
  mailData?: string;
  pathPrefixes: string[];
  readThread?: () => ThreadSnapshot;
  confirmDraft?: (changes: DraftChange[]) => Promise<boolean>;
  confirmSearch?: (query: string) => Promise<string | null>;
  onNeedsReply?: (call: {
    days?: number;
    sender: string;
    messages: Array<{
      role: string;
      content: string;
      tool_calls?: ChatMessage["tool_calls"];
      tool_call_id?: string;
    }>;
  }) => Promise<string>;
  currentItemId?: () => string;
  signal: AbortSignal;
  onDelta: (snapshot: { content: string; reasoningContent: string }) => void;
  onMessage: (message: StoredChatMessage) => void;
}): Promise<void> {
  const searxng = Boolean(input.settings.searxngUrl.trim());
  const argos = Boolean(input.settings.argosBaseUrl.trim());
  const tools = buildTools({ searxng, argos });
  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt({ files: input.hasFiles, now: new Date(), searxng, argos, memory: input.memory, mail: input.mail }) },
    ...(input.mailData ? [{ role: "user" as const, content: input.mailData }] : []),
    ...input.history.map((message) => ({
      role: message.role,
      content: message.content,
      tool_calls: message.tool_calls,
      tool_call_id: message.tool_call_id,
    })),
    { role: "user", content: input.instruction },
  ];
  const maxRounds = normalizeMaxToolRounds(input.settings.maxToolRounds);
  let round = 0;
  while (true) {
    if (round >= maxRounds) {
      input.onMessage({ role: "assistant", content: toolRoundLimitNotice(maxRounds) });
      return;
    }
    input.signal.throwIfAborted();
    input.onDelta({ content: "", reasoningContent: "" });
    const completion = await chat(input.settings, fitContext(compactSearchReplay(messages), input.settings.contextLimit), tools, {
      signal: input.signal,
      onDelta: input.onDelta,
    });
    const assistant: StoredChatMessage = {
      role: "assistant",
      content: completion.content,
      reasoningContent: completion.reasoningContent,
      tool_calls: completion.toolCalls,
    };
    input.onMessage(assistant);
    messages.push({
      role: "assistant",
      content: completion.content,
      reasoning_content: completion.reasoningContent || undefined,
      tool_calls: completion.toolCalls.length ? completion.toolCalls : undefined,
    });
    if (!completion.toolCalls.length) return;
    for (const call of completion.toolCalls) {
      input.signal.throwIfAborted();
      const content = await executeTool(call, messages, input);
      const toolMessage: StoredChatMessage = { role: "tool", content, tool_call_id: call.id };
      messages.push({ role: "tool", content, tool_call_id: call.id });
      input.onMessage(toolMessage);
    }
    round += 1;
  }
}

async function executeTool(
  call: ToolCall,
  messages: ChatMessage[],
  input: {
    settings: Settings;
    pathPrefixes: string[];
    readThread?: () => ThreadSnapshot;
    confirmDraft?: (changes: DraftChange[]) => Promise<boolean>;
    confirmSearch?: (query: string) => Promise<string | null>;
    onNeedsReply?: (call: {
    days?: number;
    sender: string;
    messages: Array<{
      role: string;
      content: string;
      tool_calls?: ChatMessage["tool_calls"];
      tool_call_id?: string;
    }>;
  }) => Promise<string>;
    currentItemId?: () => string;
    signal: AbortSignal;
  }
): Promise<string> {
  const parsed = parseToolCall(call);
  if (!parsed.ok) return `エラー: ${parsed.error}`;
  const settings = input.settings;
  try {
    if (parsed.tool.name === TOOL_GET_OPEN_ITEM) {
      return presentUntrusted("open-mail", await readOpenItem());
    }
    if (parsed.tool.name === TOOL_FIND_FREE_SLOTS) {
      return JSON.stringify(await collectFreeSlots(settings, parsed.tool.call));
    }
    if (parsed.tool.name === TOOL_LIST_EVENTS) {
      return JSON.stringify(await collectEvents(settings, parsed.tool.query));
    }
    if (parsed.tool.name === TOOL_APPLY_DRAFT) {
      return applyDraft(parsed.tool.draft, input);
    }
    if (parsed.tool.name === TOOL_SEARCH) {
      return searchWithConfirmation(parsed.tool.q, input);
    }
    if (parsed.tool.name === TOOL_SEARCH_INDEX) {
      const result = await searchArgos(settings, parsed.tool.q, input.pathPrefixes);
      const hits = indexHitsForModel(result.results);
      return hits.length ? presentUntrusted("argos-result", hits) : "ヒットなし";
    }
    if (parsed.tool.name === TOOL_SEARCH_SENT) {
      const result = await searchSentMail(parsed.tool.q, parsed.tool.address);
      return result.sent.length || result.received.length ? JSON.stringify(result) : "ヒットなし";
    }
    if (parsed.tool.name === TOOL_FIND_NEEDS_REPLY) {
      if (!input.onNeedsReply) return "エラー: 要返信の一覧を開けません。";
      return input.onNeedsReply({
        days: parsed.tool.days,
        sender: parsed.tool.sender,
        messages: messages.map((row) => ({
          role: row.role,
          content: row.content || "",
          tool_calls: row.tool_calls,
          tool_call_id: row.tool_call_id,
        })),
      });
    }
  } catch (error) {
    return `エラー: ${error instanceof Error ? error.message : "失敗しました。"}`;
  }
  return "エラー: 未知のツールです。";
}

async function applyDraft(
  raw: unknown,
  input: {
    settings: Settings;
    readThread?: () => ThreadSnapshot;
    confirmDraft?: (changes: DraftChange[]) => Promise<boolean>;
    currentItemId?: () => string;
    signal: AbortSignal;
  }
): Promise<string> {
  const boundItem = input.currentItemId?.() ?? "";
  const parsed = parseMailDraft(raw);
  if (!parsed.ok) return `エラー: ${parsed.error}`;
  const draft: MailDraft = { ...parsed.draft, bodyHtml: sanitizeMailHtml(parsed.draft.bodyHtml) };
  const foreign = draftForeignError(draft);
  if (foreign) return `エラー: ${foreign}`;
  const gate = decideApply(currentHostMode());
  if (!gate.ok) return `エラー: ${gate.error}`;
  let toWrite = draft;
  let headerApproved = false;
  if (draft.subject.trim() || draft.to !== undefined || draft.cc !== undefined || draft.bcc !== undefined) {
    if (!input.readThread) return "エラー: 件名または宛先を確認できません。";
    let thread: ThreadSnapshot;
    try {
      thread = input.readThread();
    } catch (error) {
      return `エラー: ${error instanceof Error ? error.message : "宛先を確認できません。"}`;
    }
    const gated = await gateDraftWrite(draft, thread, input.confirmDraft);
    input.signal.throwIfAborted();
    if (!gated.ok) return `エラー: ${gated.error}`;
    toWrite = { ...gated.draft, bodyHtml: draft.bodyHtml, citations: draft.citations };
    headerApproved = gated.headerApproved;
  }
  const stale = refuseStaleWrite(boundItem, input.currentItemId?.() ?? "");
  if (stale) return `エラー: ${stale}`;
  return writeDraft(toWrite, mailFontStamp(input.settings), { headerApproved });
}

async function searchWithConfirmation(
  query: string,
  input: {
    settings: Settings;
    confirmSearch?: (query: string) => Promise<string | null>;
    signal: AbortSignal;
  }
): Promise<string> {
  if (!input.confirmSearch) return "エラー: ウェブ検索は確認できません。";
  const shown = stripSteeringMarks(query).trim();
  const edited = await input.confirmSearch(shown);
  input.signal.throwIfAborted();
  if (edited === null) return "エラー: ウェブ検索はキャンセルされました。";
  const q = stripSteeringMarks(edited).trim();
  if (!q) return "エラー: 検索語を入力してください。";
  const result = await searchWeb(input.settings, q);
  return presentUntrusted("web-search", result.results.slice(0, 5));
}
