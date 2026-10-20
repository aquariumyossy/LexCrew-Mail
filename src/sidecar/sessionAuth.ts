import crypto from "crypto";
import fs from "fs";
import path from "path";

export const SESSION_TOKEN_HEADER = "x-lexcrew-token";

export function newSessionToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function sessionTokenPath(env: NodeJS.ProcessEnv = process.env): string {
  const root = env.LOCALAPPDATA || path.join(process.cwd(), ".kuru-data");
  return path.join(root, "KURU", "session.token");
}

export function writeSessionToken(file: string, token: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${token}\n`, { mode: 0o600 });
  try {
    fs.chmodSync(file, 0o600);
  } catch {
    // Windows may ignore the mode. The file still sits in the user profile.
  }
}

export function tokenMatches(presented: string, expected: string): boolean {
  const left = crypto.createHash("sha256").update(presented).digest();
  const right = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(left, right);
}
