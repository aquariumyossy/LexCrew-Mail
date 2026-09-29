import { DEFAULT_ARGOS_BASE_URL } from "../shared/constants";

export function normalizeBase(baseUrl: string): string {
  const trimmed = (baseUrl || DEFAULT_ARGOS_BASE_URL).trim().replace(/\/+$/, "");
  const url = new URL(trimmed);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Argos の URL は http または https にしてください。");
  }
  if (url.hostname === "localhost") {
    url.hostname = "127.0.0.1";
  }
  return url.toString().replace(/\/+$/, "");
}

async function argosFetch(base: string, apiKey: string, path: string, init: RequestInit): Promise<Response> {
  const headers = new Headers(init.headers);
  if (apiKey.trim()) {
    headers.set("Authorization", `Bearer ${apiKey}`);
  }
  return fetch(`${base}${path}`, { ...init, headers });
}

export async function argosHealth(base: string, apiKey: string): Promise<void> {
  const res = await argosFetch(base, apiKey, "/health", { method: "GET" });
  if (!res.ok) {
    throw new Error("Argos に接続できません。");
  }
  const body = (await res.json()) as { ok?: boolean; name?: string };
  if (!body.ok || body.name !== "argos") {
    throw new Error("Argos の応答が不正です。");
  }
}

export async function argosScopes(base: string, apiKey: string, query: string): Promise<unknown> {
  const path = query ? `/scopes?query=${encodeURIComponent(query)}` : "/scopes";
  const res = await argosFetch(base, apiKey, path, { method: "GET" });
  if (!res.ok) {
    throw new Error(`Argos の範囲取得が失敗しました。${res.status}`);
  }
  return res.json();
}

export async function argosSearch(
  base: string,
  apiKey: string,
  query: string,
  pathPrefixes: string[],
  limit = 8
): Promise<unknown[]> {
  const q = query.trim();
  if (!q) {
    throw new Error("検索語を入力してください。");
  }
  const capped = Number.isFinite(limit) ? Math.min(24, Math.max(1, Math.round(limit))) : 8;
  const res = await argosFetch(base, apiKey, "/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: q,
      limit: capped,
      pathPrefixes: pathPrefixes.map((item) => item.trim()).filter(Boolean),
    }),
  });
  if (!res.ok) {
    throw new Error(`Argos の検索が失敗しました。${res.status}`);
  }
  const payload = (await res.json()) as { hits?: unknown[] };
  return Array.isArray(payload.hits) ? payload.hits : [];
}
