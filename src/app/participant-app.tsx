"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  isPlayable,
  resolveActual,
  resolvePicks,
  roundCount,
  sanitizePicks,
  type LeaderRow,
  type MatchRow,
  type Mode,
  type PickEntry,
  type Picks,
} from "@/lib/bracket";
import { api, ClientError, pct, storage, useLiveState, useStored } from "@/lib/client";
import type { Me, OtherPicks, PublicState } from "@/lib/types";
import { BracketLayout, PickCard, ResultCard, useTeamMap, type TeamMap } from "@/components/bracket-ui";
import { Hero } from "@/components/hero";
import { Leaderboard, RateBar } from "@/components/leaderboard";
import {
  Button,
  Card,
  CardHeader,
  cx,
  Empty,
  Field,
  Input,
  Modal,
  Notice,
  Providers,
  Spinner,
  Tabs,
  useConfirm,
  useToast,
} from "@/components/ui";

const TOKEN_KEY = "fifa-toto.token";
type Tab = "picks" | "rank" | "results";

export default function ParticipantApp() {
  return (
    <Providers>
      <App />
    </Providers>
  );
}

function App() {
  const { state, error, live } = useLiveState();
  const toast = useToast();
  const token = useStored(TOKEN_KEY);
  const [loaded, setLoaded] = useState<Me | null>(null);
  const [rawDraft, setDraft] = useState<Picks>({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<Tab | null>(null);
  const [viewing, setViewing] = useState<LeaderRow | null>(null);

  const setMe = setLoaded;
  // 토큰과 일치하는 참여자 정보만 사용 (로그아웃 시 자동으로 null)
  const me = token && loaded ? loaded : null;
  const [failedToken, setFailedToken] = useState<string | null>(null);
  const meLoading = !!token && !me && failedToken !== token;

  const logout = useCallback(() => {
    storage.set(TOKEN_KEY, null);
    setLoaded(null);
    setDraft({});
    setDirty(false);
  }, []);

  // 저장된 로그인 복원
  useEffect(() => {
    if (!token) return;
    let alive = true;
    api<Me>("/api/me", { token })
      .then((m) => {
        if (!alive) return;
        setLoaded(m);
        setDraft(m.picks);
      })
      .catch((e) => {
        if (!alive) return;
        setFailedToken(token);
        if (e instanceof ClientError && e.status === 401) logout();
      });
    return () => {
      alive = false;
    };
  }, [token, logout]);

  const modes = useMemo<Record<string, Mode>>(
    () => Object.fromEntries((state?.matches ?? []).map((m) => [m.key, m.mode])),
    [state?.matches],
  );

  // 대진/방식이 바뀌면 화면의 예측도 정리
  const settings = state?.settings;
  const draft = useMemo(() => (settings ? sanitizePicks(settings, modes, rawDraft) : rawDraft), [settings, modes, rawDraft]);

  // 저장 안 한 변경사항 경고
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const onEntered = async (t: string, created: boolean) => {
    const m = await api<Me>("/api/me", { token: t });
    setMe(m);
    storage.set(TOKEN_KEY, t);
    setDraft(m.picks);
    setDirty(false);
    setTab(null); // 진행 중이면 '내 예측', 마감 후면 '전체 순위'로
    toast(created ? `${m.name}님, 참여 등록이 완료되었습니다!` : `${m.name}님, 환영합니다!`);
  };

  const save = async () => {
    if (!token) return;
    setSaving(true);
    try {
      const m = await api<Me>("/api/me", { method: "PUT", body: { picks: draft }, token });
      setMe(m);
      setDraft(m.picks);
      setDirty(false);
      toast("예측이 저장되었습니다.");
    } catch (e) {
      toast(e instanceof Error ? e.message : "저장 실패", "error");
    } finally {
      setSaving(false);
    }
  };

  const teamMap = useTeamMap(state?.teams);

  if (!state) {
    return (
      <div className="min-h-dvh">
        <Hero title="FIFA 토토" live={false} />
        <div className="relative z-10 mx-auto -mt-12 max-w-6xl px-4 sm:px-6">
          <Card className="flex items-center justify-center gap-3 p-10 text-slate-500">
            {error ? (
              <span className="text-center text-sm text-rose-600">{error}</span>
            ) : (
              <>
                <Spinner className="size-5" /> 불러오는 중…
              </>
            )}
          </Card>
        </div>
      </div>
    );
  }

  const s = state.settings;
  const closed = s.status === "closed";
  const myRow = me && state.leaderboard ? (state.leaderboard.find((r) => r.id === me.id) ?? null) : null;
  const tabs: { value: Tab; label: string }[] = [
    ...(me ? [{ value: "picks" as Tab, label: "내 예측" }] : []),
    { value: "rank", label: "전체 순위" },
    { value: "results", label: "경기 결과" },
  ];
  const activeTab: Tab = tab && tabs.some((t) => t.value === tab) ? tab : me && !closed ? "picks" : closed ? "rank" : "results";

  return (
    <div className="min-h-dvh">
      <Hero
        title={s.title}
        status={s.status}
        revealed={s.revealed}
        live={live}
        sub={
          <span>
            참여자 <b className="tabular text-white">{state.participantCount.toLocaleString()}</b>명
          </span>
        }
      />
      <main className="relative z-10 mx-auto -mt-14 max-w-6xl space-y-4 px-4 pb-36 sm:space-y-5 sm:px-6">
        {meLoading ? (
          <Card className="flex items-center gap-3 p-6 text-sm text-slate-500">
            <Spinner className="size-4" /> 내 정보 확인 중…
          </Card>
        ) : me ? (
          <MySummary
            me={me}
            state={state}
            row={myRow}
            draft={draft}
            modes={modes}
            onLogout={async () => {
              logout();
              setTab(null);
            }}
          />
        ) : (
          <EntryCard status={s.status} onEntered={onEntered} />
        )}

        <Tabs value={activeTab} onChange={setTab} items={tabs} />

        {activeTab === "picks" && me && (
          <PicksPanel
            state={state}
            teams={teamMap}
            draft={draft}
            modes={modes}
            onChange={(key, entry) => {
              setDraft((d) => {
                const next = { ...d };
                if (entry) next[key] = entry;
                else delete next[key];
                return sanitizePicks(s, modes, next);
              });
              setDirty(true);
            }}
          />
        )}

        {activeTab === "rank" && (
          <Card className="overflow-hidden">
            <CardHeader
              title="전체 순위"
              desc={
                closed
                  ? "경기 결과가 입력될 때마다 실시간으로 순위가 바뀝니다."
                  : "참여가 마감되면 순위가 공개됩니다."
              }
            />
            {closed && state.leaderboard ? (
              <Leaderboard
                rows={state.leaderboard}
                meId={me?.id}
                selectable={s.revealed}
                onSelect={(r) => setViewing(r)}
              />
            ) : (
              <Empty
                icon="⏳"
                title={s.status === "open" ? "토토 참여가 진행 중입니다" : "토토 오픈 전입니다"}
                desc={`현재 ${state.participantCount.toLocaleString()}명이 참여했어요. 마감 후 경기 결과에 따라 순위가 집계됩니다.`}
              />
            )}
          </Card>
        )}

        {activeTab === "results" && <ResultsPanel state={state} teams={teamMap} />}

        <RulesCard />
      </main>

      {activeTab === "picks" && me && s.status === "open" && (
        <SaveBar state={state} draft={draft} modes={modes} dirty={dirty} saving={saving} onSave={save} />
      )}

      <OtherPicksModal row={viewing} onClose={() => setViewing(null)} state={state} teams={teamMap} />
    </div>
  );
}

// ── 진행도 계산 ───────────────────────────────────────
function useProgress(state: PublicState, draft: Picks, modes: Record<string, Mode>) {
  return useMemo(() => {
    const structure = resolveActual(state.settings, []);
    const playable = structure.filter(isPlayable);
    const done = playable.filter((m) => {
      const p = draft[m.key];
      if (!p) return false;
      return modes[m.key] !== "score" || (p.ws !== undefined && p.ls !== undefined);
    }).length;
    return { total: playable.length, done };
  }, [state.settings, draft, modes]);
}

// ── 상단 내 정보 카드 ─────────────────────────────────
function MySummary({
  me,
  state,
  row,
  draft,
  modes,
  onLogout,
}: {
  me: Me;
  state: PublicState;
  row: LeaderRow | null;
  draft: Picks;
  modes: Record<string, Mode>;
  onLogout: () => void;
}) {
  const progress = useProgress(state, draft, modes);
  const closed = state.settings.status === "closed";
  const total = state.leaderboard?.length ?? state.participantCount;

  return (
    <Card className="animate-fade-up overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-5 pt-5 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-linear-to-br from-pitch-500 to-teal-600 text-[17px] font-extrabold text-white shadow-sm">
            {me.name.slice(0, 1)}
          </span>
          <div className="min-w-0">
            <div className="truncate text-[17px] font-extrabold tracking-tight">{me.name}</div>
            <div className="truncate text-[13px] text-slate-500">{me.dept}</div>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={onLogout}>
          로그아웃
        </Button>
      </div>

      {closed && row ? (
        <div className="mt-4 grid grid-cols-2 gap-px bg-slate-100 sm:grid-cols-4">
          <Stat label="내 순위" value={`${row.rank}위`} sub={`${total.toLocaleString()}명 중`} big />
          <Stat label="승률" value={pct(row.rate)} sub={<RateBar rate={row.rate} className="mt-1.5 w-full" />} big />
          <Stat label="적중" value={`${row.hits} / ${row.decided}`} sub="결과 확정 경기 기준" />
          <Stat label="점수" value={`${row.points}점`} sub={row.exact ? `스코어 적중 +${row.exact}` : "적중 1점 · 스코어 +1"} />
        </div>
      ) : (
        <div className="mt-4 border-t border-slate-100 px-5 py-4 sm:px-6">
          <div className="flex items-baseline justify-between text-[13px]">
            <span className="font-semibold text-slate-600">예측 진행</span>
            <span className="tabular font-bold">
              {progress.done} / {progress.total}
            </span>
          </div>
          <RateBar rate={progress.total ? progress.done / progress.total : 0} className="mt-2 h-2" />
          <p className="mt-2.5 text-[12px] text-slate-500">
            {state.settings.status === "open"
              ? "마감 전까지 언제든지 수정할 수 있어요. 변경 후 꼭 저장을 눌러주세요."
              : state.settings.status === "ready"
                ? "관리자가 토토를 오픈하면 예측을 입력할 수 있어요."
                : "참여가 마감되었습니다."}
          </p>
        </div>
      )}
    </Card>
  );
}

function Stat({ label, value, sub, big }: { label: string; value: string; sub?: React.ReactNode; big?: boolean }) {
  return (
    <div className="bg-white px-5 py-4 sm:px-6">
      <div className="text-[12px] font-semibold text-slate-500">{label}</div>
      <div className={cx("tabular mt-1 font-extrabold tracking-tight text-ink", big ? "text-[28px] leading-8" : "text-[20px]")}>
        {value}
      </div>
      {sub && <div className="mt-1 text-[12px] text-slate-400">{sub}</div>}
    </div>
  );
}

// ── 입장 카드 ─────────────────────────────────────────
function EntryCard({
  status,
  onEntered,
}: {
  status: PublicState["settings"]["status"];
  onEntered: (token: string, created: boolean) => Promise<void>;
}) {
  const confirm = useConfirm();
  const toast = useToast();
  const [dept, setDept] = useState("");
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      type R = { token?: string; created?: boolean; needsConfirm?: boolean; dept?: string; name?: string };
      let r = await api<R>("/api/enter", { body: { dept, name, pin } });
      if (r.needsConfirm) {
        const ok = await confirm({
          title: "새로 참여하시겠어요?",
          message: (
            <div className="space-y-3">
              <p>아래 정보로 처음 등록합니다. 다시 들어올 때 같은 부서명·이름·비밀번호가 필요해요.</p>
              <div className="rounded-xl bg-slate-50 px-4 py-3 text-[14px]">
                <div>
                  <span className="text-slate-400">부서</span> <b className="ml-2 text-ink">{r.dept}</b>
                </div>
                <div className="mt-1">
                  <span className="text-slate-400">이름</span> <b className="ml-2 text-ink">{r.name}</b>
                </div>
              </div>
            </div>
          ),
          confirmText: "참여 등록",
        });
        if (!ok) return;
        r = await api<R>("/api/enter", { body: { dept, name, pin, confirm: true } });
      }
      if (r.token) await onEntered(r.token, !!r.created);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "입장 실패";
      setErr(msg);
      toast(msg, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="animate-fade-up overflow-hidden">
      <div className="grid lg:grid-cols-[1fr_1.1fr]">
        <div className="px-5 pt-5 sm:px-6 sm:pt-6 lg:border-r lg:border-slate-100 lg:pb-6">
          <h2 className="text-[19px] font-extrabold tracking-tight">
            {status === "open" ? "토토에 참여하세요 ⚽" : status === "ready" ? "곧 토토가 열립니다" : "참여가 마감되었습니다"}
          </h2>
          <p className="mt-2 text-[14px] leading-relaxed text-slate-500">
            {status === "open" ? (
              <>
                부서명·이름·비밀번호(숫자 4자리)를 입력하면 바로 참여할 수 있어요. 이미 참여했다면 <b className="text-slate-700">같은 정보로 다시 입장</b>해 예측을
                수정할 수 있습니다.
              </>
            ) : status === "ready" ? (
              "관리자가 토토를 오픈하면 참여할 수 있습니다. 대진표는 '경기 결과' 탭에서 미리 볼 수 있어요."
            ) : (
              "이미 참여하셨다면 같은 정보로 입장해 내 순위와 승률을 확인하세요."
            )}
          </p>
          <ul className="mt-4 hidden space-y-2 text-[13px] text-slate-500 lg:block">
            <li>✓ 경기마다 승리 팀(일부 경기는 스코어까지)을 예측</li>
            <li>✓ 마감 후 경기 결과에 따라 실시간 순위 반영</li>
            <li>✓ 공개 후 다른 참여자의 예측도 확인 가능</li>
          </ul>
        </div>
        <form onSubmit={submit} className="grid gap-3 px-5 py-5 sm:grid-cols-2 sm:px-6 sm:py-6">
          <Field label="부서명">
            <Input value={dept} onChange={(e) => setDept(e.target.value)} placeholder="예) 경영지원팀" maxLength={40} autoComplete="organization" />
          </Field>
          <Field label="이름">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="예) 홍길동" maxLength={30} autoComplete="name" />
          </Field>
          <div className="sm:col-span-2">
            <Field label="비밀번호 (숫자 4자리)" hint="다른 사람이 내 예측을 바꾸지 못하도록 사용됩니다.">
              <Input
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                inputMode="numeric"
                type="password"
                autoComplete="off"
                placeholder="••••"
                className="tracking-[0.4em]"
              />
            </Field>
          </div>
          {err && <p className="text-[13px] font-medium text-rose-600 sm:col-span-2">{err}</p>}
          <Button
            type="submit"
            variant="accent"
            size="lg"
            loading={busy}
            disabled={!dept.trim() || !name.trim() || pin.length !== 4}
            className="sm:col-span-2"
          >
            {status === "open" ? "참여하기 / 입장하기" : "입장하기"}
          </Button>
        </form>
      </div>
    </Card>
  );
}

// ── 내 예측 ───────────────────────────────────────────
function PicksPanel({
  state,
  teams,
  draft,
  modes,
  onChange,
}: {
  state: PublicState;
  teams: TeamMap;
  draft: Picks;
  modes: Record<string, Mode>;
  onChange: (key: string, entry: PickEntry | undefined) => void;
}) {
  const s = state.settings;
  const editable = s.status === "open";
  const resolved = useMemo(() => resolvePicks(s, draft), [s, draft]);
  const rows = useMemo(() => new Map<string, MatchRow>(state.matches.map((m) => [m.key, m])), [state.matches]);
  const size = Math.max(2, s.draw.length);

  if (s.draw.length < 2 || state.teams.length < 2) {
    return (
      <Card>
        <Empty icon="📋" title="대진표 준비 중" desc="관리자가 팀과 대진을 등록하면 이곳에서 예측할 수 있어요." />
      </Card>
    );
  }

  return (
    <Card className="p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[17px] font-bold tracking-tight">내 예측</h2>
          <p className="mt-1 text-[13px] text-slate-500">
            {editable
              ? "각 경기의 승리 팀을 눌러 선택하세요. 다음 라운드에는 내가 고른 팀이 올라갑니다."
              : s.status === "ready"
                ? "토토가 오픈되면 선택할 수 있어요."
                : "마감된 예측입니다. 결과가 입력되면 적중 여부가 표시됩니다."}
          </p>
        </div>
      </div>
      {s.status === "ready" && (
        <div className="mb-4">
          <Notice>아직 참여 기간이 아닙니다. 대진만 미리 확인할 수 있어요.</Notice>
        </div>
      )}
      <BracketLayout
        matches={resolved}
        size={size}
        render={(m) => (
          <PickCard
            m={m}
            total={roundCount(size)}
            teams={teams}
            mode={modes[m.key] ?? "winner"}
            pick={draft[m.key]}
            editable={editable}
            onChange={(e) => onChange(m.key, e)}
            actual={s.status === "closed" ? (rows.get(m.key) ?? null) : undefined}
          />
        )}
      />
    </Card>
  );
}

function SaveBar({
  state,
  draft,
  modes,
  dirty,
  saving,
  onSave,
}: {
  state: PublicState;
  draft: Picks;
  modes: Record<string, Mode>;
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
}) {
  const p = useProgress(state, draft, modes);
  const complete = p.total > 0 && p.done === p.total;
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6 sm:pb-5">
      <div className="mx-auto flex max-w-3xl animate-sheet-up items-center gap-3 rounded-2xl bg-ink/95 px-4 py-3 text-white shadow-lift ring-1 ring-white/10 backdrop-blur sm:px-5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[13px] font-semibold">
            <span className="tabular">
              {p.done}/{p.total} 선택
            </span>
            {complete ? (
              <span className="rounded-md bg-pitch-500/20 px-1.5 py-0.5 text-[11px] text-pitch-500">완료</span>
            ) : (
              <span className="text-[11px] text-slate-400">{p.total - p.done}경기 남음</span>
            )}
          </div>
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-pitch-500 transition-all" style={{ width: `${p.total ? (p.done / p.total) * 100 : 0}%` }} />
          </div>
          <div className="mt-1 truncate text-[11px] text-slate-400">{dirty ? "저장하지 않은 변경사항이 있어요" : "모든 변경사항이 저장됨"}</div>
        </div>
        <Button variant="accent" size="lg" onClick={onSave} loading={saving} disabled={!dirty} className="min-w-24">
          저장
        </Button>
      </div>
    </div>
  );
}

// ── 경기 결과 ─────────────────────────────────────────
function ResultsPanel({ state, teams }: { state: PublicState; teams: TeamMap }) {
  const s = state.settings;
  const resolved = useMemo(() => resolveActual(s, state.matches), [s, state.matches]);
  const rows = useMemo(() => new Map(state.matches.map((m) => [m.key, m])), [state.matches]);
  const size = Math.max(2, s.draw.length);
  const playable = resolved.filter(isPlayable);
  const done = playable.filter((m) => m.winner && m.winner !== "__dead__").length;

  return (
    <Card className="p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-[17px] font-bold tracking-tight">경기 결과</h2>
          <p className="mt-1 text-[13px] text-slate-500">
            {s.revealed ? "예측 공개 중 · 막대는 각 팀 승리를 예측한 참여자 비율입니다." : "관리자가 결과를 입력하면 바로 반영됩니다."}
          </p>
        </div>
        {playable.length > 0 && (
          <span className="tabular rounded-full bg-slate-100 px-3 py-1 text-[12px] font-semibold text-slate-600">
            {done} / {playable.length} 경기 종료
          </span>
        )}
      </div>
      {state.teams.length < 2 ? (
        <Empty icon="📋" title="대진표 준비 중" desc="관리자가 팀을 등록하면 대진표가 표시됩니다." />
      ) : (
        <BracketLayout
          matches={resolved}
          size={size}
          render={(m) => (
            <ResultCard
              m={m}
              total={roundCount(size)}
              teams={teams}
              row={rows.get(m.key)}
              stats={state.pickStats ? (state.pickStats[m.key] ?? {}) : null}
              statTotal={state.participantCount}
            />
          )}
        />
      )}
    </Card>
  );
}

// ── 다른 참여자 예측 보기 ─────────────────────────────
function OtherPicksModal({
  row,
  onClose,
  state,
  teams,
}: {
  row: LeaderRow | null;
  onClose: () => void;
  state: PublicState;
  teams: TeamMap;
}) {
  const [loadedData, setData] = useState<OtherPicks | null>(null);
  const [loadErr, setErr] = useState<{ id: string; msg: string } | null>(null);
  useEffect(() => {
    if (!row) return;
    api<OtherPicks>(`/api/participants/${row.id}`)
      .then(setData)
      .catch((e) => setErr({ id: row.id, msg: e instanceof Error ? e.message : "불러오기 실패" }));
  }, [row]);
  const data = row && loadedData?.id === row.id ? loadedData : null;
  const err = row && loadErr?.id === row.id ? loadErr.msg : null;
  const s = state.settings;
  const size = Math.max(2, s.draw.length);
  const resolved = useMemo(() => (data ? resolvePicks(s, data.picks) : []), [s, data]);
  const rows = useMemo(() => new Map(state.matches.map((m) => [m.key, m])), [state.matches]);

  return (
    <Modal
      open={!!row}
      onClose={onClose}
      wide
      title={
        row && (
          <div className="flex items-center gap-3">
            <span>{row.name}</span>
            <span className="text-[13px] font-medium text-slate-400">{row.dept}</span>
            <span className="rounded-lg bg-slate-100 px-2 py-0.5 text-[12px] font-bold text-slate-600">
              {row.rank}위 · {pct(row.rate)} · {row.points}점
            </span>
          </div>
        )
      }
    >
      {err ? (
        <p className="py-10 text-center text-sm text-rose-600">{err}</p>
      ) : !data ? (
        <div className="flex justify-center py-16">
          <Spinner className="size-6 text-slate-400" />
        </div>
      ) : (
        <div className="pt-2">
          <BracketLayout
            matches={resolved}
            size={size}
            render={(m) => (
              <PickCard
                m={m}
                total={roundCount(size)}
                teams={teams}
                mode={rows.get(m.key)?.mode ?? "winner"}
                pick={data.picks[m.key]}
                editable={false}
                actual={rows.get(m.key) ?? null}
              />
            )}
          />
        </div>
      )}
    </Modal>
  );
}

function RulesCard() {
  return (
    <details className="group rounded-2xl bg-white/70 px-5 py-4 text-[13px] text-slate-600 ring-1 ring-slate-900/[0.04] sm:px-6">
      <summary className="flex cursor-pointer list-none items-center justify-between font-semibold text-slate-700">
        점수 규칙 안내
        <span className="text-slate-400 transition group-open:rotate-180">⌄</span>
      </summary>
      <ul className="mt-3 space-y-1.5 leading-relaxed">
        <li>• 승리 팀을 맞히면 <b>1점</b>. 다음 라운드는 내가 예측한 팀으로 이어집니다.</li>
        <li>• <span className="font-semibold text-violet-600">스코어</span> 표시 경기는 정확한 스코어(승리팀 득점 : 패배팀 득점)까지 맞히면 <b>+1점</b>.</li>
        <li>• 승률 = 맞힌 경기 수 ÷ 결과가 확정된 경기 수. 예측하지 않은 경기는 실패로 계산됩니다.</li>
        <li>• 순위는 점수 → 적중 수 순서로 정하며, 같으면 공동 순위입니다.</li>
        <li>• 마감 후에는 수정할 수 없고, 관리자가 공개하면 모든 참여자의 예측을 볼 수 있습니다.</li>
      </ul>
    </details>
  );
}
