import fs from "fs";
import http from "http";
import os from "os";
import path from "path";
import { AddressInfo } from "net";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Express } from "express";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kuru-auth-"));
process.env.APPDATA = dir;
process.env.LOCALAPPDATA = dir;

const kuruEnv = ["KURU_VERSION", "KURU_COMMIT", "KURU_DIRTY", "KURU_BUILT_AT", "KURU_FILE_TIME", "KURU_ARCH"] as const;

function clearBuildEnv() {
  for (const name of kuruEnv) vi.stubEnv(name, "");
}

describe("sidecar session auth", () => {
  const token = "a".repeat(64);
  let app: Express;
  let server: http.Server;
  let base = "";

  beforeAll(async () => {
    const mod = await import("./app");
    const connection = await import("./connection");
    app = mod.createApp({ token });
    connection.saveConnection(connection.connectionPath(), {
      llmBaseUrl: "http://127.0.0.1:8000/v1",
      llmApiKey: "secret-key",
      searxngUrl: "",
    });
    server = http.createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects every request that does not carry the launch token", async () => {
    const res = await fetch(`${base}/api/health`);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toContain("認証");
  });

  it("reports the build stamp on the health check", async () => {
    clearBuildEnv();
    const res = await fetch(`${base}/api/health`, { headers: { "X-LexCrew-Token": token } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok?: boolean; build?: string };
    expect(body.ok).toBe(true);
    expect(body.build).toBe("1.1.1 (dev, dev)");
  });

  it("reports the injected stamp when KURU_* is set", async () => {
    vi.stubEnv("KURU_VERSION", "9.9.9");
    vi.stubEnv("KURU_COMMIT", "b5cca57-dirty");
    vi.stubEnv("KURU_BUILT_AT", "2026-10-20 13:25");
    const res = await fetch(`${base}/api/health`, { headers: { "X-LexCrew-Token": token } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { build?: string };
    expect(body.build).toBe("9.9.9 (b5cca57-dirty, 2026-10-20 13:25)");
  });

  it("accepts the token in the header and does not return the API key", async () => {
    const res = await fetch(`${base}/api/connection`, { headers: { "X-LexCrew-Token": token } });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain("secret-key");
    const body = JSON.parse(text) as { kind: string; llmBaseUrl: string; hasApiKey: boolean; llmApiKey?: string };
    expect(body).toEqual({
      kind: "ready",
      llmBaseUrl: "http://127.0.0.1:8000/v1",
      searxngUrl: "",
      hasApiKey: true,
    });
    expect(body.llmApiKey).toBeUndefined();
  });

  it("accepts the token as a bearer and keeps a blank save from erasing the key", async () => {
    const saved = await fetch(`${base}/api/connection`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ llmBaseUrl: "http://10.0.0.8:8000/v1", llmApiKey: "", searxngUrl: "http://10.0.0.8:8080" }),
    });
    expect(saved.status).toBe(200);
    const text = await saved.text();
    expect(text).not.toContain("secret-key");
    const connection = await import("./connection");
    expect(connection.readConnection(connection.connectionPath())).toMatchObject({
      kind: "ready",
      connection: { llmApiKey: "secret-key", llmBaseUrl: "http://10.0.0.8:8000/v1" },
    });
  });

  it("calls the LLM with the saved key when the pane sends an empty key", async () => {
    const seen: string[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      seen.push(headers.get("authorization") || "");
      return new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;
    try {
      const res = await original(`${base}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-LexCrew-Token": token },
        body: JSON.stringify({
          llmBaseUrl: "http://100.65.231.111:8000/v1",
          llmApiKey: "",
          model: "m",
          messages: [{ role: "user", content: "こんにちは" }],
          tools: [],
        }),
      });
      expect(res.status).toBe(200);
      expect(seen).toContain("Bearer secret-key");
      expect(seen.some((header) => header === "Bearer ")).toBe(false);
    } finally {
      globalThis.fetch = original;
    }
  });
});
