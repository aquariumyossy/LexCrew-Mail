import { normalizeAddress, parseNotes, parsePerson, renderMemorySection } from "./memory";

const person = (address: string, text = "発注元。丁寧語。") => ({
  address,
  name: "山田",
  text,
  updatedAt: 1,
});

describe("normalizeAddress", () => {
  it("lowercases a trimmed smtp address and rejects an exchange dn", () => {
    expect(normalizeAddress(" Yamada@A.Example ")).toBe("yamada@a.example");
    expect(normalizeAddress("/O=ORG/CN=YAMADA")).toBe("");
  });
});

describe("renderMemorySection", () => {
  it("returns nothing when both sides are empty", () => {
    expect(renderMemorySection({ notes: [], people: [] }, [])).toBe("");
  });

  it("renders one writing note and no people heading", () => {
    expect(
      renderMemorySection(
        { notes: [{ id: "n1", text: "結びは短くする。" }], people: [] },
        [{ role: "to", name: "山田", address: "yamada@a.example" }]
      )
    ).toBe(
      [
        "## 共通コンテキスト",
        "利用者自身の立場と前提である。別の会話でも守る。今の会話の指示と食い違うときは、今の会話を優先する。",
        "- 結びは短くする。",
      ].join("\n")
    );
  });

  it("matches an address once, ignoring case", () => {
    const section = renderMemorySection(
      { notes: [], people: [person("yamada@a.example", "発注元。")] },
      [
        { role: "to", name: "山田 太郎", address: "YAMADA@a.example" },
        { role: "cc", name: "山田", address: "yamada@a.example" },
      ]
    );
    expect(section.match(/^- /gm)).toHaveLength(1);
    expect(section).toContain("- 山田 太郎 <yamada@a.example>：発注元。");
  });

  it("sends eight people and counts the rest", () => {
    const people = Array.from({ length: 10 }, (_, index) => person(`p${index}@a.example`, `メモ${index}`));
    const parties = people.map((row) => ({ role: "to" as const, name: row.name, address: row.address }));
    const section = renderMemorySection({ notes: [], people }, parties);
    expect(section.match(/^- /gm)).toHaveLength(8);
    expect(section.endsWith("ほか 2 人のメモは載せていない。")).toBe(true);
  });

  it("does not count a party who has no note", () => {
    const people = Array.from({ length: 9 }, (_, index) => person(`p${index}@a.example`, `メモ${index}`));
    const parties = [
      ...people.map((row) => ({ role: "to" as const, name: row.name, address: row.address })),
      { role: "cc" as const, name: "無記", address: "none@a.example" },
    ];
    const section = renderMemorySection({ notes: [], people }, parties);
    expect(section.match(/^- /gm)).toHaveLength(8);
    expect(section.endsWith("ほか 1 人のメモは載せていない。")).toBe(true);
    expect(section).not.toContain("none@a.example");
  });

  it("turns line breaks in a person note into one ideographic space", () => {
    const section = renderMemorySection(
      { notes: [], people: [{ address: "yamada@a.example", name: "", text: "発注元。\n丁寧語。", updatedAt: 1 }] },
      [{ role: "from", name: "", address: "yamada@a.example" }]
    );
    expect(section).toContain("- yamada@a.example：発注元。　丁寧語。");
  });
});

describe("parseNotes", () => {
  it("rejects a line over 120 characters and a 51st note", () => {
    expect(parseNotes([{ text: "あ".repeat(121) }])).toEqual({ ok: false, error: "共通コンテキストは1行120字までです。" });
    const notes = Array.from({ length: 51 }, (_, index) => ({ id: `n${index}`, text: `規則${index}` }));
    expect(parseNotes(notes)).toEqual({ ok: false, error: "共通コンテキストは50件までです。" });
  });
});

describe("parsePerson", () => {
  it("rejects a note over 600 characters", () => {
    expect(parsePerson({ name: "山田", text: "あ".repeat(601) }, "yamada@a.example", 3)).toEqual({
      ok: false,
      error: "相手方のコンテキストは600字までです。",
    });
  });
});
