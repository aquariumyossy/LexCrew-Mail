export type WebHit = { title: string; url: string; content: string };

export async function searxngSearch(searxngUrl: string, q: string): Promise<WebHit[]> {
  const query = q.trim();
  if (!query) {
    throw new Error("検索語を入力してください。");
  }
  const root = searxngUrl.trim().replace(/\/+$/, "").replace(/\/search$/, "");
  if (!root) {
    throw new Error("SearXNG の URL がありません。");
  }
  const url = new URL(`${root}/search`);
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("language", "ja");
  const res = await fetch(url);
  if (res.status === 403) {
    throw new Error("SearXNG の JSON 形式が無効です。");
  }
  if (!res.ok) {
    throw new Error(`ウェブ検索が失敗しました。${res.status}`);
  }
  const payload = (await res.json()) as { results?: Array<{ title?: string; url?: string; content?: string }> };
  return (payload.results ?? [])
    .map((row) => ({
      title: row.title || "(無題)",
      url: row.url || "",
      content: row.content || "",
    }))
    .filter((row) => row.title !== "(無題)" || row.url);
}
