import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
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

// ── 참여자: 기기 고유값 ──────────────────────────────
// 브라우저가 처음 접속할 때 만든 무작위 기기 ID(122비트)를 헤더로 보낸다.
// 서버에는 해시만 저장하므로 DB 가 노출돼도 기기 ID 를 알 수 없다.
const DEVICE_RE = /^[A-Za-z0-9-]{16,64}$/;

export function deviceHashFrom(req: Request): string | null {
  const id = req.headers.get("x-device-id") || "";
  if (!DEVICE_RE.test(id)) return null;
  return createHash("sha256").update(`fifa-toto:${id}`).digest("hex");
}

export function requireDevice(req: Request): string {
  const h = deviceHashFrom(req);
  if (!h) fail(400, "기기 정보를 확인할 수 없습니다. 브라우저의 사이트 데이터 저장을 허용해 주세요.");
  return h;
}

export function identOf(dept: string, name: string): string {
  const n = (s: string) => s.replace(/\s+/g, "").toLowerCase();
  return `${n(dept)}|${n(name)}`;
}
