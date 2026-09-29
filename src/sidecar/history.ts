import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import { CommittedFile, parseCommittedFiles } from "../shared/attachedFiles";
import { HISTORY_DIR_NAME } from "../shared/constants";
import { Memory, PersonNote, WritingNote, normalizeAddress } from "../shared/memory";

export type HistoryDb = Database.Database;

export function historyPath(): string {
  const root = process.env.APPDATA || path.join(process.cwd(), ".kuru-data");
  return path.join(root, HISTORY_DIR_NAME, "history.db");
}

export function openHistory(file = historyPath()): HistoryDb {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      conversation_key TEXT NOT NULL,
      title TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      tool_calls_json TEXT NOT NULL DEFAULT '',
      tool_call_id TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id)
    );
  `);
  const columns = db.prepare("PRAGMA table_info(messages)").all() as Array<{ name: string }>;
  if (!columns.some((column) => column.name === "reasoning_content")) {
    db.exec("ALTER TABLE messages ADD COLUMN reasoning_content TEXT NOT NULL DEFAULT ''");
  }
  const conversations = db.prepare("PRAGMA table_info(conversations)").all() as Array<{ name: string }>;
  if (!conversations.some((column) => column.name === "files_json")) {
    db.exec("ALTER TABLE conversations ADD COLUMN files_json TEXT NOT NULL DEFAULT '[]'");
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS memory_notes (
      id TEXT PRIMARY KEY,
      text TEXT NOT NULL,
      position INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS memory_people (
      address TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      text TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
  return db;
}

const UNTITLED = "新しい会話";

export function conversationTitle(text: string): string {
  const first = (text || "").split("\n").find((line) => line.trim()) || "";
  const trimmed = first.trim().replace(/\s+/g, " ");
  if (!trimmed) return UNTITLED;
  return trimmed.length > 40 ? `${trimmed.slice(0, 40)}…` : trimmed;
}

function nameUntitled(db: HistoryDb): void {
  const rows = db.prepare("SELECT id FROM conversations WHERE title = ?").all(UNTITLED) as Array<{ id: string }>;
  const firstUser = db.prepare(
    "SELECT content FROM messages WHERE conversation_id = ? AND role = 'user' AND trim(content) != '' ORDER BY created_at ASC LIMIT 1"
  );
  const update = db.prepare("UPDATE conversations SET title = ? WHERE id = ?");
  for (const row of rows) {
    const message = firstUser.get(row.id) as { content: string } | undefined;
    if (!message) continue;
    const title = conversationTitle(message.content);
    if (title !== UNTITLED) update.run(title, row.id);
  }
}

export function listConversations(db: HistoryDb, conversationKey: string) {
  nameUntitled(db);
  const rows = conversationKey
    ? db
        .prepare(
          "SELECT id, conversation_key as conversationKey, title, created_at as createdAt, updated_at as updatedAt FROM conversations WHERE conversation_key = ? ORDER BY updated_at DESC"
        )
        .all(conversationKey)
    : db
        .prepare(
          "SELECT id, conversation_key as conversationKey, title, created_at as createdAt, updated_at as updatedAt FROM conversations ORDER BY updated_at DESC"
        )
        .all();
  return rows;
}

export function startConversation(db: HistoryDb, conversationKey: string, title: string, fresh = false) {
  if (!fresh) {
    const existing = db
      .prepare(
        "SELECT id, conversation_key as conversationKey, title, created_at as createdAt, updated_at as updatedAt FROM conversations WHERE conversation_key = ? ORDER BY updated_at DESC LIMIT 1"
      )
      .get(conversationKey) as { id: string } | undefined;
    if (existing) {
      return existing;
    }
  }
  const now = Date.now();
  const id = `c_${now.toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const label = conversationTitle(title);
  db.prepare(
    "INSERT INTO conversations (id, conversation_key, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
  ).run(id, conversationKey, label, now, now);
  return { id, conversationKey, title: label, createdAt: now, updatedAt: now };
}

export function getConversation(db: HistoryDb, id: string) {
  const conversation = db
    .prepare(
      "SELECT id, conversation_key as conversationKey, title, files_json as filesJson, created_at as createdAt, updated_at as updatedAt FROM conversations WHERE id = ?"
    )
    .get(id) as { filesJson?: string } | undefined;
  if (!conversation) {
    return null;
  }
  const files = parseCommittedFiles(safeJson(conversation.filesJson));
  const messages = db
    .prepare(
      "SELECT id, role, content, reasoning_content as reasoningContent, tool_calls_json as toolCallsJson, tool_call_id as toolCallId, created_at as createdAt FROM messages WHERE conversation_id = ? ORDER BY created_at ASC"
    )
    .all(id);
  return { conversation, messages, files };
}

export function setConversationFiles(db: HistoryDb, id: string, files: CommittedFile[]): CommittedFile[] | null {
  const found = db.prepare("SELECT id FROM conversations WHERE id = ?").get(id);
  if (!found) {
    return null;
  }
  const parsed = parseCommittedFiles(files);
  db.prepare("UPDATE conversations SET files_json = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(parsed), Date.now(), id);
  return parsed;
}

function safeJson(value: string | undefined): unknown {
  try {
    return JSON.parse(value || "[]");
  } catch {
    return [];
  }
}

export function appendMessage(db: HistoryDb, conversationId: string, body: Record<string, unknown>) {
  const found = db.prepare("SELECT id FROM conversations WHERE id = ?").get(conversationId);
  if (!found) {
    throw new Error("その会話は見つかりませんでした。");
  }
  const now = Date.now();
  const id = `m_${now.toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const role = body.role === "assistant" || body.role === "tool" ? body.role : "user";
  const content = typeof body.content === "string" ? body.content : "";
  const toolCallsJson = body.toolCalls ? JSON.stringify(body.toolCalls) : "";
  const toolCallId = typeof body.toolCallId === "string" ? body.toolCallId : "";
  const reasoning = typeof body.reasoningContent === "string" ? body.reasoningContent : "";
  db.prepare(
    "INSERT INTO messages (id, conversation_id, role, content, reasoning_content, tool_calls_json, tool_call_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(id, conversationId, role, content, reasoning, toolCallsJson, toolCallId, now);
  const current = db.prepare("SELECT title FROM conversations WHERE id = ?").get(conversationId) as { title: string };
  const title = current.title === UNTITLED && role === "user" ? conversationTitle(content) : current.title;
  db.prepare("UPDATE conversations SET updated_at = ?, title = ? WHERE id = ?").run(now, title, conversationId);
  return { id, role, content, toolCallsJson, toolCallId, createdAt: now };
}

export function readMemory(db: HistoryDb): Memory {
  const notes = db.prepare("SELECT id, text FROM memory_notes ORDER BY position ASC").all() as WritingNote[];
  const people = db
    .prepare("SELECT address, name, text, updated_at as updatedAt FROM memory_people ORDER BY updated_at DESC")
    .all() as PersonNote[];
  return { notes, people };
}

export function replaceNotes(db: HistoryDb, notes: WritingNote[]): WritingNote[] {
  const insert = db.prepare("INSERT INTO memory_notes (id, text, position) VALUES (?, ?, ?)");
  db.transaction(() => {
    db.prepare("DELETE FROM memory_notes").run();
    notes.forEach((note, position) => insert.run(note.id, note.text, position));
  })();
  return notes;
}

export function upsertPerson(db: HistoryDb, person: PersonNote): PersonNote {
  db.prepare(
    "INSERT INTO memory_people (address, name, text, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(address) DO UPDATE SET name = excluded.name, text = excluded.text, updated_at = excluded.updated_at"
  ).run(person.address, person.name, person.text, person.updatedAt);
  return person;
}

export function deletePerson(db: HistoryDb, address: string): void {
  const key = normalizeAddress(address);
  if (!key) return;
  db.prepare("DELETE FROM memory_people WHERE address = ?").run(key);
}

export function deleteConversation(db: HistoryDb, id: string): void {
  db.prepare("DELETE FROM messages WHERE conversation_id = ?").run(id);
  db.prepare("DELETE FROM conversations WHERE id = ?").run(id);
}
