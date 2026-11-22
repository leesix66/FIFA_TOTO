"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  isTeam,
  matchLabel,
  roundCount,
  roundName,
  type MatchRow,
  type Mode,
  type PickEntry,
  type ResolvedMatch,
  type Team,
} from "@/lib/bracket";
import { cx, TeamAvatar } from "./ui";

export type TeamMap = Map<string, Team>;

export function useTeamMap(teams: Team[] | undefined): TeamMap {
  return useMemo(() => new Map((teams ?? []).map((t) => [t.id, t])), [teams]);
}

/** 경기 앞 라운드 출처 설명 ('16강 1경기 승자') */
export function feederLabel(m: ResolvedMatch, side: "a" | "b", total: number): string {
  if (m.third) return `4강 ${side === "a" ? 1 : 2}경기 패자`;
  if (m.round === 1) return "부전승";
  const idx = m.index * 2 + (side === "a" ? 0 : 1);
  const prev = roundName(m.round - 1, total);
  return prev === "결승" ? "승자" : `${prev} ${idx + 1}경기 승자`;
}

// ── 대진표 레이아웃: 모바일은 라운드 탭, PC 는 가로 대진표 ──────────
export function BracketLayout({
  matches,
  size,
  render,
  initialRound,
  emptyText,
}: {
  matches: ResolvedMatch[];
  size: number;
  render: (m: ResolvedMatch) => ReactNode;
  initialRound?: number;
  emptyText?: string;
}) {
  const total = roundCount(size);
  const rounds = useMemo(() => {
    const out: { round: number; label: string; items: ResolvedMatch[] }[] = [];
    for (let r = 1; r <= total; r++) {
      out.push({ round: r, label: roundName(r, total), items: matches.filter((m) => m.round === r && !m.third) });
    }
    return out;
  }, [matches, total]);
  const third = matches.find((m) => m.third) ?? null;
  const [picked, setActive] = useState(initialRound ?? 1);
  const active = picked > total ? 1 : picked;

  if (!matches.length) {
    return <p className="py-10 text-center text-sm text-slate-400">{emptyText ?? "대진이 아직 없습니다."}</p>;
  }

  return (
    <div>
      {/* 모바일 라운드 선택 */}
      <div className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 lg:hidden">
        {rounds.map((r) => (
          <button
            key={r.round}
            type="button"
            onClick={() => setActive(r.round)}
            className={cx(
              "h-9 shrink-0 rounded-full px-4 text-[13px] font-bold transition",
              active === r.round ? "bg-ink text-white shadow" : "bg-white text-slate-500 ring-1 ring-slate-200",
            )}
          >
            {r.label}
            {r.round === total && third ? " · 3·4위" : ""}
          </button>
        ))}
      </div>

      <div className="lg:-mx-2 lg:flex lg:overflow-x-auto lg:pb-2">
        {rounds.map((r) => (
          <div
            key={r.round}
            className={cx(
              "lg:flex lg:min-w-[232px] lg:flex-1 lg:flex-col lg:px-2",
              active === r.round ? "block" : "hidden lg:flex",
            )}
          >
            <div className="mb-3 hidden items-center gap-2 lg:flex">
              <span className="text-[13px] font-bold text-slate-800">{r.label}</span>
              <span className="text-xs text-slate-400">{r.items.length}경기</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:flex lg:flex-1 lg:flex-col lg:justify-around">
              {r.items.map((m) => (
                <div key={m.key} className="animate-fade-up">
                  {render(m)}
                </div>
              ))}
              {r.round === total && third && (
                <div className="animate-fade-up lg:mt-2">
                  <div className="mb-2 hidden text-[13px] font-bold text-slate-800 lg:block">3·4위전</div>
                  {render(third)}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── 공통 카드 껍데기 ───────────────────────────────────
function CardShell({
  label,
  mode,
  children,
  footer,
  highlight,
}: {
  label: string;
  mode?: Mode;
  children: ReactNode;
  footer?: ReactNode;
  highlight?: "ok" | "bad" | null;
}) {
  return (
    <div
      className={cx(
        "rounded-2xl bg-white p-2.5 shadow-card ring-1 transition",
        highlight === "ok" ? "ring-pitch-500/50" : highlight === "bad" ? "ring-rose-300/60" : "ring-slate-900/[0.06]",
      )}
    >
      <div className="mb-1.5 flex items-center justify-between px-1 text-[11px] font-semibold text-slate-400">
        <span>{label}</span>
        {mode === "score" && (
          <span className="rounded-md bg-violet-50 px-1.5 py-0.5 text-[10px] font-bold text-violet-600">스코어</span>
        )}
      </div>
      <div className="space-y-1.5">{children}</div>
      {footer && <div className="mt-2 px-1">{footer}</div>}
    </div>
  );
}

function Placeholder({ text }: { text: string }) {
  return (
    <div className="flex h-12 items-center gap-2.5 rounded-xl border border-dashed border-slate-200 px-2.5 text-[13px] text-slate-400">
      <span className="flex size-8 items-center justify-center rounded-lg bg-slate-100 text-xs">?</span>
      <span className="truncate">{text}</span>
    </div>
  );
}

export function ByeCard({ m, teams, total }: { m: ResolvedMatch; teams: TeamMap; total: number }) {
  const id = isTeam(m.a) ? m.a : isTeam(m.b) ? m.b : null;
  const t = id ? teams.get(id) : null;
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 px-3 py-2.5">
      <div className="mb-1 text-[11px] font-semibold text-slate-400">{matchLabel(m, total)} · 부전승</div>
      <div className="flex items-center gap-2 text-[13px] font-semibold text-slate-600">
        {t ? <TeamAvatar id={t.id} name={t.name} size="sm" /> : null}
        <span className="truncate">{t?.name ?? (m.dead ? "경기 없음" : "미정")}</span>
        {t && <span className="ml-auto text-[11px] font-medium text-slate-400">자동 진출</span>}
      </div>
    </div>
  );
}

// ── 점수 스텝퍼 ───────────────────────────────────────
function Stepper({ value, onChange, disabled }: { value: number | undefined; onChange: (v: number) => void; disabled?: boolean }) {
  const v = value ?? 0;
  const btn =
    "flex size-8 items-center justify-center rounded-lg text-lg font-bold leading-none text-slate-500 transition hover:bg-slate-100 active:bg-slate-200 disabled:opacity-30";
  return (
    <div className="flex items-center rounded-xl bg-white ring-1 ring-slate-200" onClick={(e) => e.stopPropagation()}>
      <button type="button" className={btn} disabled={disabled || v <= 0} onClick={() => onChange(v - 1)} aria-label="점수 감소">
        −
      </button>
      <span className="tabular w-6 text-center text-[15px] font-bold text-ink">{value ?? "–"}</span>
      <button type="button" className={btn} disabled={disabled || v >= 30} onClick={() => onChange(v + 1)} aria-label="점수 증가">
        +
      </button>
    </div>
  );
}

// ── 참여자 예측 카드 ──────────────────────────────────
export function PickCard({
  m,
  total,
  teams,
  mode,
  pick,
  editable,
  onChange,
  actual,
}: {
  m: ResolvedMatch;
  total: number;
  teams: TeamMap;
  mode: Mode;
  pick: PickEntry | undefined;
  editable: boolean;
  onChange?: (next: PickEntry | undefined) => void;
  /** 실제 결과 (있으면 적중 여부 표시) */
  actual?: MatchRow | null;
}) {
  if (m.bye || m.dead) return <ByeCard m={m} teams={teams} total={total} />;
  const label = matchLabel(m, total);
  const a = isTeam(m.a) ? m.a : null;
  const b = isTeam(m.b) ? m.b : null;
  const ready = !!(a && b);

  const scoreOf = (side: string): number | undefined => {
    if (!pick || mode !== "score" || pick.ws === undefined || pick.ls === undefined) return undefined;
    return pick.w === side ? pick.ws : pick.ls;
  };

  const choose = (id: string) => {
    if (!editable || !ready) return;
    if (pick?.w === id) return;
    if (mode === "score") {
      const ws = pick?.ws ?? 1;
      const ls = pick?.ls ?? 0;
      onChange?.({ w: id, ws, ls });
    } else onChange?.({ w: id });
  };

  const setScore = (side: string, value: number) => {
    if (!editable || !a || !b) return;
    let sa = scoreOf(a) ?? (side === a ? 0 : 0);
    let sb = scoreOf(b) ?? 0;
    if (side === a) sa = value;
    else sb = value;
    let w = pick?.w ?? (sa >= sb ? a : b);
    if (sa > sb) w = a;
    else if (sb > sa) w = b;
    onChange?.({ w, ws: Math.max(sa, sb), ls: Math.min(sa, sb) });
  };

  // 실제 결과 대비 적중 표시
  let footer: ReactNode = null;
  let highlight: "ok" | "bad" | null = null;
  if (actual?.winnerTeamId) {
    const hit = pick?.w === actual.winnerTeamId;
    const exact =
      hit && mode === "score" && actual.winnerScore !== null && pick?.ws === actual.winnerScore && pick?.ls === actual.loserScore;
    highlight = hit ? "ok" : "bad";
    const winName = teams.get(actual.winnerTeamId)?.name ?? "?";
    footer = (
      <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
        {hit ? (
          <span className="rounded-md bg-pitch-50 px-1.5 py-0.5 font-bold text-pitch-700">적중 +1</span>
        ) : (
          <span className="rounded-md bg-rose-50 px-1.5 py-0.5 font-bold text-rose-600">{pick ? "실패" : "미선택"}</span>
        )}
        {exact && <span className="rounded-md bg-violet-50 px-1.5 py-0.5 font-bold text-violet-600">스코어 +1</span>}
        <span className="truncate text-slate-500">
          결과: <b className="font-semibold text-slate-700">{winName}</b> 승
          {actual.winnerScore !== null ? ` (${actual.winnerScore}:${actual.loserScore})` : ""}
        </span>
      </div>
    );
  } else if (!editable && pick && actual !== undefined) {
    footer = <span className="text-[12px] text-slate-400">경기 전</span>;
  }

  const row = (side: "a" | "b") => {
    const id = side === "a" ? a : b;
    if (!id) {
      return (
        <Placeholder
          key={side}
          text={editable ? `${feederLabel(m, side, total)} 예측 필요` : feederLabel(m, side, total)}
        />
      );
    }
    const t = teams.get(id);
    const selected = pick?.w === id;
    const dim = !!pick && !selected;
    return (
      <div
        key={side}
        role={editable ? "button" : undefined}
        tabIndex={editable ? 0 : undefined}
        onClick={() => choose(id)}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), choose(id))}
        className={cx(
          "flex h-12 items-center gap-2.5 rounded-xl px-2.5 transition",
          editable && ready && "cursor-pointer",
          selected ? "bg-pitch-50 ring-2 ring-pitch-500" : "bg-slate-50 ring-1 ring-transparent",
          editable && !selected && "hover:bg-slate-100 hover:ring-slate-200",
        )}
      >
        <TeamAvatar id={id} name={t?.name ?? "?"} />
        <span
          className={cx(
            "min-w-0 flex-1 truncate text-[14px]",
            selected ? "font-bold text-ink" : dim ? "font-medium text-slate-400" : "font-semibold text-slate-700",
          )}
        >
          {t?.name ?? "알 수 없는 팀"}
        </span>
        {mode === "score" && pick && (editable ? (
          <Stepper value={scoreOf(id)} onChange={(v) => setScore(id, v)} />
        ) : (
          <span className="tabular w-6 text-center text-[15px] font-bold">{scoreOf(id) ?? "–"}</span>
        ))}
        {selected && (
          <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-pitch-600 text-white">
            <svg viewBox="0 0 20 20" fill="currentColor" className="size-3.5">
              <path d="M16.7 5.3a1 1 0 0 1 0 1.4l-8 8a1 1 0 0 1-1.4 0l-4-4a1 1 0 1 1 1.4-1.4L8 12.6l7.3-7.3a1 1 0 0 1 1.4 0Z" />
            </svg>
          </span>
        )}
      </div>
    );
  };

  return (
    <CardShell label={label} mode={mode} footer={footer} highlight={highlight}>
      {row("a")}
      {row("b")}
      {editable && mode === "score" && pick && scoreOf(a ?? "") === scoreOf(b ?? "") && (
        <p className="px-1 text-[11px] text-slate-400">동점이면 선택한 팀이 승부차기 승리로 처리됩니다.</p>
      )}
    </CardShell>
  );
}

// ── 실제 결과 카드 (공개용) ────────────────────────────
export function ResultCard({
  m,
  total,
  teams,
  row,
  stats,
  statTotal,
}: {
  m: ResolvedMatch;
  total: number;
  teams: TeamMap;
  row: MatchRow | undefined;
  stats?: Record<string, number> | null;
  statTotal?: number;
}) {
  if (m.bye || m.dead) return <ByeCard m={m} teams={teams} total={total} />;
  const mode = row?.mode ?? "winner";
  const decided = !!row?.winnerTeamId && (row.winnerTeamId === m.a || row.winnerTeamId === m.b);
  const scoreFor = (id: string | null) => {
    if (!decided || !id || row?.winnerScore === null || row?.winnerScore === undefined) return null;
    return id === row.winnerTeamId ? row.winnerScore : row.loserScore;
  };
  const side = (s: "a" | "b") => {
    const id = s === "a" ? m.a : m.b;
    if (!isTeam(id)) return <Placeholder key={s} text={feederLabel(m, s, total)} />;
    const t = teams.get(id);
    const win = decided && row?.winnerTeamId === id;
    const lose = decided && !win;
    const pickCnt = stats?.[id] ?? 0;
    const share = statTotal ? pickCnt / statTotal : 0;
    return (
      <div key={s} className={cx("relative overflow-hidden rounded-xl", win ? "bg-pitch-50 ring-1 ring-pitch-500/40" : "bg-slate-50")}>
        {stats && (
          <div
            className={cx("absolute inset-y-0 left-0 transition-all", win ? "bg-pitch-500/10" : "bg-slate-900/[0.04]")}
            style={{ width: `${Math.round(share * 100)}%` }}
          />
        )}
        <div className="relative flex h-12 items-center gap-2.5 px-2.5">
          <TeamAvatar id={id} name={t?.name ?? "?"} />
          <span className={cx("min-w-0 flex-1 truncate text-[14px]", win ? "font-bold" : lose ? "text-slate-400" : "font-semibold text-slate-700")}>
            {t?.name ?? "?"}
          </span>
          {stats && <span className="tabular text-[11px] font-semibold text-slate-400">{Math.round(share * 100)}%</span>}
          {scoreFor(id) !== null && (
            <span className={cx("tabular w-6 text-center text-[16px] font-extrabold", lose && "text-slate-400")}>{scoreFor(id)}</span>
          )}
          {win && <span className="rounded-md bg-pitch-600 px-1.5 py-0.5 text-[10px] font-bold text-white">승</span>}
        </div>
      </div>
    );
  };
  return (
    <CardShell
      label={matchLabel(m, total)}
      mode={mode}
      footer={
        stats ? (
          <span className="text-[11px] text-slate-400">막대 = 이 팀의 승리를 예측한 참여자 비율</span>
        ) : !decided && isTeam(m.a) && isTeam(m.b) ? (
          <span className="text-[11px] text-slate-400">경기 전</span>
        ) : null
      }
    >
      {side("a")}
      {side("b")}
    </CardShell>
  );
}

export { CardShell, Placeholder };
