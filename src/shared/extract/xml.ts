/**
 * Scanner for Office Open XML parts. The parts are machine-written, so a
 * small scanner is enough and stays testable without a DOM.
 */

export type XmlEvent =
  | { kind: "open"; name: string; attrs: string; empty: boolean }
  | { kind: "close"; name: string }
  | { kind: "text"; text: string };

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: "\u00a0",
};

export function decodeXmlText(raw: string): string {
  if (!raw.includes("&")) {
    return raw;
  }
  return raw.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, body: string) => {
    if (body.startsWith("#")) {
      const hex = body[1] === "x" || body[1] === "X";
      const code = Number.parseInt(hex ? body.slice(2) : body.slice(1), hex ? 16 : 10);
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : whole;
    }
    const named = NAMED_ENTITIES[body.toLowerCase()];
    return named === undefined ? whole : named;
  });
}

function endOfTag(xml: string, from: number): number {
  let quote = "";
  for (let at = from; at < xml.length; at += 1) {
    const ch = xml[at];
    if (quote) {
      if (ch === quote) {
        quote = "";
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === ">") {
      return at;
    }
  }
  return -1;
}

export function* scanXml(xml: string): Generator<XmlEvent> {
  let at = 0;
  while (at < xml.length) {
    const open = xml.indexOf("<", at);
    if (open < 0) {
      const tail = xml.slice(at);
      if (tail) {
        yield { kind: "text", text: decodeXmlText(tail) };
      }
      return;
    }
    if (open > at) {
      yield { kind: "text", text: decodeXmlText(xml.slice(at, open)) };
    }
    if (xml.startsWith("<!--", open)) {
      const close = xml.indexOf("-->", open);
      at = close < 0 ? xml.length : close + 3;
      continue;
    }
    if (xml.startsWith("<![CDATA[", open)) {
      const close = xml.indexOf("]]>", open);
      const to = close < 0 ? xml.length : close;
      yield { kind: "text", text: xml.slice(open + 9, to) };
      at = close < 0 ? xml.length : close + 3;
      continue;
    }
    if (xml.startsWith("<?", open) || xml.startsWith("<!", open)) {
      const close = endOfTag(xml, open);
      at = close < 0 ? xml.length : close + 1;
      continue;
    }
    const close = endOfTag(xml, open);
    if (close < 0) {
      return;
    }
    const inner = xml.slice(open + 1, close);
    at = close + 1;
    if (inner.startsWith("/")) {
      yield { kind: "close", name: inner.slice(1).trim() };
      continue;
    }
    const empty = inner.endsWith("/");
    const body = empty ? inner.slice(0, -1) : inner;
    const space = body.search(/\s/);
    const name = (space < 0 ? body : body.slice(0, space)).trim();
    yield { kind: "open", name, attrs: space < 0 ? "" : body.slice(space + 1), empty };
  }
}

export function xmlAttr(attrs: string, name: string): string {
  if (!attrs || !/^[\w:.-]+$/.test(name)) {
    return "";
  }
  const pattern = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`);
  const hit = pattern.exec(attrs);
  if (!hit) {
    return "";
  }
  return decodeXmlText(hit[1] !== undefined ? hit[1] : hit[2] || "");
}
