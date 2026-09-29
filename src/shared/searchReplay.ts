import { TOOL_SEARCH, TOOL_SEARCH_INDEX, TOOL_SEARCH_SENT } from "./tools";

export type ReplayMessage = {
  role: string;
  content?: string;
  tool_calls?: Array<{ id?: string; function: { name: string } }>;
  tool_call_id?: string;
};

const OMIT_PREFIX = "本文は省略した。要るときは同じ語で呼び直す。\n";

type Compactor = (parsed: unknown) => unknown | null;

function compactHitArray(parsed: unknown): unknown | null {
  if (!Array.isArray(parsed)) return null;
  const out: Array<Record<string, unknown>> = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const { content: _drop, ...rest } = item as Record<string, unknown>;
    out.push(rest);
  }
  return out;
}

function stripExcerptPrior(items: unknown[]): Array<Record<string, unknown>> | null {
  const out: Array<Record<string, unknown>> = [];
  for (const item of items) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const { excerpt: _e, prior: _p, ...rest } = item as Record<string, unknown>;
    out.push(rest);
  }
  return out;
}

function compactSentMail(parsed: unknown): unknown | null {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const row = parsed as { sent?: unknown; received?: unknown };
  if (!Array.isArray(row.sent) || !Array.isArray(row.received)) return null;
  const sent = stripExcerptPrior(row.sent);
  const received = stripExcerptPrior(row.received);
  if (!sent || !received) return null;
  return { ...row, sent, received };
}

const COMPACTORS: Record<string, Compactor> = {
  [TOOL_SEARCH]: compactHitArray,
  [TOOL_SEARCH_INDEX]: compactHitArray,
  [TOOL_SEARCH_SENT]: compactSentMail,
};

function compactedContent(toolName: string, content: string): string | undefined {
  const compact = COMPACTORS[toolName];
  if (!compact) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return undefined;
  }
  const next = compact(parsed);
  if (next === null) return undefined;
  return `${OMIT_PREFIX}${JSON.stringify(next)}`;
}

export function compactSearchReplay<T extends ReplayMessage>(messages: T[]): T[] {
  const userIndexes = messages
    .map((row, index) => (row.role === "user" ? index : -1))
    .filter((index) => index >= 0);
  if (userIndexes.length < 2) return [...messages];

  const cutoff = userIndexes[userIndexes.length - 2];
  const idToName = new Map<string, string>();
  for (const row of messages) {
    for (const call of row.tool_calls || []) {
      if (call.id) idToName.set(call.id, call.function.name);
    }
  }

  return messages.map((row, index) => {
    if (index >= cutoff || row.role !== "tool") return row;
    const name = row.tool_call_id ? idToName.get(row.tool_call_id) : undefined;
    if (!name) return row;
    const next = compactedContent(name, row.content || "");
    if (next === undefined) return row;
    return { ...row, content: next };
  });
}
