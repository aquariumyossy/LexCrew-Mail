import { scanXml, xmlAttr } from "./xml";

const SKIPPED = new Set(["w:drawing", "w:pict", "w:object", "w:del"]);

function localName(name: string): string {
  const colon = name.lastIndexOf(":");
  return colon < 0 ? name : name.slice(colon + 1);
}

/** Body text of a Word document. Drawings, pictures, and deletions are left out. */
export function docxText(xml: string): string {
  const out: string[] = [];
  const stack: string[] = [];
  let line: string[] = [];
  let row: string[] | null = null;
  let cell: string[] | null = null;

  const skipped = () => stack.some((name) => SKIPPED.has(name));
  const add = (text: string) => {
    if (!skipped()) {
      line.push(text);
    }
  };
  const flushLine = () => {
    const text = line.join("").trim();
    line = [];
    if (!text) {
      return;
    }
    if (cell) {
      cell.push(text);
    } else if (!row) {
      out.push(text);
    }
  };

  for (const event of scanXml(xml)) {
    if (event.kind === "text") {
      if (stack[stack.length - 1] === "w:t") {
        add(event.text);
      }
      continue;
    }
    if (event.kind === "close") {
      const found = stack.lastIndexOf(event.name);
      if (found >= 0) {
        stack.length = found;
      }
      if (event.name === "w:p") {
        flushLine();
      }
      if (event.name === "w:tc" && row && cell) {
        row.push(cell.join("\n"));
        cell = null;
      }
      if (event.name === "w:tr" && row) {
        const text = row.join("\t").replace(/\t+$/, "");
        row = null;
        if (text.trim()) {
          out.push(text);
        }
      }
      continue;
    }
    if (event.name === "w:tr" && !event.empty) {
      row = [];
    }
    if (event.name === "w:tc" && !event.empty && row) {
      cell = [];
    }
    if (event.name === "w:tab") {
      add("\t");
    }
    if (event.name === "w:br" || event.name === "w:cr") {
      add("\n");
    }
    if (!event.empty) {
      stack.push(event.name);
    }
  }
  flushLine();
  return out.join("\n");
}

export function readSharedStrings(xml: string): string[] {
  const out: string[] = [];
  const stack: string[] = [];
  let current: string[] | null = null;
  for (const event of scanXml(xml)) {
    if (event.kind === "text") {
      if (current && stack[stack.length - 1] === "t" && !stack.includes("rPh")) {
        current.push(event.text);
      }
      continue;
    }
    if (event.kind === "close") {
      const found = stack.lastIndexOf(event.name);
      if (found >= 0) {
        stack.length = found;
      }
      if (event.name === "si" && current) {
        out.push(current.join(""));
        current = null;
      }
      continue;
    }
    if (event.name === "si") {
      current = event.empty ? null : [];
      if (event.empty) {
        out.push("");
      }
    }
    if (!event.empty) {
      stack.push(event.name);
    }
  }
  return out;
}

function readRows(xml: string, shared: string[]): string[] {
  const rows: string[] = [];
  const stack: string[] = [];
  let cells: string[] = [];
  let cellType = "";
  let value: string[] | null = null;

  const finishCell = () => {
    if (value === null) {
      return;
    }
    const raw = value.join("");
    value = null;
    if (cellType === "s") {
      const index = Number.parseInt(raw, 10);
      cells.push(Number.isInteger(index) ? shared[index] || "" : "");
      return;
    }
    if (cellType === "b") {
      cells.push(raw === "1" ? "TRUE" : "FALSE");
      return;
    }
    cells.push(raw);
  };

  for (const event of scanXml(xml)) {
    if (event.kind === "text") {
      const leaf = stack[stack.length - 1];
      if (value && (leaf === "v" || leaf === "t")) {
        value.push(event.text);
      }
      continue;
    }
    if (event.kind === "close") {
      const found = stack.lastIndexOf(event.name);
      if (found >= 0) {
        stack.length = found;
      }
      if (event.name === "c") {
        finishCell();
      }
      if (event.name === "row") {
        const line = cells.join("\t").replace(/\t+$/, "");
        cells = [];
        if (line.trim()) {
          rows.push(line);
        }
      }
      continue;
    }
    if (event.name === "c") {
      cellType = xmlAttr(event.attrs, "t");
      value = event.empty ? null : [];
      if (event.empty) {
        cells.push("");
      }
    }
    if (!event.empty) {
      stack.push(event.name);
    }
  }
  return rows;
}

export type SheetPart = { name: string; xml: string };

export function sheetText(sharedStrings: string, sheets: SheetPart[]): string {
  const shared = sharedStrings ? readSharedStrings(sharedStrings) : [];
  const blocks: string[] = [];
  for (const sheet of sheets) {
    const rows = readRows(sheet.xml, shared);
    if (!rows.length) {
      continue;
    }
    blocks.push([`## ${sheet.name}`, ...rows].join("\n"));
  }
  return blocks.join("\n\n");
}

export function workbookSheets(workbook: string): { name: string; rid: string }[] {
  const out: { name: string; rid: string }[] = [];
  for (const event of scanXml(workbook)) {
    if (event.kind === "open" && localName(event.name) === "sheet") {
      const name = xmlAttr(event.attrs, "name");
      const rid = xmlAttr(event.attrs, "r:id") || xmlAttr(event.attrs, "id");
      if (rid) {
        out.push({ name, rid });
      }
    }
  }
  return out;
}

export function relationshipTargets(rels: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const event of scanXml(rels)) {
    if (event.kind === "open" && localName(event.name) === "Relationship") {
      const id = xmlAttr(event.attrs, "Id");
      const target = xmlAttr(event.attrs, "Target");
      if (id && target) {
        out.set(id, target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`);
      }
    }
  }
  return out;
}
