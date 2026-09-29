import DOMPurify from "dompurify";
import { Marked } from "marked";
import { argosScopeChipLabel } from "../shared/argos";

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function isWebHref(href: string): boolean {
  return /^https?:\/\//i.test(href);
}

function isLocalHref(href: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(href) || href.startsWith("\\\\") || href.startsWith("mailfolder:") || href.startsWith("file:");
}

function hostLabel(href: string): string {
  if (isLocalHref(href)) return argosScopeChipLabel(href);
  try {
    return new URL(href).hostname.replace(/^www\./, "") || "リンク";
  } catch {
    return "リンク";
  }
}

function foldLink(href: string, text: string): string {
  if (!isWebHref(href) && !isLocalHref(href)) return escapeHtml(text);
  const label = text.trim();
  const summary = !label || label === href ? hostLabel(href) : label;
  const body = isWebHref(href) ? `<a href="${escapeHtml(href)}" target="_blank" rel="noreferrer">${escapeHtml(href)}</a>` : `<span>${escapeHtml(href)}</span>`;
  return `<details class="folded"><summary>${escapeHtml(summary)}</summary>${body}</details>`;
}

const marked = new Marked({ gfm: true, breaks: true });
marked.use({
  renderer: {
    link({ href, text }) {
      return foldLink(href || "", text || "");
    },
    image({ text, href }) {
      return escapeHtml(text || href || "画像");
    },
  },
});

export function renderMarkdown(text: string): string {
  if (!text) return "";
  const html = marked.parse(text, { async: false }) as string;
  return DOMPurify.sanitize(html, { ADD_ATTR: ["target", "rel"] });
}
