import "server-only";
import { createHash } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  rankRows,
  type LeaderRow,
  type MatchRow,
  type Mode,
  type Settings,
  type Status,
  type Team,
} from "../bracket";
import type { PublicState } from "../types";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function fail(status: number, message: string): never {
  throw new ApiError(status, message);
}

let client: SupabaseClient | null = null;

export function supabaseUrl() {
  return process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
}

export function db(): SupabaseClient {
  if (client) return client;
  const url = supabaseUrl();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || "";
  if (!url || !key) {
    fail(500, "서버 설정 오류: Supabase 환경변수(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)가 없습니다.");
  }
  client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) fail(500, `DB 오류: ${res.error.message}`);
  return res.data;
}

interface SettingsRow {
  title: string;
  status: Status;
  revealed: boolean;
  third_place: boolean;
  draw: (string | null)[];
  max_participants: number;
}

export async function getSettings(): Promise<Settings> {
  const row = check(await db().from("settings").select("*").eq("id", 1).maybeSingle()) as SettingsRow | null;
  if (!row) fail(500, "settings 행이 없습니다. supabase/schema.sql 을 실행했는지 확인하세요.");
  return {
    title: row.title,
    status: row.status,
    revealed: row.revealed,
    thirdPlace: row.third_place,
    draw: Array.isArray(row.draw) ? row.draw : [],
    maxParticipants: row.max_participants,
  };
}

export async function updateSettings(patch: Partial<SettingsRow>) {
  check(
    await db()
      .from("settings")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", 1),
  );
}

export async function getTeams(): Promise<Team[]> {
  const rows = check(await db().from("teams").select("id,name").order("created_at").order("id")) as Team[];
  return rows ?? [];
}

interface MatchDbRow {
  key: string;
  mode: Mode;
  winner_team_id: string | null;
  winner_score: number | null;
  loser_score: number | null;
}

export async function getMatches(): Promise<MatchRow[]> {
  const rows = (check(await db().from("matches").select("key,mode,winner_team_id,winner_score,loser_score")) ??
    []) as MatchDbRow[];
  return rows.map((r) => ({
    key: r.key,
    mode: r.mode,
    winnerTeamId: r.winner_team_id,
    winnerScore: r.winner_score,
    loserScore: r.loser_score,
  }));
}

export async function getLeaderboard(): Promise<LeaderRow[]> {
  const rows = (check(await db().rpc("leaderboard")) ?? []) as Omit<LeaderRow, "points" | "rate" | "rank">[];
  return rankRows(rows);
}

export async function getPickStats(): Promise<Record<string, Record<string, number>>> {
  const rows = (check(await db().rpc("pick_stats")) ?? []) as { match_key: string; team_id: string; cnt: number }[];
  const out: Record<string, Record<string, number>> = {};
  for (const r of rows) (out[r.match_key] ??= {})[r.team_id] = r.cnt;
  return out;
}

export async function participantCount(): Promise<number> {
  const res = await db().from("participants").select("id", { count: "exact", head: true });
  if (res.error) fail(500, `DB 오류: ${res.error.message}`);
  return res.count ?? 0;
}

// 순위/분포는 무거우므로 같은 버전이면 인스턴스 메모리에서 재사용 (500명 동시 새로고침 대비)
let memo: { version: string; leaderboard: PublicState["leaderboard"]; pickStats: PublicState["pickStats"] } | null =
  null;

/**
 * 공개 상태 조회. 가벼운 쿼리로 버전을 먼저 계산하고,
 * 클라이언트가 가진 버전과 같으면 무거운 순위 계산을 건너뛴다.
 */
export async function loadPublicState(
  clientVersion?: string | null,
): Promise<(PublicState & { version: string }) | { version: string; unchanged: true }> {
  const [settings, teams, matches, count] = await Promise.all([
    getSettings(),
    getTeams(),
    getMatches(),
    participantCount(),
  ]);
  const version = createHash("sha1")
    .update(JSON.stringify([settings, teams, matches, count]))
    .digest("base64url")
    .slice(0, 16);
  if (clientVersion && clientVersion === version) return { version, unchanged: true };

  let leaderboard: PublicState["leaderboard"] = null;
  let pickStats: PublicState["pickStats"] = null;
  if (memo && memo.version === version) {
    ({ leaderboard, pickStats } = memo);
  } else {
    [leaderboard, pickStats] = await Promise.all([
      settings.status === "closed" ? getLeaderboard() : Promise.resolve(null),
      settings.status === "closed" && settings.revealed ? getPickStats() : Promise.resolve(null),
    ]);
    memo = { version, leaderboard, pickStats };
  }
  return { version, settings, teams, matches, participantCount: count, leaderboard, pickStats };
}

export function modesOf(matches: MatchRow[]): Record<string, Mode> {
  return Object.fromEntries(matches.map((m) => [m.key, m.mode]));
}

export { check };
