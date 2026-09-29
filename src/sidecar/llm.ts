import { DEFAULT_MODEL, DEFAULT_TIMEOUT_MS } from "../shared/constants";
import { clipPage, OCR_PROMPT } from "../shared/ocr";
import { normalizeThinkingLevel, thinkingFields, ThinkingLevel } from "../shared/thinking";

export type ChatRequest = {
  llmBaseUrl: string;
  llmApiKey: string;
  model: string;
  messages: unknown[];
  tools: unknown[];
  timeoutMs: number;
  thinkingLevel?: ThinkingLevel;
  thinkingBudget?: number;
};

export function chatPayload(request: ChatRequest, stream: boolean, withThinking: boolean): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: request.model || DEFAULT_MODEL,
    messages: request.messages,
  };
  if (stream) body.stream = true;
  if (request.tools.length > 0) {
    body.tools = request.tools;
    body.tool_choice = "auto";
  }
  if (withThinking) {
    Object.assign(body, thinkingFields(normalizeThinkingLevel(request.thinkingLevel), request.thinkingBudget ?? 0));
  }
  return body;
}

export function llmRoot(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "").replace(/\/v1$/, "");
}

export type ChatSink = {
  status(code: number): void;
  setHeader(name: string, value: string): void;
  write(chunk: string | Uint8Array): void;
  end(): void;
  flushHeaders?(): void;
};

async function postUpstream(request: ChatRequest, stream: boolean, signal?: AbortSignal): Promise<Response> {
  const root = llmRoot(request.llmBaseUrl);
  const headers = {
    Authorization: `Bearer ${request.llmApiKey}`,
    "Content-Type": "application/json",
    Accept: stream ? "text/event-stream" : "application/json",
  };
  const send = (withThinking: boolean) =>
    fetch(`${root}/v1/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(chatPayload(request, stream, withThinking)),
      signal: signal ?? AbortSignal.timeout(request.timeoutMs),
    });
  let upstream = await send(true);
  if (upstream.status === 400) {
    await upstream.body?.cancel().catch(() => undefined);
    upstream = await send(false);
  }
  return upstream;
}

export async function pipeChatStream(request: ChatRequest, sink: ChatSink, signal?: AbortSignal): Promise<void> {
  if (!request.llmApiKey.trim()) throw new Error("API キーがありません。");
  if (!request.messages.length) throw new Error("メッセージがありません。");
  const upstream = await postUpstream(request, true, signal);
  if (!upstream.ok) throw new Error(`LLM が失敗しました。${upstream.status}`);
  sink.status(200);
  sink.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  sink.setHeader("Cache-Control", "no-cache");
  sink.setHeader("Connection", "keep-alive");
  sink.flushHeaders?.();
  const contentType = (upstream.headers.get("content-type") || "").toLowerCase();
  if (contentType.includes("event-stream") && upstream.body) {
    const reader = upstream.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        sink.write(value);
      }
    } finally {
      reader.releaseLock();
    }
    sink.end();
    return;
  }
  const payload = await upstream.json();
  sink.write(`data: ${JSON.stringify(payload)}\n\n`);
  sink.write("data: [DONE]\n\n");
  sink.end();
}

/** One page image. Thinking is off and no tools are offered. */
export function imageReadRequest(options: {
  llmBaseUrl: string;
  llmApiKey: string;
  model: string;
  image: string;
  timeoutMs?: number;
}): ChatRequest {
  return {
    llmBaseUrl: options.llmBaseUrl,
    llmApiKey: options.llmApiKey,
    model: options.model,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: OCR_PROMPT },
          { type: "image_url", image_url: { url: options.image } },
        ],
      },
    ],
    tools: [],
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    thinkingLevel: "off",
    thinkingBudget: 0,
  };
}

export async function readImageText(options: {
  llmBaseUrl: string;
  llmApiKey: string;
  model: string;
  image: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}): Promise<string> {
  const request = imageReadRequest(options);
  if (!request.llmApiKey.trim()) {
    throw new Error("API キーがありません。");
  }
  const res = await postUpstream(request, false, options.signal);
  if (!res.ok) {
    const detail = await failureDetail(res);
    throw new Error(detail || `LLM が失敗しました。${res.status}`);
  }
  const payload = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return clipPage(payload.choices?.[0]?.message?.content ?? "");
}

async function failureDetail(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const parsed = JSON.parse(text) as { error?: { message?: string } | string };
    if (typeof parsed.error === "string") {
      return parsed.error;
    }
    if (parsed.error && typeof parsed.error === "object" && typeof parsed.error.message === "string") {
      return parsed.error.message;
    }
  } catch {
    return text.slice(0, 500);
  }
  return text.slice(0, 500);
}
