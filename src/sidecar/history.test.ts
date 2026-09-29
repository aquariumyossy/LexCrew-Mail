import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { CommittedFile } from "../shared/attachedFiles";
import { deletePerson, getConversation, openHistory, readMemory, replaceNotes, setConversationFiles, startConversation, upsertPerson } from "./history";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function db() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kuru-hist-"));
  dirs.push(dir);
  return openHistory(path.join(dir, "history.db"));
}

describe("conversation files", () => {
  it("keeps the transcript on the conversation and drops a field that is not text", () => {
    const history = db();
    const created = startConversation(history, "mail-1", "件名", true);
    const file: CommittedFile = {
      id: "f1",
      name: "図.pdf",
      origin: "ocr",
      body: "山田太郎 → 山田花子",
      truncated: false,
      size: 12,
      mtime: 3,
    };
    expect(setConversationFiles(history, created.id, [file, { ...file, id: "", name: "x" } as CommittedFile])).toEqual([file]);
    const loaded = getConversation(history, created.id);
    expect(loaded?.files).toEqual([file]);
    expect(JSON.stringify(loaded?.files)).not.toContain("base64");
    history.close();
  });
});

describe("memory", () => {
  it("keeps writing notes in order and person notes across a reopen", () => {
    const history = db();
    const file = history.name;
    const notes = [
      { id: "n1", text: "結びは短くする。" },
      { id: "n2", text: "ですますで書く。" },
      { id: "n3", text: "件名に Re を重ねない。" },
    ];
    expect(replaceNotes(history, notes)).toEqual(notes);
    expect(readMemory(history).notes).toEqual(notes);
    upsertPerson(history, { address: "yamada@a.example", name: "山田", text: "1回目", updatedAt: 1 });
    upsertPerson(history, { address: "yamada@a.example", name: "山田 太郎", text: "2回目", updatedAt: 2 });
    expect(readMemory(history).people).toEqual([{ address: "yamada@a.example", name: "山田 太郎", text: "2回目", updatedAt: 2 }]);
    deletePerson(history, "Yamada@A.example");
    expect(readMemory(history).people).toEqual([]);
    history.close();
    const again = openHistory(file);
    expect(readMemory(again).notes).toEqual(notes);
    again.close();
  });
});
