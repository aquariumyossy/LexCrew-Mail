import path from "path";
import express, { Express, Response } from "express";
import { clampTimeoutMs, DEFAULT_ARGOS_BASE_URL, DEFAULT_MODEL, DEFAULT_TIMEOUT_MS, OCR_BODY_LIMIT_BYTES } from "../shared/constants";
import { ThinkingLevel } from "../shared/thinking";
import { visionUnsupportedMessage } from "../shared/ocr";
import { mapArgosHits } from "../shared/argos";
import { appendMessage, deleteConversation, deletePerson, getConversation, listConversations, openHistory, readMemory, replaceNotes, setConversationFiles, startConversation, upsertPerson } from "./history";
import { parseNotes, parsePerson } from "../shared/memory";
import { parseCommittedFiles } from "../shared/attachedFiles";
import { pipeChatStream, readImageText } from "./llm";
import { argosHealth, argosScopes, argosSearch, normalizeBase } from "./remote";
import { searxngSearch } from "./search";
import { appointmentsFromIcs, fetchGoogleIcs } from "./ical";
import { adoptConnection, connectionFromBody, connectionPath, Connection, ConnectionFile, readConnection, resolveConnection, saveConnection, sweepConnectionTemps } from "./connection";

function clientSignal(res: Response, timeoutMs: number): { signal: AbortSignal; timedOut: () => boolean } {
  const timeout = AbortSignal.timeout(timeoutMs);
  const cancel = new AbortController();
  const onClose = () => {
    if (!res.writableEnded) cancel.abort();
  };
  res.on("close", onClose);
  res.on("finish", () => res.off("close", onClose));
  const signal = AbortSignal.any([timeout, cancel.signal]);
  return { signal, timedOut: () => timeout.aborted };
}

function textError(error: unknown): string {
  return error instanceof Error ? error.message : "失敗しました。";
}

function activeConnection(body: unknown): Connection {
  const record = body && typeof body === "object" ? (body as { llmBaseUrl?: unknown; llmApiKey?: unknown; searxngUrl?: unknown }) : {};
  return resolveConnection(readConnection(connectionPath()), record);
}

function connectionPayload(file: ConnectionFile): { kind: "ready"; llmBaseUrl: string; llmApiKey: string; searxngUrl: string } | { kind: "absent" } | { kind: "broken" } {
  if (file.kind !== "ready") return { kind: file.kind };
  return { kind: "ready", ...file.connection };
}

function parseRange(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]), 0, 0);
}

export function createApp(): Express {
  const app = express();
  const history = openHistory();
  sweepConnectionTemps(path.dirname(connectionPath()));
  /*
   * Registered before the global parser so the small limit never sees it.
   * A page image is base64, which grows it by 4/3. The global 2MB keeps a
   * runaway chat request from being read into memory.
   */
  app.post("/api/ocr", express.json({ limit: OCR_BODY_LIMIT_BYTES }), async (req, res) => {
    const body = req.body ?? {};
    const image = String(body.image ?? "").trim();
    if (!image.startsWith("data:image/")) {
      res.status(400).json({ error: "読み取る画像が渡されていません。" });
      return;
    }
    const timeoutMs = clampTimeoutMs(Number(body.timeoutMs) || DEFAULT_TIMEOUT_MS);
    const watched = clientSignal(res, timeoutMs);
    const connection = activeConnection(body);
    try {
      const text = await readImageText({
        llmBaseUrl: connection.llmBaseUrl,
        llmApiKey: connection.llmApiKey,
        model: String(body.model || DEFAULT_MODEL),
        image,
        timeoutMs,
        signal: watched.signal,
      });
      res.json({ text });
    } catch (error) {
      if (watched.timedOut()) {
        if (!res.headersSent) res.status(504).json({ error: "MTPLX が時間内に応答しませんでした。" });
        return;
      }
      if (watched.signal.aborted) {
        if (!res.headersSent) res.status(499).json({ error: "キャンセルしました。" });
        return;
      }
      const detail = textError(error);
      const vision = visionUnsupportedMessage(detail);
      if (!res.headersSent) res.status(502).json({ error: vision || detail });
    }
  });
  app.use(express.json({ limit: "2mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, service: "LexCrew Mail" });
  });

  app.get("/api/connection", (_req, res) => {
    res.json(connectionPayload(readConnection(connectionPath())));
  });

  app.post("/api/connection", (req, res) => {
    try {
      res.json(connectionPayload(adoptConnection(connectionPath(), connectionFromBody(req.body))));
    } catch (error) {
      res.status(500).json({ error: textError(error) });
    }
  });

  app.put("/api/connection", (req, res) => {
    try {
      const next = connectionFromBody(req.body);
      saveConnection(connectionPath(), next);
      res.json({ kind: "ready", ...next });
    } catch (error) {
      res.status(500).json({ error: textError(error) });
    }
  });

  app.post("/api/health", async (req, res) => {
    const body = req.body ?? {};
    const connection = activeConnection(body);
    const llm = await probeLlm(connection.llmBaseUrl, connection.llmApiKey);
    const payload: Record<string, unknown> = { sidecar: { ok: true }, llm };
    if (connection.searxngUrl.trim()) {
      payload.searxng = await probeSearxng(connection.searxngUrl);
    }
    if (body.argosBaseUrl) {
      payload.argos = await probeArgos(String(body.argosBaseUrl), String(body.argosApiKey ?? ""));
    }
    res.status(llm.ok ? 200 : 503).json(payload);
  });

  app.post("/api/chat", async (req, res) => {
    const body = req.body ?? {};
    const timeoutMs = clampTimeoutMs(Number(body.timeoutMs) || DEFAULT_TIMEOUT_MS);
    const watched = clientSignal(res, timeoutMs);
    const connection = activeConnection(body);
    try {
      await pipeChatStream(
        {
          llmBaseUrl: connection.llmBaseUrl,
          llmApiKey: connection.llmApiKey,
          model: String(body.model || DEFAULT_MODEL),
          messages: Array.isArray(body.messages) ? body.messages : [],
          tools: Array.isArray(body.tools) ? body.tools : [],
          timeoutMs,
          thinkingLevel: body.thinkingLevel as ThinkingLevel | undefined,
          thinkingBudget: Number(body.thinkingBudget) || undefined,
        },
        res,
        watched.signal
      );
    } catch (error) {
      if (watched.timedOut()) {
        if (!res.headersSent) res.status(504).json({ error: "MTPLX が時間内に応答しませんでした。" });
        else res.end();
        return;
      }
      if (watched.signal.aborted) {
        if (!res.headersSent) res.status(499).json({ error: "キャンセルしました。" });
        else res.end();
        return;
      }
      if (!res.headersSent) res.status(502).json({ error: textError(error) });
      else res.end();
    }
  });

  app.post("/api/search", async (req, res) => {
    try {
      const results = await searxngSearch(activeConnection(req.body).searxngUrl, String(req.body?.q ?? ""));
      res.json({ provider: "searxng", results });
    } catch (error) {
      res.status(502).json({ error: textError(error) });
    }
  });

  app.post("/api/argos/search", async (req, res) => {
    try {
      const base = normalizeBase(String(req.body?.argosBaseUrl || DEFAULT_ARGOS_BASE_URL));
      const rows = await argosSearch(
        base,
        String(req.body?.argosApiKey ?? ""),
        String(req.body?.query ?? req.body?.q ?? ""),
        Array.isArray(req.body?.pathPrefixes) ? req.body.pathPrefixes.map(String) : [],
        Number(req.body?.limit) || 8
      );
      res.json({ provider: "argos", results: mapArgosHits(rows) });
    } catch (error) {
      res.status(502).json({ error: textError(error) });
    }
  });

  app.post("/api/argos/scopes", async (req, res) => {
    try {
      const base = normalizeBase(String(req.body?.argosBaseUrl || DEFAULT_ARGOS_BASE_URL));
      const scopes = await argosScopes(base, String(req.body?.argosApiKey ?? ""), String(req.body?.query ?? ""));
      res.json(scopes);
    } catch (error) {
      res.status(502).json({ error: textError(error) });
    }
  });

  app.get("/api/conversations", (req, res) => {
    res.json({ conversations: listConversations(history, String(req.query.conversationKey ?? "")) });
  });

  app.post("/api/conversations", (req, res) => {
    const key = String(req.body?.conversationKey ?? "").trim();
    if (!key) {
      res.status(400).json({ error: "会話キーがありません。" });
      return;
    }
    res.json(startConversation(history, key, String(req.body?.title ?? ""), Boolean(req.body?.fresh)));
  });

  app.get("/api/conversations/:id", (req, res) => {
    const found = getConversation(history, req.params.id);
    if (!found) {
      res.status(404).json({ error: "その会話は見つかりませんでした。" });
      return;
    }
    res.json(found);
  });

  app.put("/api/conversations/:id/files", (req, res) => {
    const files = setConversationFiles(history, req.params.id, parseCommittedFiles(req.body?.files));
    if (!files) {
      res.status(404).json({ error: "その会話は見つかりませんでした。" });
      return;
    }
    res.json({ files });
  });

  app.post("/api/conversations/:id/messages", (req, res) => {
    try {
      res.json(appendMessage(history, req.params.id, req.body ?? {}));
    } catch (error) {
      const message = textError(error);
      res.status(message.includes("見つかりません") ? 404 : 500).json({ error: message });
    }
  });

  app.post("/api/calendar/ical", async (req, res) => {
    try {
      const from = parseRange(String(req.body?.from ?? ""));
      const to = parseRange(String(req.body?.to ?? ""));
      if (!from || !to || to.getTime() <= from.getTime()) {
        res.status(400).json({ error: "予定の期間が不正です。" });
        return;
      }
      const ics = await fetchGoogleIcs(String(req.body?.url ?? ""));
      res.json({ appointments: appointmentsFromIcs(ics, from, to) });
    } catch (error) {
      const message = textError(error);
      const status = message.includes("URL") || message.includes("期間") ? 400 : 502;
      res.status(status).json({ error: message });
    }
  });

  app.delete("/api/conversations/:id", (req, res) => {
    deleteConversation(history, req.params.id);
    res.json({ ok: true });
  });

  app.get("/api/memory", (_req, res) => {
    res.json(readMemory(history));
  });

  app.put("/api/memory/notes", (req, res) => {
    const parsed = parseNotes(req.body?.notes);
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    res.json({ notes: replaceNotes(history, parsed.value) });
  });

  app.put("/api/memory/people/:address", (req, res) => {
    const parsed = parsePerson({ name: req.body?.name, text: req.body?.text }, req.params.address, Date.now());
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    res.json(upsertPerson(history, parsed.value));
  });

  app.delete("/api/memory/people/:address", (req, res) => {
    deletePerson(history, req.params.address);
    res.json({ ok: true });
  });

  return app;
}

async function probeLlm(baseUrl: string, apiKey: string): Promise<{ ok: boolean; error?: string; models?: string[] }> {
  if (!apiKey.trim() || !baseUrl.trim()) {
    return { ok: false, error: "LLM の URL と API キーを入れてください。" };
  }
  try {
    const root = baseUrl.replace(/\/+$/, "").replace(/\/v1$/, "");
    const res = await fetch(`${root}/v1/models`, { headers: { Authorization: `Bearer ${apiKey}` } });
    if (!res.ok) {
      return { ok: false, error: `モデル一覧が失敗しました。${res.status}` };
    }
    const body = (await res.json()) as { data?: Array<{ id?: string }> };
    const models = (body.data ?? []).map((row) => String(row.id ?? "")).filter(Boolean);
    return { ok: true, models };
  } catch (error) {
    return { ok: false, error: textError(error) };
  }
}

async function probeSearxng(url: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await searxngSearch(url, "ping");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: textError(error) };
  }
}

async function probeArgos(baseUrl: string, apiKey: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await argosHealth(normalizeBase(baseUrl), apiKey);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: textError(error) };
  }
}
