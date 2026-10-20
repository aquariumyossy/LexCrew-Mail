import { releaseIdentity, ReleaseArch } from "../src/shared/buildStamp";

const arch: ReleaseArch = process.env.KURU_ARCH === "x86" ? "x86" : "x64";
const identity = releaseIdentity({
  version: process.env.KURU_VERSION || "",
  commit: process.env.KURU_COMMIT || "",
  dirty: process.env.KURU_DIRTY === "1",
  builtAt: process.env.KURU_BUILT_AT || "",
  fileTime: process.env.KURU_FILE_TIME || "",
  arch,
});
process.stdout.write(JSON.stringify(identity));
