import { describe, expect, it } from "vitest";
import { formatBuildStamp, releaseIdentity, sidecarBuildStamp, staleBuildWarning } from "./buildStamp";

describe("build stamp", () => {
  it("shows the version with the commit and the build time", () => {
    expect(formatBuildStamp({ version: "1.0.7", commit: "6e84904", builtAt: "2026-10-20 12:03" })).toBe(
      "1.0.7 (6e84904, 2026-10-20 12:03)"
    );
  });

  it("names the installer and the zip with the version, commit, and local time", () => {
    const named = releaseIdentity({
      version: "1.0.7",
      commit: "6e84904",
      dirty: false,
      builtAt: "2026-10-20 12:05",
      fileTime: "20261020-1205",
      arch: "x64",
    });
    expect(named.setup).toBe("LexCrew-Mail-Setup-1.0.7-6e84904-20261020-1205.exe");
    expect(named.zip).toBe("LexCrew-Mail-1.0.7-6e84904-20261020-1205.zip");
    expect(named.stamp).toBe("1.0.7 (6e84904, 2026-10-20 12:05)");
  });

  it("marks a dirty tree in the file name and the stamp", () => {
    const named = releaseIdentity({
      version: "1.0.7",
      commit: "6e84904",
      dirty: true,
      builtAt: "2026-10-20 12:05",
      fileTime: "20261020-1205",
      arch: "x86",
    });
    expect(named.commit).toBe("6e84904-dirty");
    expect(named.setup).toBe("LexCrew-Mail-Setup-x86-1.0.7-6e84904-dirty-20261020-1205.exe");
    expect(named.zip).toBe("LexCrew-Mail-x86-1.0.7-6e84904-dirty-20261020-1205.zip");
    expect(named.stamp).toBe("1.0.7 (6e84904-dirty, 2026-10-20 12:05)");
  });

  it("warns when the pane and the sidecar were built apart", () => {
    const pane = "1.0.7 (6e84904, 2026-10-20 12:03)";
    const sidecar = "1.0.7 (b64b1a6, 2026-10-19 09:00)";
    expect(staleBuildWarning(pane, sidecar, true)).toContain("6e84904");
    expect(staleBuildWarning(pane, sidecar, true)).toContain("b64b1a6");
    expect(staleBuildWarning(pane, pane, true)).toBeNull();
  });

  it("warns when the running sidecar does not report a stamp", () => {
    expect(sidecarBuildStamp({ ok: true, service: "LexCrew Mail" })).toBeNull();
    expect(staleBuildWarning("1.0.7 (6e84904, 2026-10-20 12:03)", null, true)).toContain("確認できません");
    expect(staleBuildWarning("1.0.7 (dev, dev)", null, false)).toBeNull();
  });
});