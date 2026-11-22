import "server-only";
import { connection } from "next/server";
import { ApiError } from "./db";

type Handler = (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<unknown>;

/** 공통 래퍼: 요청 시점 실행 강제 + 에러를 JSON 으로 변환 + 캐시 금지 */
export function route(fn: Handler) {
  return async (req: Request, ctx: { params: Promise<Record<string, string>> }) => {
    await connection();
    try {
      const data = await fn(req, ctx);
      return Response.json(data ?? { ok: true }, { headers: { "Cache-Control": "no-store" } });
    } catch (e) {
      if (e instanceof ApiError) {
        return Response.json({ error: e.message }, { status: e.status, headers: { "Cache-Control": "no-store" } });
      }
      console.error(e);
      return Response.json({ error: "서버 오류가 발생했습니다." }, { status: 500 });
    }
  };
}

export async function body<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    return {} as T;
  }
}

export function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}
