import fs from "fs";
import https from "https";
import path from "path";
import express from "express";
import { HOST, PORT } from "./shared/constants";
import { createApp } from "./sidecar/app";
import { loadOrIssueCertificate } from "./sidecar/localhostCert";
import { sessionTokenPath, writeSessionToken } from "./sidecar/sessionAuth";

const dataDir = path.join(process.env.LOCALAPPDATA || path.join(process.cwd(), ".kuru-data"), "KURU");
const logFile = path.join(dataDir, "server.log");

function log(text: string): void {
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.appendFileSync(logFile, `${new Date().toISOString()} ${text}\n`);
  } catch {
    // ログが書けなくてもサーバは止めない
  }
}

/** WebView2 側はサブジェクトに 127.0.0.1 を含む証明書だけを許可する。 */
function loadCertificate(): { key: string; cert: string } {
  return loadOrIssueCertificate(path.join(dataDir, "tls"), HOST);
}

async function main(): Promise<void> {
  const app = createApp();
  const staticDir = path.join(__dirname, "dist");
  app.get("/", (_req, res) => {
    res.redirect("/taskpane.html");
  });
  app.use(express.static(staticDir, {
    etag: false,
    lastModified: false,
    setHeaders(res) {
      res.setHeader("Cache-Control", "no-store");
    },
  }));

  const server = https.createServer(loadCertificate(), app);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(PORT, HOST, () => {
      writeSessionToken(sessionTokenPath(), String(app.locals.sessionToken || ""));
      log(`listening https://${HOST}:${PORT} static ${staticDir}`);
      resolve();
    });
  });
}

main().catch((error: NodeJS.ErrnoException) => {
  if (error && error.code === "EADDRINUSE") {
    log(`port ${PORT} already in use`);
    process.exit(0);
  }
  log(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
