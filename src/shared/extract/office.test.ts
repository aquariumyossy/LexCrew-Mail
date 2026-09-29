import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { docxText, readSharedStrings, sheetText } from "./office";
import { officeText } from "./package";

const DOCUMENT = `<?xml version="1.0"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>第1条</w:t></w:r></w:p>
    <w:p>
      <w:r><w:drawing><w:t>図の中の文字</w:t></w:drawing></w:r>
      <w:r><w:t>本文</w:t></w:r>
    </w:p>
    <w:p><w:del><w:r><w:delText>消した文</w:delText></w:r></w:del></w:p>
    <w:tbl>
      <w:tr>
        <w:tc><w:p><w:r><w:t>甲</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>乙</w:t></w:r></w:p></w:tc>
      </w:tr>
    </w:tbl>
  </w:body>
</w:document>`;

const SHARED = `<sst><si><t>項目</t></si><si><t>着手金</t><rPh><t>チャクシュキン</t></rPh></si></sst>`;
const SHEET = `<worksheet><sheetData>
  <row><c t="s"><v>0</v></c><c t="s"><v>1</v></c></row>
  <row><c><v>330000</v></c></row>
</sheetData></worksheet>`;

describe("docxText", () => {
  it("keeps body text and a table, and leaves drawings and deletions out", () => {
    expect(docxText(DOCUMENT)).toBe(["第1条", "本文", "甲\t乙"].join("\n"));
  });
});

describe("sheetText", () => {
  it("reads shared strings without furigana and keeps a tab between cells", () => {
    expect(readSharedStrings(SHARED)[1]).toBe("着手金");
    expect(sheetText(SHARED, [{ name: "費用", xml: SHEET }])).toBe(["## 費用", "項目\t着手金", "330000"].join("\n"));
  });

  it("skips a sheet that has no rows", () => {
    const read = sheetText(SHARED, [
      { name: "空", xml: "<worksheet><sheetData/></worksheet>" },
      { name: "費用", xml: SHEET },
    ]);
    expect(read.startsWith("## 費用")).toBe(true);
    expect(read).not.toContain("## 空");
  });
});

describe("officeText", () => {
  it("reads a docx package and ignores a picture part", async () => {
    const zip = new JSZip();
    zip.file("word/document.xml", DOCUMENT);
    zip.file("word/media/image1.png", "not-an-image");
    const bytes = await zip.generateAsync({ type: "arraybuffer" });
    expect(await officeText("契約.docx", bytes)).toBe(["第1条", "本文", "甲\t乙"].join("\n"));
  });
});
