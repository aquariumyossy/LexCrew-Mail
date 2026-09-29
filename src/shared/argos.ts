import { MAX_HITS_FOR_MODEL, MAX_SNIPPET_CHARS } from "./constants";
import { Citation } from "./draft";

export type ArgosHit = Citation;

export function mapArgosHits(rows: unknown[]): ArgosHit[] {
  const hits: ArgosHit[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") {
      continue;
    }
    const item = row as Record<string, unknown>;
    const title = typeof item.title === "string" ? item.title : "";
    const path = typeof item.path === "string" ? item.path : "";
    if (!title && !path) {
      continue;
    }
    const snippet =
      (typeof item.snippet === "string" && item.snippet) ||
      (typeof item.previewText === "string" && item.previewText) ||
      "";
    hits.push({
      title: title || "(無題)",
      path,
      snippet,
      mailFrom: typeof item.mailFrom === "string" ? item.mailFrom : "",
      mailDate: typeof item.mailDate === "string" ? item.mailDate : "",
      mailFolder: typeof item.mailFolder === "string" ? item.mailFolder : "",
      mailConversationId:
        typeof item.mailConversationId === "string" ? item.mailConversationId : "",
      docKind: typeof item.docKind === "string" ? item.docKind : "",
    });
  }
  return hits;
}

export function trimHitsForModel(hits: ArgosHit[]): ArgosHit[] {
  return hits.slice(0, MAX_HITS_FOR_MODEL).map((hit) => ({
    ...hit,
    snippet: hit.snippet.slice(0, MAX_SNIPPET_CHARS),
  }));
}

export function indexHitsForModel(hits: ArgosHit[]): Array<Record<string, string>> {
  return trimHitsForModel(hits).map((hit) => {
    const row: Record<string, string> = {
      title: hit.title,
      path: hit.path,
      content: hit.snippet,
    };
    if (hit.mailFrom) row.mailFrom = hit.mailFrom;
    if (hit.mailDate) row.mailDate = hit.mailDate;
    if (hit.mailFolder) row.mailFolder = hit.mailFolder;
    return row;
  });
}

export function classifyPrefix(path: string): "mail" | "file" {
  return path.startsWith("mailfolder:") ? "mail" : "file";
}

export type ArgosScopeRow = { path: string; label: string; isRoot: boolean };

const MAX_ARGOS_SCOPES = 8;

export function parseArgosScopes(pathPrefix: string | undefined | null): string[] {
  if (!pathPrefix) return [];
  return pathPrefix.split("\n").map((item) => item.trim()).filter(Boolean);
}

function normalizePath(path: string): string {
  return path.replace(/\//g, "\\").replace(/\\+$/, "").toLowerCase();
}

export function argosPathStartsWith(path: string, prefix: string): boolean {
  const left = normalizePath(path);
  const right = normalizePath(prefix);
  if (!right) return true;
  return left === right || left.startsWith(`${right}\\`);
}

export function sameArgosPath(a: string, b: string): boolean {
  return normalizePath(a) === normalizePath(b);
}

export function collapseArgosScopes(paths: string[]): string[] {
  const out: string[] = [];
  for (const raw of paths) {
    const path = raw.trim();
    if (!path || out.some((kept) => argosPathStartsWith(path, kept))) continue;
    for (let i = out.length - 1; i >= 0; i -= 1) {
      if (argosPathStartsWith(out[i], path)) out.splice(i, 1);
    }
    out.push(path);
    if (out.length >= MAX_ARGOS_SCOPES) break;
  }
  return out;
}

export function argosScopeChipLabel(path: string, label?: string | null): string {
  if (label && label.trim()) return label.trim();
  if (path.startsWith("mailfolder:")) {
    const parts = path.slice("mailfolder:".length).split(/[\\/]/).map((item) => item.trim()).filter(Boolean);
    if (parts.length <= 1) return parts[0] || path;
    return `${parts.slice(1).join("／")}（${parts[0]}）`;
  }
  return path.replace(/\//g, "\\").replace(/\\+$/, "").split("\\").filter(Boolean).pop() || path;
}

export function argosButtonLabel(pathPrefix: string | undefined | null): string {
  const paths = parseArgosScopes(pathPrefix);
  if (!paths.length) return "argos";
  if (paths.length === 1) return `argos: ${argosScopeChipLabel(paths[0])}`;
  return `argos: ${argosScopeChipLabel(paths[0])} ほか${paths.length - 1}件`;
}

function pathSegments(path: string): string[] {
  return path.replace(/\//g, "\\").replace(/\\+$/, "").split("\\").filter(Boolean);
}

export function argosFolderListLabel(row: ArgosScopeRow, roots: ArgosScopeRow[]): string {
  if (row.isRoot) return row.label.trim() || argosScopeChipLabel(row.path);
  const parent = roots
    .filter((root) => root.isRoot && argosPathStartsWith(row.path, root.path) && !sameArgosPath(row.path, root.path))
    .sort((a, b) => pathSegments(b.path).length - pathSegments(a.path).length)[0];
  if (!parent) return row.label.trim() || argosScopeChipLabel(row.path);
  return pathSegments(row.path).slice(pathSegments(parent.path).length).join(" / ") || row.label || argosScopeChipLabel(row.path);
}

export function matchesArgosFilter(row: ArgosScopeRow, query: string, listLabel?: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [row.label, row.path, listLabel || ""].some((value) => value.toLowerCase().includes(needle));
}

export function searchPrefixes(
  selected: string[]
): { ok: true; pathPrefixes: string[] } | { ok: false; error: string } {
  const cleaned = selected.map((item) => item.trim()).filter((item) => item.length > 0);
  const mail = cleaned.filter((item) => classifyPrefix(item) === "mail");
  const file = cleaned.filter((item) => classifyPrefix(item) === "file");
  if (mail.length > 0 && file.length > 0) {
    return { ok: false, error: "メールフォルダと案件フォルダは同時に検索しません。" };
  }
  return { ok: true, pathPrefixes: cleaned };
}
