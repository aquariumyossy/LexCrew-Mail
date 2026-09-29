import { describe, expect, it } from "vitest";
import { aboutCopy, DISCLAIMER } from "./about";

describe("aboutCopy", () => {
  it("keeps the disclaimer in the overview", () => {
    expect(aboutCopy.overview).toContain(DISCLAIMER);
  });

  it("names each runtime license", () => {
    expect(Object.fromEntries(aboutCopy.licenses.map((row) => [row.name, row.license]))).toEqual({
      "better-sqlite3": "MIT",
      express: "MIT",
      marked: "MIT",
      JSZip: "MIT",
      DOMPurify: "MPL-2.0 または Apache-2.0",
      "node-ical": "Apache-2.0",
      "pdf.js": "Apache-2.0",
      "node-forge": "BSD-3-Clause",
    });
    expect(aboutCopy.licenses.find((row) => row.name === "JSZip")?.choice).toBe("MIT または GPL-3.0。本アプリは MIT。");
    expect(aboutCopy.licenses.find((row) => row.name === "node-forge")?.choice).toBe(
      "BSD-3-Clause または GPL-2.0。本アプリは BSD-3-Clause。"
    );
  });

  it("explains features without the inference engine", () => {
    const text = [aboutCopy.overview.join("\n"), ...aboutCopy.features.map((feature) => `${feature.title}\n${feature.body}`)].join("\n");
    expect(text).not.toMatch(/MTPLX|LLM|推論|SearXNG/);
    expect(aboutCopy.features.map((feature) => feature.title)).toEqual([
      "指示して文面を作る",
      "御礼・承諾・お断り・日程調整",
      "参考にする情報",
      "予定",
      "ファイル",
      "履歴とコンテキスト",
    ]);
  });

  it("credits the developer", () => {
    expect(aboutCopy.credit).toBe("弁護士　吉田秀平");
  });
});
