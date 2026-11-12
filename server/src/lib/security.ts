// server/src/lib/security.ts
// Security design (Section 3.6): password hashing, signed session tokens,
// device-key hashing and a simple login rate limiter. Built only on Node's
// crypto module, so there are no extra security packages to install.
import crypto from "node:crypto";

// ---------- Passwords (scrypt with a random salt) ----------
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const candidate = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return expected.length === candidate.length && crypto.timingSafeEqual(candidate, expected);
}

export function isStrongPassword(pw: string): boolean {
  return pw.length >= 8 && /[A-Za-z]/.test(pw) && /\d/.test(pw);
}

// ---------- Device keys (stored only as SHA-256) ----------
export function sha256(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex");
}

// ---------- Session tokens (HMAC-SHA256 signed) ----------
export interface SessionPayload {
  uid: number;
  role: "admin" | "farmer";
  name: string;
  exp: number; // unix seconds
}

const b64url = (buf: Buffer | string) => Buffer.from(buf).toString("base64url");

export function signToken(payload: Omit<SessionPayload, "exp">, secret: string, hours: number): string {
  const body: SessionPayload = { ...payload, exp: Math.floor(Date.now() / 1000) + hours * 3600 };
  const data = b64url(JSON.stringify(body));
  const sig = crypto.createHmac("sha256", secret).update(data).digest("base64url");
  return `${data}.${sig}`;
}

export function verifyToken(token: string, secret: string): SessionPayload | null {
  const [data, sig] = token.split(".");
  if (!data || !sig) return null;
  const expected = crypto.createHmac("sha256", secret).update(data).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(data, "base64url").toString("utf8")) as SessionPayload;
    if (typeof payload.exp !== "number" || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

// ---------- Login rate limiter (5 failures per 15 minutes per IP) ----------
const failures = new Map<string, { count: number; first: number }>();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;

export function isLockedOut(ip: string): boolean {
  const f = failures.get(ip);
  if (!f) return false;
  if (Date.now() - f.first > WINDOW_MS) {
    failures.delete(ip);
    return false;
  }
  return f.count >= MAX_FAILURES;
}

export function recordFailure(ip: string): void {
  const f = failures.get(ip);
  if (!f || Date.now() - f.first > WINDOW_MS) failures.set(ip, { count: 1, first: Date.now() });
  else f.count += 1;
}

export function clearFailures(ip: string): void {
  failures.delete(ip);
}
