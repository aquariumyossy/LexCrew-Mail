import { execFileSync } from "child_process";
import { readFileSync } from "fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { currentBuildStamp, formatBuildStamp, healthBuildReport, releaseIdentity, sidecarBuildStamp, staleBuildWarning } from "./buildStamp";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("build stamp", () => {
  it("shows the version with the commit and the build time", () => {
    expect(formatBuildStamp({ version: "1.1.2", commit: "6e84904", builtAt: "2026-10-20 12:03" })).toBe(
      "1.1.2 (6e84904, 2026-10-20 12:03)"
    );
  });

  it("names the installer and the zip with the version, commit, and local time", () => {
    const named = releaseIdentity({
      version: "1.1.2",
      commit: "6e84904",
      dirty: false,
      builtAt: "2026-10-20 12:05",
      fileTime: "20261020-1205",
      arch: "x64",
    });
    expect(named.setup).toBe("LexCrew-Mail-Setup-1.1.2-6e84904-20261020-1205.exe");
    expect(named.zip).toBe("LexCrew-Mail-1.1.2-6e84904-20261020-1205.zip");
    expect(named.stamp).toBe("1.1.2 (6e84904, 2026-10-20 12:05)");
  });

  it("marks a dirty tree in the file name and the stamp", () => {
    const named = releaseIdentity({
      version: "1.1.2",
      commit: "6e84904",
      dirty: true,
      builtAt: "2026-10-20 12:05",
      fileTime: "20261020-1205",
      arch: "x86",
    });
    expect(named.commit).toBe("6e84904-dirty");
    expect(named.setup).toBe("LexCrew-Mail-Setup-x86-1.1.2-6e84904-dirty-20261020-1205.exe");
    expect(named.zip).toBe("LexCrew-Mail-x86-1.1.2-6e84904-dirty-20261020-1205.zip");
    expect(named.stamp).toBe("1.1.2 (6e84904-dirty, 2026-10-20 12:05)");
  });

  it("reads an injected stamp from KURU_* and falls back when those variables are blank", () => {
    vi.stubEnv("KURU_VERSION", "9.9.9");
    vi.stubEnv("KURU_COMMIT", "b5cca57-dirty");
    vi.stubEnv("KURU_BUILT_AT", "2026-10-20 13:25");
    expect(formatBuildStamp(currentBuildStamp())).toBe("9.9.9 (b5cca57-dirty, 2026-10-20 13:25)");
    vi.stubEnv("KURU_VERSION", "");
    vi.stubEnv("KURU_COMMIT", "");
    vi.stubEnv("KURU_BUILT_AT", "");
    expect(formatBuildStamp(currentBuildStamp())).toBe("1.1.2 (dev, dev)");
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { version: string };
    expect(currentBuildStamp().version).toBe(pkg.version);
  });

  it("prints that same identity from the packager entry", () => {
    const out = execFileSync(process.execPath, ["scripts/emit-release-identity.cjs"], {
      encoding: "utf8",
      env: {
        ...process.env,
        KURU_VERSION: "1.1.2",
        KURU_COMMIT: "6e84904",
        KURU_DIRTY: "1",
        KURU_BUILT_AT: "2026-10-20 12:05",
        KURU_FILE_TIME: "20261020-1205",
        KURU_ARCH: "x86",
      },
    });
    expect(JSON.parse(out)).toEqual({
      stamp: "1.1.2 (6e84904-dirty, 2026-10-20 12:05)",
      commit: "6e84904-dirty",
      setup: "LexCrew-Mail-Setup-x86-1.1.2-6e84904-dirty-20261020-1205.exe",
      zip: "LexCrew-Mail-x86-1.1.2-6e84904-dirty-20261020-1205.zip",
    });
  });

  it("warns when the pane and the sidecar were built apart", () => {
    const pane = "1.1.2 (6e84904, 2026-10-20 12:03)";
    const sidecar = "1.1.2 (b64b1a6, 2026-10-19 09:00)";
    expect(staleBuildWarning(pane, sidecar, true)).toContain("6e84904");
    expect(staleBuildWarning(pane, sidecar, true)).toContain("b64b1a6");
    expect(staleBuildWarning(pane, pane, true)).toBeNull();
  });

  it("warns when the running sidecar does not report a stamp", () => {
    expect(sidecarBuildStamp({ ok: true, service: "LexCrew Mail" })).toBeNull();
    expect(staleBuildWarning("1.1.2 (6e84904, 2026-10-20 12:03)", null, true)).toContain("確認できません");
    expect(staleBuildWarning("1.1.2 (dev, dev)", null, false)).toBeNull();
  });

  it("treats a health response without a stamp as a reachable old sidecar", () => {
    expect(healthBuildReport(404, { error: "not found" })).toEqual({ reachable: true, build: null });
    expect(healthBuildReport(200, { ok: true })).toEqual({ reachable: true, build: null });
    expect(healthBuildReport(200, { ok: true, build: "1.1.2 (6e84904, 2026-10-20 12:03)" }).build).toBe(
      "1.1.2 (6e84904, 2026-10-20 12:03)"
    );
    expect(healthBuildReport(401, { error: "認証が必要です。" })).toEqual({ reachable: false, build: null });
  });
});