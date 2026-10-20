import crypto from "crypto";
import fs from "fs";
import path from "path";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const TEN_YEARS_MS = 10 * 365 * ONE_DAY_MS;

function derLen(length: number): Buffer {
  if (length < 0x80) return Buffer.from([length]);
  const bytes: number[] = [];
  let rest = length;
  while (rest > 0) {
    bytes.unshift(rest & 0xff);
    rest = Math.floor(rest / 256);
  }
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}

function der(tag: number, content: Buffer): Buffer {
  return Buffer.concat([Buffer.from([tag]), derLen(content.length), content]);
}

function seq(parts: Buffer[]): Buffer {
  return der(0x30, Buffer.concat(parts));
}

function oid(dotted: string): Buffer {
  const parts = dotted.split(".").map((part) => Number(part));
  const bytes = [40 * parts[0] + parts[1]];
  for (const part of parts.slice(2)) {
    const encoded = [part & 0x7f];
    let value = Math.floor(part / 128);
    while (value > 0) {
      encoded.unshift((value & 0x7f) | 0x80);
      value = Math.floor(value / 128);
    }
    bytes.push(...encoded);
  }
  return der(0x06, Buffer.from(bytes));
}

function algorithm(dotted: string): Buffer {
  return seq([oid(dotted), Buffer.from([0x05, 0x00])]);
}

function integer(bytes: Buffer): Buffer {
  let start = 0;
  while (start < bytes.length - 1 && bytes[start] === 0) start += 1;
  let body = bytes.subarray(start);
  if ((body[0] & 0x80) !== 0) body = Buffer.concat([Buffer.from([0x00]), body]);
  return der(0x02, body);
}

function bitString(payload: Buffer): Buffer {
  return der(0x03, Buffer.concat([Buffer.from([0x00]), payload]));
}

function utcOrGeneralized(date: Date): Buffer {
  const year = date.getUTCFullYear();
  const tail = [
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
    String(date.getUTCHours()).padStart(2, "0"),
    String(date.getUTCMinutes()).padStart(2, "0"),
    String(date.getUTCSeconds()).padStart(2, "0"),
  ].join("");
  if (year >= 2050) return der(0x18, Buffer.from(`${String(year).padStart(4, "0")}${tail}Z`, "ascii"));
  return der(0x17, Buffer.from(`${String(year % 100).padStart(2, "0")}${tail}Z`, "ascii"));
}

function commonName(value: string): Buffer {
  const attribute = seq([oid("2.5.4.3"), der(0x13, Buffer.from(value, "ascii"))]);
  return seq([der(0x31, attribute)]);
}

function extension(dotted: string, value: Buffer): Buffer {
  return seq([oid(dotted), der(0x04, value)]);
}

function ipv4(host: string): Buffer {
  const parts = host.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    throw new Error("localhost certificate host must be an IPv4 address");
  }
  return Buffer.from(parts);
}

/**
 * 127.0.0.1 用の自己署名証明書。このプロセスの鍵で署名するだけで、
 * 受け取った署名は検証しない。
 */
export function issueLocalhostCertificate(host: string, now = new Date()): { key: string; cert: string } {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "der" },
  });
  const serial = crypto.randomBytes(16);
  serial[0] &= 0x7f;
  if (serial.every((byte) => byte === 0)) serial[0] = 1;
  const notBefore = new Date(now.getTime() - ONE_DAY_MS);
  const notAfter = new Date(now.getTime() + TEN_YEARS_MS);
  const extensions = seq([
    extension("2.5.29.19", seq([])),
    extension("2.5.29.15", der(0x03, Buffer.from([0x05, 0xa0]))),
    extension("2.5.29.37", seq([oid("1.3.6.1.5.5.7.3.1")])),
    extension("2.5.29.17", seq([der(0x87, ipv4(host))])),
  ]);
  const tbs = seq([
    der(0xa0, integer(Buffer.from([0x02]))),
    integer(serial),
    algorithm("1.2.840.113549.1.1.11"),
    commonName(host),
    seq([utcOrGeneralized(notBefore), utcOrGeneralized(notAfter)]),
    commonName(host),
    publicKey,
    der(0xa3, extensions),
  ]);
  const signature = crypto.createSign("RSA-SHA256").update(tbs).sign(privateKey);
  const certificate = seq([tbs, algorithm("1.2.840.113549.1.1.11"), bitString(signature)]);
  const body = certificate.toString("base64").match(/.{1,64}/g)?.join("\n") ?? "";
  return {
    key: privateKey,
    cert: `-----BEGIN CERTIFICATE-----\n${body}\n-----END CERTIFICATE-----\n`,
  };
}

export function loadOrIssueCertificate(dir: string, host: string, now = new Date()): { key: string; cert: string } {
  const keyFile = path.join(dir, "key.pem");
  const certFile = path.join(dir, "cert.pem");
  if (fs.existsSync(keyFile) && fs.existsSync(certFile)) {
    return { key: fs.readFileSync(keyFile, "utf8"), cert: fs.readFileSync(certFile, "utf8") };
  }
  const issued = issueLocalhostCertificate(host, now);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(keyFile, issued.key);
  fs.writeFileSync(certFile, issued.cert);
  return issued;
}
