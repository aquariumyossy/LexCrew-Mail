import { foreignChars } from "./japaneseHan";

describe("foreignChars", () => {
  it("allows the name character 𠮷 and still flags a non-Japanese han", () => {
    expect(foreignChars("𠮷田")).toEqual([]);
    expect(foreignChars("简")).toEqual(["简"]);
  });
});
