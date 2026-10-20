import { stripSteeringMarks } from "./untrusted";

const ALLOW = new Set(["p", "br", "strong", "b", "em", "ul", "ol", "li"]);
const DROP_CONTENT = new Set([
  "script",
  "style",
  "head",
  "title",
  "iframe",
  "object",
  "embed",
  "noscript",
  "template",
  "svg",
  "math",
  "textarea",
  "select",
  "option",
]);
const VOID = new Set(["br", "img", "hr", "meta", "link", "input", "source", "track", "area", "base", "col", "wbr", "param"]);

type Rgba = { r: number; g: number; b: number; a: number };

type Frame = {
  name: string;
  color: Rgba;
  background: Rgba;
  zeroFont: boolean;
};

const WHITE: Rgba = { r: 255, g: 255, b: 255, a: 1 };
const BLACK: Rgba = { r: 0, g: 0, b: 0, a: 1 };

const NAMED: Record<string, Rgba> = {
  white: WHITE,
  black: BLACK,
  red: { r: 255, g: 0, b: 0, a: 1 },
  green: { r: 0, g: 128, b: 0, a: 1 },
  blue: { r: 0, g: 0, b: 255, a: 1 },
  yellow: { r: 255, g: 255, b: 0, a: 1 },
  gray: { r: 128, g: 128, b: 128, a: 1 },
  grey: { r: 128, g: 128, b: 128, a: 1 },
  silver: { r: 192, g: 192, b: 192, a: 1 },
  transparent: { r: 0, g: 0, b: 0, a: 0 },
};

type Tag = { name: string; close: boolean; selfClose: boolean; attrs: string; end: number };

/** Allowlisted fragment. Attributes, hidden text, and external references are gone. */
export function sanitizeMailHtml(input: string): string {
  return finalize(walk(input || "", "html"));
}

/** Plain text a reader would see. Hidden runs and steering marks are removed. */
export function visibleMailText(input: string): string {
  const text = walk(input || "", "text");
  return text.replace(/\s+/g, " ").trim();
}

function finalize(fragment: string): string {
  const trimmed = fragment.trim();
  if (!trimmed) return "<p></p>";
  if (/<(?:p|ul|ol|li|br|strong|b|em)\b/i.test(trimmed)) return trimmed;
  const withBreaks = trimmed.replace(/\r\n/g, "\n").replace(/\n/g, "<br>");
  return `<p>${withBreaks}</p>`;
}

type CssRule = { tag: string; className: string; id: string; decls: string };

function walk(input: string, mode: "html" | "text"): string {
  const src = input.replace(/\u0000/g, "");
  const rules = collectRules(src);
  const out: string[] = [];
  const frames: Frame[] = [{ name: "#root", color: BLACK, background: WHITE, zeroFont: false }];
  let i = 0;
  let drop = 0;
  while (i < src.length) {
    if (src[i] !== "<") {
      const next = src.indexOf("<", i);
      const end = next < 0 ? src.length : next;
      pushText(out, mode, src.slice(i, end), frames[frames.length - 1], drop);
      i = end;
      continue;
    }
    if (src.startsWith("<!--", i)) {
      const end = src.indexOf("-->", i + 4);
      i = end < 0 ? src.length : end + 3;
      continue;
    }
    if (src.startsWith("<!", i) || src.startsWith("<?", i)) {
      const end = src.indexOf(">", i + 2);
      i = end < 0 ? src.length : end + 1;
      continue;
    }
    const tag = readTag(src, i);
    if (!tag) {
      pushText(out, mode, "<", frames[frames.length - 1], drop);
      i += 1;
      continue;
    }
    i = tag.end;
    const name = tag.name.toLowerCase();
    if (tag.close) {
      if (drop > 0) {
        drop -= 1;
        continue;
      }
      closeFrames(frames, out, mode, name);
      continue;
    }
    if (name === "script" || name === "style") {
      const rest = src.slice(tag.end);
      const close = new RegExp(`</${name}\\s*>`, "i").exec(rest);
      i = close ? tag.end + close.index + close[0].length : src.length;
      continue;
    }
    if (drop > 0) {
      if (!tag.selfClose && !VOID.has(name)) drop += 1;
      continue;
    }
    if (DROP_CONTENT.has(name) || name === "img") {
      if (!tag.selfClose && !VOID.has(name)) drop = 1;
      continue;
    }
    const frame = derive(frames[frames.length - 1], name, tag.attrs, rules);
    if (frame.drop) {
      if (!tag.selfClose && !VOID.has(name)) drop = 1;
      continue;
    }
    if (mode === "html" && ALLOW.has(name)) out.push(name === "br" ? "<br>" : `<${name}>`);
    if (mode === "text") out.push(" ");
    if (tag.selfClose || VOID.has(name)) continue;
    frames.push(frame);
  }
  return out.join("");
}

function pushText(out: string[], mode: "html" | "text", raw: string, frame: Frame, drop: number): void {
  if (drop > 0 || !raw) return;
  if (frame.zeroFont || colorsTooClose(frame.color, frame.background)) return;
  const decoded = stripSteeringMarks(decode(raw));
  if (!decoded) return;
  out.push(mode === "html" ? escapeText(decoded) : decoded);
}

function closeFrames(frames: Frame[], out: string[], mode: "html" | "text", name: string): void {
  let idx = -1;
  for (let at = frames.length - 1; at >= 1; at -= 1) {
    if (frames[at].name === name) {
      idx = at;
      break;
    }
  }
  if (idx < 0) return;
  for (let at = frames.length - 1; at >= idx; at -= 1) {
    const open = frames[at].name;
    if (mode === "html" && ALLOW.has(open) && open !== "br") out.push(`</${open}>`);
    if (mode === "text") out.push(" ");
  }
  frames.length = idx;
}

function derive(parent: Frame, name: string, attrs: string, rules: CssRule[]): Frame & { drop: boolean } {
  const style = mergedStyle(name, attrs, rules);
  const color = parseColor(lastDecl(style, "color") || attr(attrs, "color") || "") || parent.color;
  const background =
    parseColor(colorFromBackground(lastDecl(style, "background-color") || "") || colorFromBackground(lastDecl(style, "background") || "") || attr(attrs, "bgcolor") || "") ||
    parent.background;
  let zeroFont = parent.zeroFont;
  const fontDecl = lastDecl(style, "font-size");
  if (fontDecl) {
    const zero = fontSizeIsZero(fontDecl);
    if (zero !== null) zeroFont = zero;
  }
  const size = (attr(attrs, "size") || "").trim();
  if (/^0+(?:\.0+)?$/.test(size)) zeroFont = true;
  else if (/^[1-7]$/.test(size)) zeroFont = false;
  const drop =
    /(?:^|\s)hidden(?:\s|=|$)/i.test(` ${attrs} `) ||
    /display\s*:\s*none/i.test(style) ||
    /visibility\s*:\s*hidden/i.test(style) ||
    opacityHides(style) ||
    msoHides(style);
  return { name, color, background, zeroFont, drop };
}

function collectRules(html: string): CssRule[] {
  const rules: CssRule[] = [];
  for (const match of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) {
    const css = match[1].replace(/<!--/g, "").replace(/-->/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    parseBlocks(css, rules);
  }
  return rules;
}

function parseBlocks(css: string, rules: CssRule[]): void {
  let i = 0;
  while (i < css.length) {
    const open = css.indexOf("{", i);
    if (open < 0) break;
    let depth = 0;
    let j = open;
    for (; j < css.length; j += 1) {
      if (css[j] === "{") depth += 1;
      else if (css[j] === "}") {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    if (depth !== 0) break;
    const selector = css.slice(i, open).trim();
    const body = css.slice(open + 1, j);
    i = j + 1;
    if (!selector) continue;
    if (selector.includes("@") || body.includes("{")) {
      parseBlocks(body, rules);
      continue;
    }
    for (const part of selector.split(",")) {
      const simple = parseSimpleSelector(part.trim());
      if (simple) rules.push({ ...simple, decls: body });
    }
  }
}

function parseSimpleSelector(sel: string): { tag: string; className: string; id: string } | null {
  const cleaned = sel.replace(/:+[A-Za-z_-]+(?:\([^)]*\))?/g, "").trim();
  if (!cleaned || /[\s>+~[\]*]/.test(cleaned)) return null;
  const match = /^([A-Za-z][A-Za-z0-9]*)?(?:\.(-?[A-Za-z0-9_-]+)|#([A-Za-z0-9_-]+))?$/.exec(cleaned);
  if (!match || (!match[1] && !match[2] && !match[3])) return null;
  return {
    tag: (match[1] || "").toLowerCase(),
    className: (match[2] || "").toLowerCase(),
    id: (match[3] || "").toLowerCase(),
  };
}

function mergedStyle(name: string, attrs: string, rules: CssRule[]): string {
  const classes = (attr(attrs, "class") || "").toLowerCase().split(/\s+/).filter(Boolean);
  const id = (attr(attrs, "id") || "").toLowerCase();
  const chunks: Array<{ text: string; score: number }> = [];
  for (const rule of rules) {
    if (rule.tag && rule.tag !== name) continue;
    if (rule.className && !classes.includes(rule.className)) continue;
    if (rule.id && rule.id !== id) continue;
    let score = 0;
    if (rule.tag) score += 1;
    if (rule.className) score += 10;
    if (rule.id) score += 100;
    chunks.push({ text: rule.decls, score });
  }
  const inline = attr(attrs, "style");
  if (inline) chunks.push({ text: inline, score: 1000 });
  return mergeDecls(chunks);
}

function mergeDecls(chunks: Array<{ text: string; score: number }>): string {
  const map = new Map<string, { value: string; score: number }>();
  for (const chunk of chunks) {
    const cleaned = stripCssComments(decode(chunk.text));
    for (const part of cleaned.split(";")) {
      const idx = part.indexOf(":");
      if (idx < 0) continue;
      const prop = part.slice(0, idx).trim().toLowerCase();
      if (!prop) continue;
      let value = part.slice(idx + 1).trim();
      const important = /!important/i.test(value);
      value = value.replace(/!important/gi, "").trim();
      const score = chunk.score + (important ? 10000 : 0);
      const prev = map.get(prop);
      if (!prev || score >= prev.score) map.set(prop, { value, score });
    }
  }
  return [...map.entries()].map(([key, decl]) => `${key}:${decl.value}`).join(";");
}

function msoHides(style: string): boolean {
  const value = lastDecl(style, "mso-hide");
  return !!value && /^all\b/i.test(value.trim());
}

function readTag(src: string, start: number): Tag | null {
  let i = start + 1;
  if (i >= src.length) return null;
  let close = false;
  if (src[i] === "/") {
    close = true;
    i += 1;
  }
  if (!/[A-Za-z]/.test(src[i] || "")) return null;
  const nameStart = i;
  while (i < src.length && /[A-Za-z0-9]/.test(src[i])) i += 1;
  const name = src.slice(nameStart, i);
  if (!close && i < src.length && !/[\s/>]/.test(src[i])) return null;
  const attrStart = i;
  let quote = "";
  while (i < src.length) {
    const c = src[i];
    if (quote) {
      if (c === quote) quote = "";
      i += 1;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      i += 1;
      continue;
    }
    if (c === ">") break;
    i += 1;
  }
  const rawAttrs = src.slice(attrStart, Math.min(i, src.length));
  const selfClose = /\/\s*$/.test(rawAttrs);
  return { name, close, selfClose, attrs: rawAttrs, end: i >= src.length ? src.length : i + 1 };
}

function attr(attrs: string, name: string): string | null {
  const match = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, "i").exec(attrs);
  if (!match) return null;
  return match[1] ?? match[2] ?? match[3] ?? "";
}

function lastDecl(style: string, name: string): string | null {
  const re = new RegExp(`(?:^|;)\\s*${name}\\s*:\\s*([^;]+)`, "gi");
  let last: string | null = null;
  for (const match of style.matchAll(re)) last = match[1].trim();
  return last;
}

function stripCssComments(style: string): string {
  return style.replace(/\/\*[\s\S]*?\*\//g, "");
}

function colorFromBackground(value: string): string {
  if (!value || /url\s*\(/i.test(value)) return "";
  const hex = value.match(/#(?:[0-9a-f]{3,8})/i);
  if (hex) return hex[0];
  const rgb = value.match(/rgba?\([^)]*\)/i);
  if (rgb) return rgb[0];
  const named = value.trim().split(/\s+/)[0]?.toLowerCase() || "";
  return NAMED[named] ? named : "";
}

function fontSizeIsZero(value: string): boolean | null {
  const match = /^([0-9.]+)\s*(px|pt|em|rem|%)?/i.exec(value.trim());
  if (!match) return null;
  const n = Number(match[1]);
  if (!Number.isFinite(n)) return null;
  const unit = (match[2] || "px").toLowerCase();
  if (n <= 0) return true;
  if (unit === "px" && n <= 2) return true;
  if (unit === "pt" && n <= 1) return true;
  if ((unit === "em" || unit === "rem") && n < 0.08) return true;
  if (unit === "%" && n < 8) return true;
  return false;
}

function opacityHides(style: string): boolean {
  const match = /opacity\s*:\s*([0-9.]+)\s*(%)?/i.exec(style);
  if (!match) return false;
  let n = Number(match[1]);
  if (!Number.isFinite(n)) return false;
  if (match[2] === "%") n /= 100;
  return n <= 0.02;
}

function parseColor(value: string): Rgba | null {
  const text = value.trim().toLowerCase();
  if (!text) return null;
  if (NAMED[text]) return NAMED[text];
  const hex = /^#([0-9a-f]{3,8})$/i.exec(text);
  if (hex) {
    const raw = hex[1];
    if (raw.length === 3 || raw.length === 4) {
      const r = parseInt(raw[0] + raw[0], 16);
      const g = parseInt(raw[1] + raw[1], 16);
      const b = parseInt(raw[2] + raw[2], 16);
      const a = raw.length === 4 ? parseInt(raw[3] + raw[3], 16) / 255 : 1;
      return { r, g, b, a };
    }
    if (raw.length === 6 || raw.length === 8) {
      return {
        r: parseInt(raw.slice(0, 2), 16),
        g: parseInt(raw.slice(2, 4), 16),
        b: parseInt(raw.slice(4, 6), 16),
        a: raw.length === 8 ? parseInt(raw.slice(6, 8), 16) / 255 : 1,
      };
    }
  }
  const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([0-9.]+)\s*)?\)$/i.exec(text);
  if (!rgb) return null;
  return {
    r: clampByte(Number(rgb[1])),
    g: clampByte(Number(rgb[2])),
    b: clampByte(Number(rgb[3])),
    a: rgb[4] === undefined ? 1 : Math.min(1, Math.max(0, Number(rgb[4]))),
  };
}

function colorsTooClose(color: Rgba, background: Rgba): boolean {
  if (color.a <= 0.02) return true;
  const page = background.a <= 0.02 ? WHITE : background;
  const seen = composite(color, page);
  const base = page.a < 1 ? composite(page, WHITE) : page;
  return Math.abs(seen.r - base.r) <= 8 && Math.abs(seen.g - base.g) <= 8 && Math.abs(seen.b - base.b) <= 8;
}

function composite(fg: Rgba, bg: Rgba): Rgba {
  const a = fg.a + bg.a * (1 - fg.a);
  if (a === 0) return { r: 255, g: 255, b: 255, a: 0 };
  return {
    r: Math.round((fg.r * fg.a + bg.r * bg.a * (1 - fg.a)) / a),
    g: Math.round((fg.g * fg.a + bg.g * bg.a * (1 - fg.a)) / a),
    b: Math.round((fg.b * fg.a + bg.b * bg.a * (1 - fg.a)) / a),
    a,
  };
}

function clampByte(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(255, Math.max(0, Math.round(n)));
}

function decode(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);?/gi, (_, hex: string) => fromCode(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);?/g, (_, dec: string) => fromCode(Number.parseInt(dec, 10)))
    .replace(/&nbsp;/gi, " ")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&");
}

function fromCode(code: number): string {
  if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return "";
  if (code <= 0x1f && code !== 0x09 && code !== 0x0a && code !== 0x0d) return "";
  try {
    return String.fromCodePoint(code);
  } catch {
    return "";
  }
}

function escapeText(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
