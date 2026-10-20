const fs = require("fs");
const os = require("os");
const path = require("path");

function missing(tool) {
  console.error(`${tool} が node_modules にありません。リポジトリのルートで npm ci を実行してください。`);
  process.exit(1);
}

let esbuild;
try {
  esbuild = require("esbuild");
} catch (error) {
  missing("esbuild");
}

const outfile = path.join(os.tmpdir(), `kuru-release-identity-${process.pid}.cjs`);
esbuild.buildSync({
  absWorkingDir: path.join(__dirname, ".."),
  entryPoints: [path.join(__dirname, "print-release-identity.ts")],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile,
  logLevel: "silent",
});
try {
  require(outfile);
} finally {
  try {
    fs.unlinkSync(outfile);
  } catch (error) {
    /* the temp bundle is only an input to this process */
  }
}
