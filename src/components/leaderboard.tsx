"use client";

import { useMemo, useState } from "react";
import type { LeaderRow } from "@/lib/bracket";
import { pct } from "@/lib/client";
import { cx, Empty, Input } from "./ui";

const MEDAL = ["🥇", "🥈", "🥉"];

function RankBadge({ rank }: { rank: number }) {
  if (rank <= 3) return <span className="flex size-9 items-center justify-center text-2xl">{MEDAL[rank - 1]}</span>;
  return (
    <span className="tabular flex size-9 items-center justify-center rounded-xl bg-slate-100 text-[13px] font-bold text-slate-600">
      {rank}
    </span>
  );
}

export function RateBar({ rate, className }: { rate: number; className?: string }) {
  return (
    <div className={cx("h-1.5 overflow-hidden rounded-full bg-slate-100", className)}>
      <div className="h-full rounded-full bg-linear-to-r from-pitch-500 to-teal-400 transition-all duration-700" style={{ width: `${Math.round(rate * 100)}%` }} />
    </div>
  );
}

export function Leaderboard({
  rows,
  meId,
  onSelect,
  selectable,
}: {
  rows: LeaderRow[];
  meId?: string | null;
  onSelect?: (r: LeaderRow) => void;
  selectable?: boolean;
}) {
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(100);
  const filtered = useMemo(() => {
    const s = q.replace(/\s+/g, "").toLowerCase();
    if (!s) return rows;
    return rows.filter((r) => `${r.dept}${r.name}`.replace(/\s+/g, "").toLowerCase().includes(s));
  }, [rows, q]);
  const decided = rows[0]?.decided ?? 0;

  if (!rows.length) return <Empty icon="🏆" title="아직 참여자가 없습니다" />;

  return (
    <div>
      <div className="flex flex-col gap-3 px-4 pt-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p className="text-[13px] text-slate-500">
          총 <b className="text-slate-800">{rows.length}</b>명 · 결과 확정 <b className="text-slate-800">{decided}</b>경기
          {selectable && <span className="ml-1 text-pitch-600">· 이름을 누르면 예측을 볼 수 있어요</span>}
        </p>
        <div className="sm:w-64">
          <Input
            placeholder="부서·이름 검색"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setLimit(100);
            }}
            className="h-10 text-sm"
          />
        </div>
      </div>

      <div className="mt-3 hidden grid-cols-[56px_1fr_120px_160px_72px] items-center gap-3 border-y border-slate-100 bg-slate-50/70 px-6 py-2 text-[11px] font-semibold tracking-wide text-slate-400 md:grid">
        <span>순위</span>
        <span>참여자</span>
        <span className="text-right">적중</span>
        <span>승률</span>
        <span className="text-right">점수</span>
      </div>

      <ul className="mt-2 divide-y divide-slate-100 md:mt-0">
        {filtered.slice(0, limit).map((r) => {
          const me = r.id === meId;
          const Row = selectable ? "button" : "div";
          return (
            <li key={r.id}>
              <Row
                type={selectable ? "button" : undefined}
                onClick={selectable ? () => onSelect?.(r) : undefined}
                className={cx(
                  "grid w-full grid-cols-[44px_1fr_auto] items-center gap-3 px-4 py-3 text-left transition md:grid-cols-[56px_1fr_120px_160px_72px] md:px-6",
                  me && "bg-pitch-50/70",
                  selectable && "hover:bg-slate-50 active:bg-slate-100",
                )}
              >
                <RankBadge rank={r.rank} />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-[15px] font-bold text-ink">{r.name}</span>
                    {me && <span className="rounded-md bg-pitch-600 px-1.5 py-0.5 text-[10px] font-bold text-white">나</span>}
                  </div>
                  <div className="truncate text-[12px] text-slate-500">{r.dept}</div>
                  <div className="mt-1.5 flex items-center gap-2 md:hidden">
                    <RateBar rate={r.rate} className="w-24" />
                    <span className="tabular text-[12px] font-semibold text-slate-600">
                      {pct(r.rate)} · {r.hits}/{r.decided}
                    </span>
                  </div>
                </div>
                <div className="tabular hidden text-right text-[14px] font-semibold text-slate-700 md:block">
                  {r.hits}
                  <span className="text-slate-400">/{r.decided}</span>
                  {r.exact > 0 && <span className="ml-1 text-[11px] font-bold text-violet-600">+{r.exact}</span>}
                </div>
                <div className="hidden items-center gap-2 md:flex">
                  <RateBar rate={r.rate} className="flex-1" />
                  <span className="tabular w-12 text-right text-[13px] font-semibold text-slate-600">{pct(r.rate)}</span>
                </div>
                <div className="text-right">
                  <span className="tabular text-[18px] font-extrabold text-ink">{r.points}</span>
                  <span className="ml-0.5 text-[11px] font-semibold text-slate-400">점</span>
                </div>
              </Row>
            </li>
          );
        })}
      </ul>
      {filtered.length > limit && (
        <div className="p-4 text-center">
          <button
            type="button"
            onClick={() => setLimit((l) => l + 100)}
            className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
          >
            더 보기 ({filtered.length - limit}명 남음)
          </button>
        </div>
      )}
      {!filtered.length && <p className="py-10 text-center text-sm text-slate-400">검색 결과가 없습니다.</p>}
    </div>
  );
}
