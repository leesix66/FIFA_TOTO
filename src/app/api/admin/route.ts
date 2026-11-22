import {
  adjustDraw,
  autoDraw,
  bracketSize,
  isPlayable,
  isTeam,
  matchDefs,
  MAX_TEAMS,
  resolveActual,
  shuffle,
  validateDraw,
  type MatchRow,
  type Mode,
} from "@/lib/bracket";
import { checkAdminCode, hashPin, issueAdminToken, requireAdmin } from "@/lib/server/auth";
import {
  check,
  db,
  fail,
  getLeaderboard,
  getMatches,
  getSettings,
  getTeams,
  updateSettings,
} from "@/lib/server/db";
import { body, route, str } from "@/lib/server/handler";
import type { AdminParticipant } from "@/lib/types";

/** 참여자 목록 (관리자) */
export const GET = route(async (req) => {
  requireAdmin(req);
  const one = new URL(req.url).searchParams.get("id");
  if (one) {
    const row = check(
      await db().from("participants").select("id,dept,name,picks").eq("id", one).maybeSingle(),
    ) as { id: string; dept: string; name: string; picks: Record<string, unknown> } | null;
    if (!row) fail(404, "참여자를 찾을 수 없습니다.");
    return { ...row, picks: row.picks ?? {} };
  }
  const [board, rows] = await Promise.all([
    getLeaderboard(),
    db().from("participants").select("id,created_at,updated_at").then(check),
  ]);
  const times = new Map(
    ((rows ?? []) as { id: string; created_at: string; updated_at: string }[]).map((r) => [r.id, r]),
  );
  const list: AdminParticipant[] = board.map((r) => ({
    ...r,
    createdAt: times.get(r.id)?.created_at ?? "",
    updatedAt: times.get(r.id)?.updated_at ?? "",
  }));
  return { participants: list };
});

/** 대진 구조가 바뀌면 존재하지 않는 경기 행을 지우고 결과를 초기화 */
async function syncStructure(draw: (string | null)[], thirdPlace: boolean) {
  const keys = matchDefs(Math.max(2, draw.length), thirdPlace).map((d) => d.key);
  const existing = await getMatches();
  const stale = existing.filter((m) => !keys.includes(m.key)).map((m) => m.key);
  if (stale.length) check(await db().from("matches").delete().in("key", stale));
  if (existing.some((m) => m.winnerTeamId)) {
    check(
      await db()
        .from("matches")
        .update({ winner_team_id: null, winner_score: null, loser_score: null })
        .not("winner_team_id", "is", null),
    );
  }
}

/** 상위 경기 결과 변경으로 성립하지 않게 된 하위 결과를 정리 */
async function cascadeResults() {
  const [settings, matches] = await Promise.all([getSettings(), getMatches()]);
  let current: MatchRow[] = matches;
  for (let guard = 0; guard < 8; guard++) {
    const resolved = resolveActual(settings, current);
    const byKey = new Map(resolved.map((m) => [m.key, m]));
    const invalid = current.filter((m) => {
      if (!m.winnerTeamId) return false;
      const r = byKey.get(m.key);
      // 두 팀이 모두 확정되어 있고 승자가 그중 하나일 때만 유효
      return !r || !isPlayable(r) || !isTeam(r.a) || !isTeam(r.b) || (r.a !== m.winnerTeamId && r.b !== m.winnerTeamId);
    });
    if (!invalid.length) return;
    const keys = invalid.map((m) => m.key);
    check(
      await db()
        .from("matches")
        .update({ winner_team_id: null, winner_score: null, loser_score: null, updated_at: new Date().toISOString() })
        .in("key", keys),
    );
    current = current.map((m) =>
      keys.includes(m.key) ? { ...m, winnerTeamId: null, winnerScore: null, loserScore: null } : m,
    );
  }
}

async function requireReady() {
  const s = await getSettings();
  if (s.status !== "ready") fail(409, "대진·팀·예측 방식은 '준비' 상태에서만 수정할 수 있습니다.");
  return s;
}

function intOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > 99) fail(400, "점수는 0~99 사이 정수여야 합니다.");
  return n;
}

export const POST = route(async (req) => {
  const b = await body(req);
  const action = str(b.action, 40);

  if (action === "login") {
    if (!checkAdminCode(b.code)) fail(401, "관리자 코드가 올바르지 않습니다.");
    return { token: issueAdminToken() };
  }

  requireAdmin(req);

  switch (action) {
    case "verify":
      return { ok: true };

    case "setTitle": {
      const title = str(b.title, 60);
      if (!title) fail(400, "대회명을 입력하세요.");
      await updateSettings({ title });
      return;
    }

    case "setMaxParticipants": {
      const n = Number(b.value);
      if (!Number.isInteger(n) || n < 1 || n > 2000) fail(400, "최대 인원은 1~2000 사이로 입력하세요.");
      await updateSettings({ max_participants: n });
      return;
    }

    case "setStatus": {
      const status = str(b.status, 10);
      if (!["ready", "open", "closed"].includes(status)) fail(400, "잘못된 상태입니다.");
      if (status === "open") {
        const [s, teams] = await Promise.all([getSettings(), getTeams()]);
        const problems = validateDraw(
          s.draw,
          teams.map((t) => t.id),
        );
        if (problems.length) fail(400, `오픈할 수 없습니다: ${problems[0]}`);
      }
      await updateSettings({
        status: status as "ready" | "open" | "closed",
        ...(status !== "closed" ? { revealed: false } : {}),
      });
      return;
    }

    case "setRevealed": {
      const s = await getSettings();
      if (b.value === true && s.status !== "closed") fail(409, "참여를 마감한 뒤에 공개할 수 있습니다.");
      await updateSettings({ revealed: b.value === true });
      return;
    }

    case "addTeam": {
      const s = await requireReady();
      const name = str(b.name, 40);
      if (!name) fail(400, "팀명을 입력하세요.");
      const teams = await getTeams();
      if (teams.length >= MAX_TEAMS) fail(400, `팀은 최대 ${MAX_TEAMS}개까지 등록할 수 있습니다.`);
      if (teams.some((t) => t.name === name)) fail(400, "같은 이름의 팀이 이미 있습니다.");
      const ins = check(await db().from("teams").insert({ name }).select("id").single()) as { id: string };
      const draw = adjustDraw(s.draw, [...teams.map((t) => t.id), ins.id]);
      await syncStructure(draw, s.thirdPlace);
      await updateSettings({ draw });
      return;
    }

    case "renameTeam": {
      const id = str(b.id, 64);
      const name = str(b.name, 40);
      if (!name) fail(400, "팀명을 입력하세요.");
      const teams = await getTeams();
      if (teams.some((t) => t.name === name && t.id !== id)) fail(400, "같은 이름의 팀이 이미 있습니다.");
      check(await db().from("teams").update({ name }).eq("id", id));
      return;
    }

    case "deleteTeam": {
      const s = await requireReady();
      const id = str(b.id, 64);
      check(await db().from("teams").delete().eq("id", id));
      const teams = await getTeams();
      const draw = adjustDraw(
        s.draw,
        teams.map((t) => t.id),
      );
      await syncStructure(draw, s.thirdPlace);
      await updateSettings({ draw });
      return;
    }

    case "setDraw": {
      const s = await requireReady();
      const teams = await getTeams();
      const ids = new Set(teams.map((t) => t.id));
      const draw = Array.isArray(b.draw) ? (b.draw as unknown[]).map((x) => (typeof x === "string" ? x : null)) : [];
      if (draw.length !== bracketSize(teams.length)) fail(400, "대진 크기가 올바르지 않습니다.");
      const placed = draw.filter((x): x is string => !!x);
      if (placed.some((x) => !ids.has(x)) || new Set(placed).size !== placed.length) {
        fail(400, "대진에 잘못된 팀이 있습니다.");
      }
      await syncStructure(draw, s.thirdPlace);
      await updateSettings({ draw });
      return;
    }

    case "autoDraw": {
      const s = await requireReady();
      const teams = await getTeams();
      const ids = teams.map((t) => t.id);
      const draw = autoDraw(b.random === true ? shuffle(ids) : ids);
      await syncStructure(draw, s.thirdPlace);
      await updateSettings({ draw });
      return;
    }

    case "setThirdPlace": {
      const s = await requireReady();
      await syncStructure(s.draw, b.value === true);
      await updateSettings({ third_place: b.value === true });
      return;
    }

    case "setModes": {
      const s = await requireReady();
      const valid = new Set(matchDefs(Math.max(2, s.draw.length), s.thirdPlace).map((d) => d.key));
      const modes = (b.modes ?? {}) as Record<string, unknown>;
      const rows = Object.entries(modes)
        .filter(([k, v]) => valid.has(k) && (v === "winner" || v === "score"))
        .map(([key, mode]) => ({ key, mode: mode as Mode, updated_at: new Date().toISOString() }));
      if (rows.length) check(await db().from("matches").upsert(rows, { onConflict: "key" }));
      return;
    }

    case "setResult": {
      const s = await getSettings();
      if (s.status !== "closed") fail(409, "참여를 마감한 뒤에 경기 결과를 입력할 수 있습니다.");
      const key = str(b.key, 10);
      const matches = await getMatches();
      const m = resolveActual(s, matches).find((x) => x.key === key);
      if (!m || !isPlayable(m) || !isTeam(m.a) || !isTeam(m.b)) fail(400, "아직 대진이 확정되지 않은 경기입니다.");
      const winner = str(b.winnerTeamId, 64);
      if (winner !== m.a && winner !== m.b) fail(400, "승리 팀을 선택하세요.");
      const sa = intOrNull(b.scoreA);
      const sb = intOrNull(b.scoreB);
      const mode = matches.find((x) => x.key === key)?.mode ?? "winner";
      if ((sa === null) !== (sb === null)) fail(400, "두 팀의 점수를 모두 입력하세요.");
      if (mode === "score" && sa === null) fail(400, "스코어 예측 경기는 점수를 입력해야 합니다.");
      let ws: number | null = null;
      let ls: number | null = null;
      if (sa !== null && sb !== null) {
        const winnerIsA = winner === m.a;
        ws = winnerIsA ? sa : sb;
        ls = winnerIsA ? sb : sa;
        if (ws < ls) fail(400, "점수가 낮은 팀을 승리 팀으로 선택할 수 없습니다.");
      }
      check(
        await db()
          .from("matches")
          .upsert(
            { key, mode, winner_team_id: winner, winner_score: ws, loser_score: ls, updated_at: new Date().toISOString() },
            { onConflict: "key" },
          ),
      );
      await cascadeResults();
      return;
    }

    case "clearResult": {
      const key = str(b.key, 10);
      check(
        await db()
          .from("matches")
          .update({ winner_team_id: null, winner_score: null, loser_score: null, updated_at: new Date().toISOString() })
          .eq("key", key),
      );
      await cascadeResults();
      return;
    }

    case "deleteParticipant": {
      check(await db().from("participants").delete().eq("id", str(b.id, 64)));
      return;
    }

    case "resetPin": {
      const pin = str(b.pin, 4);
      if (!/^\d{4}$/.test(pin)) fail(400, "비밀번호는 숫자 4자리입니다.");
      check(
        await db()
          .from("participants")
          .update({ pin_hash: hashPin(pin), failed_logins: 0, locked_until: null })
          .eq("id", str(b.id, 64)),
      );
      return;
    }

    case "deleteAllParticipants": {
      if (b.confirm !== "삭제") fail(400, "확인 문구가 일치하지 않습니다.");
      check(await db().from("participants").delete().not("id", "is", null));
      return;
    }

    case "clearAllResults": {
      if (b.confirm !== "초기화") fail(400, "확인 문구가 일치하지 않습니다.");
      check(
        await db()
          .from("matches")
          .update({ winner_team_id: null, winner_score: null, loser_score: null, updated_at: new Date().toISOString() })
          .not("key", "is", null),
      );
      return;
    }

    default:
      fail(400, "알 수 없는 요청입니다.");
  }
});
