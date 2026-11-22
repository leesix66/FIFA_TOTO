// 토너먼트 대진 계산 — 서버/클라이언트 공용 순수 함수

export type Mode = "winner" | "score";
export type Status = "ready" | "open" | "closed";

export interface Team {
  id: string;
  name: string;
}

export interface MatchRow {
  key: string;
  mode: Mode;
  winnerTeamId: string | null;
  winnerScore: number | null;
  loserScore: number | null;
}

export interface PickEntry {
  w: string;
  ws?: number;
  ls?: number;
}
export type Picks = Record<string, PickEntry>;

export interface Settings {
  title: string;
  status: Status;
  revealed: boolean;
  thirdPlace: boolean;
  draw: (string | null)[];
  maxParticipants: number;
}

export interface MatchDef {
  key: string;
  round: number; // 1 = 첫 라운드, 3·4위전은 마지막 라운드와 같은 값
  index: number;
  third: boolean;
}

/** 슬롯 상태: 팀 id, 아직 미정(null), 영구히 비어있음(DEAD) */
export const DEAD = "__dead__";
type Side = string | null;

export interface ResolvedMatch extends MatchDef {
  a: Side; // 팀 id | null(미정) | DEAD
  b: Side;
  bye: boolean; // 한쪽만 존재 → 자동 진출 (예측/결과 없음)
  dead: boolean; // 양쪽 모두 없음
  winner: Side;
  loser: Side;
}

export const MAX_TEAMS = 16;

export function bracketSize(teamCount: number): number {
  let s = 2;
  while (s < teamCount) s *= 2;
  return Math.min(s, MAX_TEAMS);
}

export function roundCount(size: number): number {
  return Math.round(Math.log2(Math.max(2, size)));
}

export function roundName(round: number, totalRounds: number): string {
  const remaining = totalRounds - round; // 0 = 결승
  if (remaining === 0) return "결승";
  if (remaining === 1) return "4강";
  return `${2 ** (remaining + 1)}강`;
}

export function matchLabel(m: MatchDef, totalRounds: number): string {
  if (m.third) return "3·4위전";
  const name = roundName(m.round, totalRounds);
  if (name === "결승") return "결승";
  return `${name} ${m.index + 1}경기`;
}

export function matchDefs(size: number, thirdPlace: boolean): MatchDef[] {
  const R = roundCount(size);
  const defs: MatchDef[] = [];
  for (let r = 1; r <= R; r++) {
    const n = size / 2 ** r;
    for (let i = 0; i < n; i++) defs.push({ key: `${r}-${i}`, round: r, index: i, third: false });
  }
  if (thirdPlace && R >= 2) defs.push({ key: "3P", round: R, index: 1, third: true });
  return defs;
}

/**
 * 대진 해석. winnerOf(key, a, b) 는 해당 경기의 승자(a 또는 b)를 돌려준다.
 * 실제 결과(관리자 입력)나 참여자 예측 어느 쪽이든 같은 함수로 계산한다.
 */
export function resolveBracket(
  draw: (string | null)[],
  thirdPlace: boolean,
  winnerOf: (key: string, a: string, b: string) => string | null | undefined,
): ResolvedMatch[] {
  const size = draw.length >= 2 ? draw.length : 2;
  const defs = matchDefs(size, thirdPlace);
  const byKey = new Map<string, ResolvedMatch>();
  const out: ResolvedMatch[] = [];

  const sideFromFeeder = (key: string, take: "winner" | "loser"): Side => {
    const f = byKey.get(key);
    if (!f) return DEAD;
    if (f.dead) return DEAD;
    if (f.bye) return take === "winner" ? f.winner : DEAD;
    return f[take];
  };

  for (const d of defs) {
    let a: Side;
    let b: Side;
    if (d.third) {
      const R = d.round;
      a = sideFromFeeder(`${R - 1}-0`, "loser");
      b = sideFromFeeder(`${R - 1}-1`, "loser");
    } else if (d.round === 1) {
      a = draw[d.index * 2] ?? DEAD;
      b = draw[d.index * 2 + 1] ?? DEAD;
    } else {
      a = sideFromFeeder(`${d.round - 1}-${d.index * 2}`, "winner");
      b = sideFromFeeder(`${d.round - 1}-${d.index * 2 + 1}`, "winner");
    }
    const aDead = a === DEAD;
    const bDead = b === DEAD;
    const dead = aDead && bDead;
    const bye = !dead && (aDead || bDead);
    let winner: Side = null;
    let loser: Side = null;
    if (dead) {
      winner = DEAD;
      loser = DEAD;
    } else if (bye) {
      winner = aDead ? b : a; // 상대가 미정(null)이면 승자도 미정
      loser = DEAD;
    } else if (a && b) {
      const w = winnerOf(d.key, a, b);
      if (w === a || w === b) {
        winner = w;
        loser = w === a ? b : a;
      }
    }
    const m: ResolvedMatch = { ...d, a, b, bye, dead, winner, loser };
    byKey.set(d.key, m);
    out.push(m);
  }
  return out;
}

/** 예측/결과 입력이 가능한 실제 경기인가 (부전승·빈 경기 제외) */
export function isPlayable(m: ResolvedMatch): boolean {
  return !m.bye && !m.dead;
}

export function isTeam(s: Side): s is string {
  return !!s && s !== DEAD;
}

/** 실제 결과 기준 대진 */
export function resolveActual(settings: Pick<Settings, "draw" | "thirdPlace">, matches: MatchRow[]) {
  const map = new Map(matches.map((m) => [m.key, m]));
  return resolveBracket(settings.draw, settings.thirdPlace, (key) => map.get(key)?.winnerTeamId);
}

/** 참여자 예측 기준 대진 */
export function resolvePicks(settings: Pick<Settings, "draw" | "thirdPlace">, picks: Picks) {
  return resolveBracket(settings.draw, settings.thirdPlace, (key) => picks[key]?.w);
}


/** 상위 경기 선택이 바뀌어 더 이상 성립하지 않는 하위 예측을 제거 */
export function sanitizePicks(
  settings: Pick<Settings, "draw" | "thirdPlace">,
  modes: Record<string, Mode>,
  raw: Picks,
): Picks {
  const clean: Picks = {};
  resolveBracket(settings.draw, settings.thirdPlace, (key, a, b) => {
    const p = raw?.[key];
    if (!p || typeof p !== "object") return null;
    if (p.w !== a && p.w !== b) return null;
    const next: PickEntry = { w: p.w };
    if (modes[key] === "score") {
      const ws = Number(p.ws);
      const ls = Number(p.ls);
      if (Number.isInteger(ws) && Number.isInteger(ls) && ws >= 0 && ls >= 0 && ws <= 30 && ls <= 30 && ws >= ls) {
        next.ws = ws;
        next.ls = ls;
      }
    }
    clean[key] = next;
    return p.w;
  });
  return clean;
}

/** 빈 슬롯(null)을 고르게 퍼뜨리기 위한 비트 반전 순서 */
function bitReversal(n: number): number[] {
  const bits = Math.round(Math.log2(n));
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    let r = 0;
    for (let b = 0; b < bits; b++) if (i & (1 << b)) r |= 1 << (bits - 1 - b);
    out.push(r);
  }
  return out;
}

/** 팀 순서대로 대진 자동 배치 (부전승은 대진표 전체에 고르게 분산) */
export function autoDraw(teamIds: string[]): (string | null)[] {
  const size = bracketSize(teamIds.length);
  const matchCount = size / 2;
  const byes = Math.max(0, size - teamIds.length);
  const byeMatches = new Set(bitReversal(matchCount).slice(0, byes));
  const draw: (string | null)[] = [];
  let t = 0;
  for (let m = 0; m < matchCount; m++) {
    draw.push(teamIds[t++] ?? null);
    draw.push(byeMatches.has(m) ? null : (teamIds[t++] ?? null));
  }
  return draw;
}

/** 팀 추가/삭제 후 기존 대진을 최대한 유지하며 보정 */
export function adjustDraw(oldDraw: (string | null)[], teamIds: string[]): (string | null)[] {
  const size = bracketSize(teamIds.length);
  const set = new Set(teamIds);
  const kept = oldDraw.filter((id): id is string => !!id && set.has(id));
  const missing = teamIds.filter((id) => !kept.includes(id));
  if (oldDraw.length !== size) return autoDraw([...kept, ...missing]);
  const draw = oldDraw.map((id) => (id && set.has(id) ? id : null));
  for (const id of missing) {
    // 양쪽이 모두 빈 경기부터 채워 '빈 경기'를 막는다
    let slot = -1;
    for (let m = 0; m < size / 2 && slot < 0; m++) {
      if (draw[m * 2] === null && draw[m * 2 + 1] === null) slot = m * 2;
    }
    if (slot < 0) slot = draw.indexOf(null);
    if (slot >= 0) draw[slot] = id;
  }
  return draw;
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 대진 유효성 검사 — 오픈 전 확인용. 문제 목록을 돌려준다. */
export function validateDraw(draw: (string | null)[], teamIds: string[]): string[] {
  const problems: string[] = [];
  if (teamIds.length < 2) problems.push("팀을 2개 이상 등록하세요.");
  if (draw.length !== bracketSize(teamIds.length)) problems.push("대진 크기가 팀 수와 맞지 않습니다. 자동 배치를 눌러주세요.");
  const placed = draw.filter((x): x is string => !!x);
  if (new Set(placed).size !== placed.length) problems.push("같은 팀이 두 번 배치되어 있습니다.");
  const missing = teamIds.filter((id) => !placed.includes(id));
  if (missing.length) problems.push(`대진에 배치되지 않은 팀이 ${missing.length}개 있습니다.`);
  for (let m = 0; m < draw.length / 2; m++) {
    if (!draw[m * 2] && !draw[m * 2 + 1]) problems.push(`1라운드 ${m + 1}경기에 팀이 없습니다.`);
  }
  return problems;
}

export interface LeaderRow {
  id: string;
  dept: string;
  name: string;
  hits: number;
  exact: number;
  decided: number;
  picked: number;
  points: number;
  rate: number; // 0~1
  rank: number;
}

export function rankRows(rows: Omit<LeaderRow, "points" | "rate" | "rank">[]): LeaderRow[] {
  const withPts = rows.map((r) => ({
    ...r,
    points: r.hits + r.exact,
    rate: r.decided > 0 ? r.hits / r.decided : 0,
    rank: 0,
  }));
  withPts.sort(
    (x, y) =>
      y.points - x.points ||
      y.hits - x.hits ||
      x.dept.localeCompare(y.dept, "ko") ||
      x.name.localeCompare(y.name, "ko"),
  );
  let prev: { points: number; hits: number } | null = null;
  withPts.forEach((r, i) => {
    if (prev && prev.points === r.points && prev.hits === r.hits) r.rank = withPts[i - 1].rank;
    else r.rank = i + 1;
    prev = r;
  });
  return withPts;
}
