import "server-only";
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { fail } from "./db";

function baseSecret(): string {
  const s = process.env.APP_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!s) fail(500, "서버 설정 오류: APP_SECRET 또는 SUPABASE_SERVICE_ROLE_KEY 가 필요합니다.");
  return s;
}

function adminCode(): string {
  const code = process.env.ADMIN_CODE;
  if (!code) fail(500, "서버 설정 오류: ADMIN_CODE 환경변수가 없습니다.");
  return code;
}

const b64 = (buf: Buffer | string) => Buffer.from(buf).toString("base64url");

function sign(payload: object, secret: string): string {
  const body = b64(JSON.stringify(payload));
  const sig = b64(createHmac("sha256", secret).update(body).digest());
  return `${body}.${sig}`;
}

function verify<T>(token: string | null | undefined, secret: string): T | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expect = b64(createHmac("sha256", secret).update(body).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(expect);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString()) as T;
  } catch {
    return null;
  }
}

function bearer(req: Request): string | null {
  const h = req.headers.get("authorization") || "";
  return h.startsWith("Bearer ") ? h.slice(7) : null;
}

// ── 관리자 ────────────────────────────────────────────
const ADMIN_TTL_MS = 1000 * 60 * 60 * 24 * 7;

export function checkAdminCode(code: unknown): boolean {
  if (typeof code !== "string") return false;
  const a = Buffer.from(code.trim());
  const b = Buffer.from(adminCode());
  return a.length === b.length && timingSafeEqual(a, b);
}

export function issueAdminToken(): string {
  return sign({ k: "admin", exp: Date.now() + ADMIN_TTL_MS }, `${baseSecret()}:admin:${adminCode()}`);
}

export function requireAdmin(req: Request) {
  const p = verify<{ k: string; exp: number }>(bearer(req), `${baseSecret()}:admin:${adminCode()}`);
  if (!p || p.k !== "admin" || p.exp < Date.now()) fail(401, "관리자 인증이 필요합니다.");
}

// ── 참여자 ────────────────────────────────────────────
export function issueParticipantToken(id: string): string {
  return sign({ k: "p", id }, `${baseSecret()}:participant`);
}

export function participantIdFrom(req: Request): string | null {
  const p = verify<{ k: string; id: string }>(bearer(req), `${baseSecret()}:participant`);
  return p && p.k === "p" && typeof p.id === "string" ? p.id : null;
}

export function requireParticipant(req: Request): string {
  const id = participantIdFrom(req);
  if (!id) fail(401, "다시 로그인해 주세요.");
  return id;
}

// ── PIN ───────────────────────────────────────────────
export function hashPin(pin: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(pin, salt, 32);
  return `s1$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export function verifyPin(pin: string, stored: string): boolean {
  const [v, saltHex, hashHex] = stored.split("$");
  if (v !== "s1" || !saltHex || !hashHex) return false;
  const hash = scryptSync(pin, Buffer.from(saltHex, "hex"), 32);
  const expect = Buffer.from(hashHex, "hex");
  return hash.length === expect.length && timingSafeEqual(hash, expect);
}

export function identOf(dept: string, name: string): string {
  const n = (s: string) => s.replace(/\s+/g, "").toLowerCase();
  return `${n(dept)}|${n(name)}`;
}
