import JSZip from "jszip";
import { FileReadError, fileKind } from "../attachedFiles";
import { docxText, relationshipTargets, sheetText, workbookSheets } from "./office";

async function zipText(zip: JSZip, path: string): Promise<string> {
  const entry = zip.file(path);
  return entry ? entry.async("string") : "";
}

async function readDocx(bytes: ArrayBuffer): Promise<string> {
  const zip = await JSZip.loadAsync(bytes);
  const document = await zipText(zip, "word/document.xml");
  if (!document) {
    throw new FileReadError("Word の本文が見つかりませんでした。");
  }
  return docxText(document);
}

async function readSheet(bytes: ArrayBuffer): Promise<string> {
  const zip = await JSZip.loadAsync(bytes);
  const workbook = await zipText(zip, "xl/workbook.xml");
  if (!workbook) {
    throw new FileReadError("Excel のブックが見つかりませんでした。");
  }
  const targets = relationshipTargets(await zipText(zip, "xl/_rels/workbook.xml.rels"));
  const sheets: { name: string; xml: string }[] = [];
  for (const sheet of workbookSheets(workbook)) {
    const path = targets.get(sheet.rid);
    if (!path) {
      continue;
    }
    const xml = await zipText(zip, path);
    if (xml) {
      sheets.push({ name: sheet.name, xml });
    }
  }
  return sheetText(await zipText(zip, "xl/sharedStrings.xml"), sheets);
}

/** Text of a .docx or .xlsx. Embedded pictures are not read. */
export async function officeText(name: string, bytes: ArrayBuffer): Promise<string> {
  const kind = fileKind(name);
  const body = kind === "docx" ? await readDocx(bytes) : await readSheet(bytes);
  if (!body.trim()) {
    throw new FileReadError("文字が見つかりませんでした。図は読みません。");
  }
  return body;
}
