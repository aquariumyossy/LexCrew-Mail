export const HOST = "127.0.0.1";
export const PORT = 28770;

export const DEFAULT_MODEL = "qwen3.8-flash-next";
export const DEFAULT_TIMEOUT_MS = 600_000;
export const MIN_TIMEOUT_MS = 30_000;
export const MAX_TIMEOUT_MS = 1_800_000;
/** Same default and character ratio as GURI's context meter. */
export const DEFAULT_CONTEXT_LIMIT = 131_072;
export const CHARS_PER_TOKEN = 1.6;
/** Share of the context limit that tool results may take before older ones shrink. */
export const TOOL_RESULT_BUDGET_RATIO = 0.25;
export const DEFAULT_THINKING_BUDGET = 2_048;
export const MIN_THINKING_BUDGET = 64;

export function clampTimeoutMs(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return DEFAULT_TIMEOUT_MS;
  }
  return Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, Math.round(value)));
}

/** Share of the context limit attached files may take. */
export const FILE_BUDGET_RATIO = 0.25;
/** Share of the window kept for the conversation itself, whatever is attached. */
export const CONVERSATION_BUDGET_RATIO = 0.2;
/** Ceiling for all attached files together, however wide the context window is. */
export const MAX_FILE_CHARS = 60_000;
/** Pending and committed files together. */
export const MAX_ATTACHED_FILES = 10;
/** Pages of a scanned PDF worth reading. */
export const MAX_OCR_PAGES = 20;
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_PDF_BYTES = 20 * 1024 * 1024;
/** base64 grows by 4/3, so the OCR route needs more room than the image cap. */
export const OCR_BODY_LIMIT_BYTES = 12 * 1024 * 1024;
/** A page of dense text is around 2,000 characters. This is room to spare. */
export const MAX_OCR_PAGE_CHARS = 40_000;
/**
 * Wide enough that small print survives. JPEG at 0.92 keeps a thin stroke.
 * 0.85 erased it.
 */
export const RASTER_WIDTH = 1700;
export const RASTER_QUALITY = 0.92;

export const DEFAULT_ARGOS_BASE_URL = "http://127.0.0.1:17890";
export const MAX_TOOL_ROUNDS = 8;
export const MAX_HITS_FOR_MODEL = 5;
export const MAX_SNIPPET_CHARS = 300;
export const SETTINGS_STORAGE_KEY = "kuru.settings.v1";
export const HISTORY_DIR_NAME = "KURU";
export const MEMORY_NOTE_MAX_CHARS = 120;
export const MEMORY_NOTES_MAX = 50;
export const MEMORY_PERSON_MAX_CHARS = 600;
export const MEMORY_PERSON_NAME_MAX_CHARS = 80;
/** People whose notes ride one request. The rest are counted, not sent. */
export const MEMORY_PARTIES_MAX = 8;
