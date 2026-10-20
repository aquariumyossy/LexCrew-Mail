export type BuildStamp = {
  version: string;
  commit: string;
  builtAt: string;
};

export function formatBuildStamp(stamp: BuildStamp): string {
  const version = (stamp.version || "").trim() || "0";
  const commit = (stamp.commit || "").trim() || "dev";
  const builtAt = (stamp.builtAt || "").trim() || "dev";
  return `${version} (${commit}, ${builtAt})`;
}

export type ReleaseArch = "x64" | "x86";

export function commitLabel(commit: string, dirty: boolean): string {
  const sha = (commit || "").trim() || "dev";
  if (dirty && !sha.endsWith("-dirty")) return `${sha}-dirty`;
  return sha;
}

export function releaseIdentity(input: {
  version: string;
  commit: string;
  dirty: boolean;
  builtAt: string;
  fileTime: string;
  arch: ReleaseArch;
}): { stamp: string; commit: string; setup: string; zip: string } {
  const commit = commitLabel(input.commit, input.dirty);
  const arch = input.arch === "x86" ? "-x86" : "";
  const tail = `${input.version}-${commit}-${input.fileTime}`;
  return {
    stamp: formatBuildStamp({ version: input.version, commit, builtAt: input.builtAt }),
    commit,
    setup: `LexCrew-Mail-Setup${arch}-${tail}.exe`,
    zip: `LexCrew-Mail${arch}-${tail}.zip`,
  };
}

export function currentBuildStamp(): BuildStamp {
  return {
    version: readInjected(process.env.KURU_VERSION, "1.1.0"),
    commit: readInjected(process.env.KURU_COMMIT, "dev"),
    builtAt: readInjected(process.env.KURU_BUILT_AT, "dev"),
  };
}

/** A non-401 HTTP response is a sidecar we could reach. Missing build means it is older than this pane. */
export function healthBuildReport(status: number, body: unknown): { reachable: boolean; build: string | null } {
  if (status === 401) return { reachable: false, build: null };
  if (status < 200 || status >= 300) return { reachable: true, build: null };
  return { reachable: true, build: sidecarBuildStamp(body) };
}

export function sidecarBuildStamp(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const build = (payload as { build?: unknown }).build;
  if (typeof build !== "string") return null;
  const text = build.trim();
  return text || null;
}

/** Warn when the pane and the sidecar were not built together. A missing sidecar stamp means the tray is older than this pane. */
export function staleBuildWarning(pane: string, sidecar: string | null, reachable: boolean): string | null {
  if (!reachable) return null;
  if (!sidecar) {
    return `画面は ${pane} です。サイドカーのビルドを確認できません。LexCrew Mail を終了してから入れ直してください。`;
  }
  if (pane === sidecar) return null;
  return `画面は ${pane}、サイドカーは ${sidecar} です。どちらかが古いビルドです。LexCrew Mail を終了してから入れ直してください。`;
}

function readInjected(value: string | undefined, fallback: string): string {
  const text = (value || "").trim();
  return text || fallback;
}
