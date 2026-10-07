import { indexHitsForModel } from "../shared/argos";
import { decideApply, parseMailDraft } from "../shared/draft";
import { draftForeignError } from "../shared/japaneseHan";
import { fitContext } from "../shared/context";
import { mailFontStamp } from "../shared/mailFont";
import { systemPrompt } from "../shared/prompts";
import { compactSearchReplay } from "../shared/searchReplay";
import {
  TOOL_APPLY_DRAFT,
  TOOL_FIND_FREE_SLOTS,
  TOOL_GET_OPEN_ITEM,
  TOOL_LIST_EVENTS,
  TOOL_SEARCH,
  TOOL_SEARCH_INDEX,
  TOOL_SEARCH_SENT,
  ToolCall,
  UNLIMITED_TOOL_ROUNDS,
  buildTools,
  parseToolCall,
  toolRoundLimitNotice,
} from "../shared/tools";
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
  pathPrefixes: string[];
  signal: AbortSignal;
  onDelta: (snapshot: { content: string; reasoningContent: string }) => void;
  onMessage: (message: StoredChatMessage) => void;
}): Promise<void> {
  const searxng = Boolean(input.settings.searxngUrl.trim());
  const argos = Boolean(input.settings.argosBaseUrl.trim());
  const tools = buildTools({ searxng, argos });
  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt({ files: input.hasFiles, now: new Date(), searxng, argos, memory: input.memory, mail: input.mail }) },
    ...input.history.map((message) => ({
      role: message.role,
      content: message.content,
      tool_calls: message.tool_calls,
      tool_call_id: message.tool_call_id,
    })),
    { role: "user", content: input.instruction },
  ];
  const maxRounds = input.settings.maxToolRounds;
  let round = 0;
  while (true) {
    if (maxRounds !== UNLIMITED_TOOL_ROUNDS && round >= maxRounds) {
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
      const content = await executeTool(call, input.settings, input.pathPrefixes);
      const toolMessage: StoredChatMessage = { role: "tool", content, tool_call_id: call.id };
      messages.push({ role: "tool", content, tool_call_id: call.id });
      input.onMessage(toolMessage);
    }
    round += 1;
  }
}

async function executeTool(call: ToolCall, settings: Settings, pathPrefixes: string[]): Promise<string> {
  const parsed = parseToolCall(call);
  if (!parsed.ok) return `エラー: ${parsed.error}`;
  try {
    if (parsed.tool.name === TOOL_GET_OPEN_ITEM) {
      return JSON.stringify(await readOpenItem());
    }
    if (parsed.tool.name === TOOL_FIND_FREE_SLOTS) {
      return JSON.stringify(await collectFreeSlots(settings, parsed.tool.call));
    }
    if (parsed.tool.name === TOOL_LIST_EVENTS) {
      return JSON.stringify(await collectEvents(settings, parsed.tool.query));
    }
    if (parsed.tool.name === TOOL_APPLY_DRAFT) {
      const draft = parseMailDraft(parsed.tool.draft);
      if (!draft.ok) return `エラー: ${draft.error}`;
      const foreign = draftForeignError(draft.draft);
      if (foreign) return `エラー: ${foreign}`;
      const gate = decideApply(currentHostMode());
      if (!gate.ok) return `エラー: ${gate.error}`;
      return await writeDraft(draft.draft, mailFontStamp(settings));
    }
    if (parsed.tool.name === TOOL_SEARCH) {
      const result = await searchWeb(settings, parsed.tool.q);
      return JSON.stringify(result.results.slice(0, 5));
    }
    if (parsed.tool.name === TOOL_SEARCH_INDEX) {
      const result = await searchArgos(settings, parsed.tool.q, pathPrefixes);
      const hits = indexHitsForModel(result.results);
      return hits.length ? JSON.stringify(hits) : "ヒットなし";
    }
    if (parsed.tool.name === TOOL_SEARCH_SENT) {
      const result = await searchSentMail(parsed.tool.q, parsed.tool.address);
      return result.sent.length || result.received.length ? JSON.stringify(result) : "ヒットなし";
    }
  } catch (error) {
    return `エラー: ${error instanceof Error ? error.message : "失敗しました。"}`;
  }
  return "エラー: 未知のツールです。";
}
