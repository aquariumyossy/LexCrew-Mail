import crypto from "crypto";
import fs from "fs";
import https from "https";
import path from "path";
import express from "express";
import forge from "node-forge";
import { HOST, PORT } from "./shared/constants";
import { createApp } from "./sidecar/app";

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
  const dir = path.join(dataDir, "tls");
  const keyFile = path.join(dir, "key.pem");
  const certFile = path.join(dir, "cert.pem");
  if (fs.existsSync(keyFile) && fs.existsSync(certFile)) {
    return { key: fs.readFileSync(keyFile, "utf8"), cert: fs.readFileSync(certFile, "utf8") };
  }
  const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });
  const cert = forge.pki.createCertificate();
  cert.publicKey = forge.pki.publicKeyFromPem(publicKey);
  cert.serialNumber = crypto.randomBytes(16).toString("hex").replace(/^[89a-f]/, "0");
  cert.validity.notBefore = new Date(Date.now() - 24 * 60 * 60 * 1000);
  cert.validity.notAfter = new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000);
  const subject = [{ name: "commonName", value: HOST }];
  cert.setSubject(subject);
  cert.setIssuer(subject);
  cert.setExtensions([
    { name: "basicConstraints", cA: false },
    { name: "keyUsage", digitalSignature: true, keyEncipherment: true },
    { name: "extKeyUsage", serverAuth: true },
    { name: "subjectAltName", altNames: [{ type: 7, ip: HOST }] },
  ]);
  cert.sign(forge.pki.privateKeyFromPem(privateKey), forge.md.sha256.create());
  const certPem = forge.pki.certificateToPem(cert);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(keyFile, privateKey);
  fs.writeFileSync(certFile, certPem);
  return { key: privateKey, cert: certPem };
}

async function main(): Promise<void> {
  const app = createApp();
  const staticDir = path.join(__dirname, "dist");
  app.get("/", (_req, res) => {
    res.redirect("/taskpane.html");
  });
  app.use(express.static(staticDir, { maxAge: 0 }));

  const server = https.createServer(loadCertificate(), app);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(PORT, HOST, () => {
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
