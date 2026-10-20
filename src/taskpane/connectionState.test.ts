import { describe, expect, it } from "vitest";
import { applyAdopt, connectionNotice, llmConfigured, settingsForStorage } from "./connectionState";

const stored = {
  llmBaseUrl: "http://local",
  llmApiKey: "local-key",
  model: "qwen",
  searxngUrl: "http://local-searx",
};

describe("applyAdopt", () => {
  it("takes the file and drops the three keys from storage", () => {
    const applied = applyAdopt(stored, {
      kind: "ready",
      llmBaseUrl: "http://file",
      llmApiKey: "file-key",
      searxngUrl: "",
    });
    expect(applied.keepConnection).toBe(false);
    expect(applied.settings.llmBaseUrl).toBe("http://file");
    expect(applied.settings.model).toBe("qwen");
    expect(settingsForStorage(applied.settings, applied.keepConnection)).toEqual({ model: "qwen" });
  });

  it("keeps the three keys when the file is broken", () => {
    const applied = applyAdopt(stored, { kind: "broken" });
    expect(applied.keepConnection).toBe(true);
    expect(settingsForStorage(applied.settings, applied.keepConnection)).toEqual(stored);
  });

  it("keeps the key already in memory when the file does not echo it", () => {
    const applied = applyAdopt(stored, { kind: "ready", llmBaseUrl: "http://file", searxngUrl: "", hasApiKey: true });
    expect(applied.settings.llmApiKey).toBe("local-key");
    expect(applied.settings.llmBaseUrl).toBe("http://file");
  });

  it("does not keep empty keys when the file is absent", () => {
    const applied = applyAdopt(stored, { kind: "absent" });
    expect(applied.keepConnection).toBe(false);
    expect(applied.settings).toEqual(stored);
    expect(settingsForStorage(applied.settings, false)).toEqual({ model: "qwen" });
  });
});

describe("saved key reported only as presence", () => {
  it("does not show the startup banner or 未設定 when the key stays on disk", () => {
    const applied = applyAdopt(
      { llmBaseUrl: "", llmApiKey: "", model: "qwen", searxngUrl: "" },
      { kind: "ready", llmBaseUrl: "http://100.65.231.111:8000/v1", searxngUrl: "", hasApiKey: true }
    );
    expect(applied.settings.llmApiKey).toBe("");
    expect(applied.settings.llmBaseUrl).toBe("http://100.65.231.111:8000/v1");
    const view = { ...applied.settings, hasApiKey: true };
    expect(llmConfigured(view)).toBe(true);
    expect(connectionNotice(view)).toBeNull();
  });

  it("still asks for a URL and key when nothing is stored", () => {
    const view = { llmBaseUrl: "http://100.65.231.111:8000/v1", llmApiKey: "", hasApiKey: false };
    expect(llmConfigured(view)).toBe(false);
    expect(connectionNotice(view)).toBe("接続の URL と API キーを入れてください。");
    expect(llmConfigured({ llmBaseUrl: "", llmApiKey: "", hasApiKey: true })).toBe(false);
  });

  it("stays configured after 保存して接続確認 leaves the key field blank", () => {
    const drafted = { llmBaseUrl: "http://100.65.231.111:8000/v1", llmApiKey: "", model: "qwen", searxngUrl: "" };
    const applied = applyAdopt(drafted, {
      kind: "ready",
      llmBaseUrl: drafted.llmBaseUrl,
      searxngUrl: "",
      hasApiKey: true,
    });
    expect(applied.settings.llmApiKey).toBe("");
    expect(connectionNotice({ ...applied.settings, hasApiKey: true })).toBeNull();
  });
});
