export type ConnectionFields = {
  llmBaseUrl: string;
  llmApiKey: string;
  searxngUrl: string;
};

export type ConnectionView =
  | ({ kind: "ready"; hasApiKey?: boolean } & Partial<Pick<ConnectionFields, "llmApiKey">> & Omit<ConnectionFields, "llmApiKey">)
  | { kind: "absent" }
  | { kind: "broken" };

/** URL plus either a key in memory or the file's presence flag. The file does not echo the key. */
export function llmConfigured(input: { llmBaseUrl: string; llmApiKey: string; hasApiKey?: boolean }): boolean {
  return Boolean(input.llmBaseUrl.trim()) && (Boolean(input.llmApiKey.trim()) || input.hasApiKey === true);
}

export function connectionNotice(input: { llmBaseUrl: string; llmApiKey: string; hasApiKey?: boolean }): string | null {
  if (llmConfigured(input)) return null;
  return "接続の URL と API キーを入れてください。";
}

export function applyAdopt<T extends ConnectionFields>(
  settings: T,
  result: ConnectionView
): { settings: T; keepConnection: boolean } {
  if (result.kind === "ready") {
    return {
      settings: {
        ...settings,
        llmBaseUrl: result.llmBaseUrl,
        llmApiKey: typeof result.llmApiKey === "string" ? result.llmApiKey : settings.llmApiKey,
        searxngUrl: result.searxngUrl,
      },
      keepConnection: false,
    };
  }
  return { settings, keepConnection: result.kind === "broken" };
}

export function settingsForStorage<T extends ConnectionFields>(settings: T, keepConnection: boolean): T | Omit<T, keyof ConnectionFields> {
  if (keepConnection) return settings;
  const { llmBaseUrl: _llmBaseUrl, llmApiKey: _llmApiKey, searxngUrl: _searxngUrl, ...rest } = settings;
  return rest;
}
