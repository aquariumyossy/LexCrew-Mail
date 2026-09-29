import { CHARS_PER_TOKEN, TOOL_RESULT_BUDGET_RATIO } from "./constants";

export type ContextMessage = {
  role: string;
  content?: string;
  tool_calls?: Array<{ function: { name: string; arguments: string } }>;
};

export function estimateTokens(text: string): number {
  return Math.ceil((text || "").length / CHARS_PER_TOKEN);
}

export function messageTokens(message: ContextMessage): number {
  let total = estimateTokens(message.content || "");
  for (const call of message.tool_calls || []) {
    total += estimateTokens(call.function.name) + estimateTokens(call.function.arguments);
  }
  return total + 4;
}

export function messagesTokens(messages: ContextMessage[]): number {
  return messages.reduce((total, message) => total + messageTokens(message), 0);
}

function truncate(text: string, maxTokens: number): string {
  const maxChars = Math.max(0, Math.floor(maxTokens * CHARS_PER_TOKEN));
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, maxChars)}\n…（長いので省略しました）`;
}

/** Shrink the oldest tool results until they fit their share of the window. */
export function capToolResults<T extends ContextMessage>(messages: T[], limit: number): T[] {
  const budget = Math.floor(limit * TOOL_RESULT_BUDGET_RATIO);
  const toolIndexes = messages
    .map((message, index) => (message.role === "tool" ? index : -1))
    .filter((index) => index >= 0);
  let used = toolIndexes.reduce((total, index) => total + messageTokens(messages[index]), 0);
  if (used <= budget) {
    return messages;
  }
  const out = [...messages];
  for (const index of toolIndexes) {
    if (used <= budget) {
      break;
    }
    const before = messageTokens(out[index]);
    const shrunk = { ...out[index], content: truncate(out[index].content || "", 40) };
    out[index] = shrunk;
    used -= before - messageTokens(shrunk);
  }
  return out;
}

/**
 * Drop whole exchanges from the front until the request fits. An assistant turn
 * with tool calls leaves with its tool replies.
 */
export function dropOldest<T extends ContextMessage>(messages: T[], limit: number): T[] {
  const pinnedFront = messages[0]?.role === "system" ? 1 : 0;
  const out = [...messages];
  while (messagesTokens(out) > limit && out.length > pinnedFront + 1) {
    const dropped = out.splice(pinnedFront, 1)[0];
    if (dropped.tool_calls?.length) {
      while (out[pinnedFront]?.role === "tool") {
        out.splice(pinnedFront, 1);
      }
    }
  }
  return out;
}

/** A copy for one request. The caller's turn array stays intact. */
export function fitContext<T extends ContextMessage>(messages: T[], limit: number): T[] {
  return dropOldest(capToolResults(messages, limit), limit);
}
