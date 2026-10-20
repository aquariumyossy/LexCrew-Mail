import crypto from "crypto";
import fs from "fs";
import https from "https";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { issueLocalhostCertificate, loadOrIssueCertificate } from "./localhostCert";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("issueLocalhostCertificate", () => {
  it("builds a self-signed certificate for 127.0.0.1", () => {
    const now = new Date(Date.UTC(2026, 9, 20, 0, 0, 0));
    const { key, cert } = issueLocalhostCertificate("127.0.0.1", now);
    const parsed = new crypto.X509Certificate(cert);
    expect(parsed.subject).toBe("CN=127.0.0.1");
    expect(parsed.issuer).toBe("CN=127.0.0.1");
    expect(parsed.subjectAltName).toBe("IP Address:127.0.0.1");
    expect(parsed.checkIP("127.0.0.1")).toBe("127.0.0.1");
    expect(parsed.checkIP("10.0.0.1")).toBeUndefined();
    expect(parsed.verify(parsed.publicKey)).toBe(true);
    expect(parsed.checkPrivateKey(crypto.createPrivateKey(key))).toBe(true);
    expect(parsed.validFromDate.toISOString()).toBe("2026-10-19T00:00:00.000Z");
    expect(parsed.validToDate.toISOString()).toBe(new Date(now.getTime() + 10 * 365 * 24 * 60 * 60 * 1000).toISOString());
    // CA:FALSE、digitalSignature|keyEncipherment、serverAuth、SAN IP 127.0.0.1。順序と critical も含む。
    const extensions = Buffer.from(
      "a340303e30090603551d1304023000300b0603551d0f0404030205a030130603551d25040c300a06082b06010505070301300f0603551d110408300687047f000001",
      "hex"
    );
    expect(parsed.raw.includes(extensions)).toBe(true);
  });

  it("serves HTTPS with that certificate", async () => {
    const { key, cert } = issueLocalhostCertificate("127.0.0.1");
    const server = https.createServer({ key, cert }, (_req, res) => {
      res.end("ok");
    });
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });
    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("no port");
      const body = await new Promise<string>((resolve, reject) => {
        const req = https.get({ hostname: "127.0.0.1", port: address.port, ca: cert }, (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk: Buffer) => chunks.push(chunk));
          res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
        });
        req.on("error", reject);
      });
      expect(body).toBe("ok");
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("reuses the certificate already on disk", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kuru-tls-"));
    dirs.push(dir);
    const now = new Date(Date.UTC(2026, 9, 20, 0, 0, 0));
    const first = loadOrIssueCertificate(dir, "127.0.0.1", now);
    const second = loadOrIssueCertificate(dir, "127.0.0.1", new Date(now.getTime() + 86_400_000));
    expect(second).toEqual(first);
    expect(fs.readFileSync(path.join(dir, "key.pem"), "utf8")).toBe(first.key);
    expect(fs.readFileSync(path.join(dir, "cert.pem"), "utf8")).toBe(first.cert);
  });
});
