"use client";

import { useMemo, useState } from "react";
import { isPlayable, resolveActual, roundCount, winnerGroups, type LeaderRow, type WinnerGroups } from "@/lib/bracket";
import type { PublicState } from "@/lib/types";
import { Card, cx, useToast } from "./ui";

/** 공개 상태로부터 당첨자 그룹 + 우승팀 이름 계산 */
export function useWinnerGroups(state: PublicState): (WinnerGroups & { championName: string | null }) | null {
  return useMemo(() => {
    if (!state.leaderboard) return null;
    const s = state.settings;
    const total = resolveActual(s, []).filter(isPlayable).length;
    const g = winnerGroups(state.leaderboard, total);
    const finalKey = `${roundCount(Math.max(2, s.draw.length))}-0`;
    const champId = state.matches.find((m) => m.key === finalKey)?.winnerTeamId ?? null;
    const championName = champId ? (state.teams.find((t) => t.id === champId)?.name ?? null) : null;
    return { ...g, championName };
  }, [state]);
}

const LIMIT = 40;

function Group({
  icon,
  title,
  desc,
  rows,
  meId,
  marked,
  admin,
  tone,
}: {
  icon: string;
  title: string;
  desc: string;
  rows: LeaderRow[];
  meId?: string | null;
  marked?: Set<string>;
  admin?: boolean;
  tone: "violet" | "pitch" | "amber";
}) {
  const toast = useToast();
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, LIMIT);
  const copy = async () => {
    const text = rows.map((r) => `${r.dept}\t${r.name}`).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      toast(`${rows.length}명 명단을 복사했습니다`);
    } catch {
      toast("복사하지 못했습니다", "error");
    }
  };
  return (
    <div className="flex min-w-0 flex-col rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-900/[0.04]">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[14px] font-bold">
            <span>{icon}</span>
            {title}
          </div>
          <div className="mt-0.5 text-[12px] text-slate-500">{desc}</div>
        </div>
        <span
          className={cx(
            "tabular shrink-0 rounded-full px-2.5 py-1 text-[13px] font-extrabold",
            tone === "violet" && "bg-violet-100 text-violet-700",
            tone === "pitch" && "bg-pitch-100 text-pitch-700",
            tone === "amber" && "bg-amber-100 text-amber-700",
          )}
        >
          {rows.length}명
        </span>
      </div>
      {rows.length ? (
        <>
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {shown.map((r) => (
              <li
                key={r.id}
                className={cx(
                  "inline-flex max-w-full items-center gap-1 truncate rounded-lg px-2 py-1 text-[12px]",
                  r.id === meId ? "bg-pitch-600 font-bold text-white" : "bg-white text-slate-700 ring-1 ring-slate-200",
                )}
              >
                {marked?.has(r.id) && <span title="점수까지 완벽 적중">🎯</span>}
                <b className="font-semibold">{r.name}</b>
                <span className={r.id === meId ? "text-white/80" : "text-slate-400"}>{r.dept}</span>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex items-center gap-3">
            {rows.length > LIMIT && (
              <button type="button" onClick={() => setAll((v) => !v)} className="text-[12px] font-semibold text-slate-500 hover:text-slate-800">
                {all ? "접기" : `+${rows.length - LIMIT}명 더 보기`}
              </button>
            )}
            {admin && (
              <button type="button" onClick={copy} className="text-[12px] font-semibold text-pitch-700 hover:underline">
                명단 복사
              </button>
            )}
          </div>
        </>
      ) : (
        <p className="mt-3 text-[13px] text-slate-400">해당자 없음</p>
      )}
    </div>
  );
}

/** 당첨자 3종: 점수+승자 완벽 / 승자 전부 / 우승팀 */
export function WinnersPanel({ state, meId, admin }: { state: PublicState; meId?: string | null; admin?: boolean }) {
  const g = useWinnerGroups(state);
  const perfectIds = useMemo(() => new Set(g?.perfect.map((r) => r.id)), [g]);
  if (!g) return null;
  const total = resolveActual(state.settings, []).filter(isPlayable).length;

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5 sm:px-6">
        <div>
          <h2 className="text-[17px] font-bold tracking-tight">당첨자</h2>
          <p className="mt-1 text-[13px] text-slate-500">
            {g.decided === 0
              ? "경기 결과가 입력되면 조건별 해당자가 자동으로 가려집니다."
              : g.final
                ? "모든 경기가 끝났습니다. 최종 결과입니다."
                : `현재 ${g.decided}/${total}경기 결과 기준입니다. 남은 경기 결과에 따라 바뀔 수 있어요.`}
          </p>
        </div>
        <span
          className={cx(
            "rounded-full px-3 py-1 text-[12px] font-bold",
            g.final ? "bg-ink text-white" : "bg-amber-50 text-amber-700",
          )}
        >
          {g.final ? "최종 확정" : `진행 중 ${g.decided}/${total}`}
        </span>
      </div>
      <div className="grid gap-3 p-4 sm:p-6 lg:grid-cols-3">
        <Group
          icon="🎯"
          title="점수 + 승자 모두 적중"
          desc={g.decidedScore ? `결과 나온 경기의 승자와 정확한 점수를 모두 맞힘` : "결과 나온 경기 승자 적중 (점수 경기 결과 대기)"}
          rows={g.perfect}
          meId={meId}
          admin={admin}
          tone="violet"
        />
        <Group
          icon="✅"
          title="승자 모두 적중"
          desc="점수와 관계없이 모든 경기 승자를 맞힘 (🎯 완벽 적중자 포함)"
          rows={g.allWinners}
          meId={meId}
          marked={perfectIds}
          admin={admin}
          tone="pitch"
        />
        <Group
          icon="🏆"
          title="우승팀 적중"
          desc={g.championName ? `우승: ${g.championName}` : "결승 결과가 나오면 표시됩니다"}
          rows={g.champion}
          meId={meId}
          admin={admin}
          tone="amber"
        />
      </div>
    </Card>
  );
}

/** 내 정보 카드에 붙는 당첨 배지 */
export function MyWinnerBadges({ state, meId }: { state: PublicState; meId: string }) {
  const g = useWinnerGroups(state);
  if (!g || g.decided === 0) return null;
  const badges = [
    g.perfect.some((r) => r.id === meId) && "🎯 점수+승자 모두 적중",
    g.allWinners.some((r) => r.id === meId) && !g.perfect.some((r) => r.id === meId) && "✅ 승자 모두 적중",
    g.champion.some((r) => r.id === meId) && "🏆 우승팀 적중",
  ].filter(Boolean) as string[];
  if (!badges.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5 border-t border-slate-100 px-5 py-3 sm:px-6">
      {badges.map((b) => (
        <span key={b} className="rounded-full bg-amber-50 px-2.5 py-1 text-[12px] font-bold text-amber-800 ring-1 ring-amber-200">
          {b}
        </span>
      ))}
      {!g.final && <span className="self-center text-[11px] text-slate-400">· 현재까지 기준</span>}
    </div>
  );
}
