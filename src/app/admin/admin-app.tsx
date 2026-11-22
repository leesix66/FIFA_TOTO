"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  bracketSize,
  isPlayable,
  isTeam,
  matchLabel,
  MAX_TEAMS,
  resolveActual,
  resolvePicks,
  roundCount,
  roundName,
  validateDraw,
  type MatchRow,
  type Mode,
  type ResolvedMatch,
  type Status,
} from "@/lib/bracket";
import { api, ClientError, pct, storage, useLiveState, useStored } from "@/lib/client";
import type { AdminParticipant, OtherPicks, PublicState } from "@/lib/types";
import {
  BracketLayout,
  ByeCard,
  CardShell,
  feederLabel,
  PickCard,
  Placeholder,
  useTeamMap,
  type TeamMap,
} from "@/components/bracket-ui";
import { Hero } from "@/components/hero";
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
  Segmented,
  Spinner,
  Tabs,
  TeamAvatar,
  Toggle,
  useConfirm,
  useToast,
} from "@/components/ui";

const ADMIN_KEY = "fifa-toto.admin";
type Tab = "ops" | "teams" | "results" | "people";

export default function AdminApp() {
  return (
    <Providers>
      <Gate />
    </Providers>
  );
}

// ── 관리자 코드 확인 ───────────────────────────────────
function Gate() {
  const stored = useStored(ADMIN_KEY);
  const [verified, setVerified] = useState<string | null>(null);

  useEffect(() => {
    if (!stored || stored === verified) return;
    api("/api/admin", { body: { action: "verify" }, token: stored })
      .then(() => setVerified(stored))
      .catch(() => storage.set(ADMIN_KEY, null));
  }, [stored, verified]);

  const logout = useCallback(() => storage.set(ADMIN_KEY, null), []);
  const token = stored && stored === verified ? stored : null;

  if (stored && !token) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-slate-400">
        <Spinner className="size-6" />
      </div>
    );
  }
  if (!token)
    return (
      <Login
        onLogin={(t) => {
          setVerified(t);
          storage.set(ADMIN_KEY, t);
        }}
      />
    );
  return <Admin token={token} onLogout={logout} />;
}

function Login({ onLogin }: { onLogin: (t: string) => void }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="hero-pitch relative flex min-h-dvh items-center justify-center px-4">
      <form
        className="relative z-10 w-full max-w-sm animate-sheet-up rounded-3xl bg-white p-6 shadow-2xl sm:p-8"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setErr(null);
          try {
            const r = await api<{ token: string }>("/api/admin", { body: { action: "login", code } });
            onLogin(r.token);
          } catch (e) {
            setErr(e instanceof Error ? e.message : "로그인 실패");
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="mb-6 flex size-12 items-center justify-center rounded-2xl bg-ink text-2xl text-white">🔐</div>
        <h1 className="text-xl font-extrabold tracking-tight">관리자 페이지</h1>
        <p className="mt-1.5 text-sm text-slate-500">관리자 코드를 입력하세요.</p>
        <div className="mt-6">
          <Input
            type="password"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="관리자 코드"
            autoFocus
            autoComplete="current-password"
          />
        </div>
        {err && <p className="mt-2 text-[13px] font-medium text-rose-600">{err}</p>}
        <Button type="submit" size="lg" className="mt-4 w-full" loading={busy} disabled={!code}>
          입장
        </Button>
        <Link href="/" className="mt-4 block text-center text-[13px] text-slate-400 hover:text-slate-600">
          ← 참여자 페이지로
        </Link>
      </form>
    </div>
  );
}

// ── 관리자 본문 ───────────────────────────────────────
function Admin({ token, onLogout }: { token: string; onLogout: () => void }) {
  const { state, error, live, refresh } = useLiveState();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("ops");

  const act = useCallback(
    async (action: string, payload: Record<string, unknown> = {}, okMsg?: string) => {
      try {
        await api("/api/admin", { body: { action, ...payload }, token });
        if (okMsg) toast(okMsg);
        await refresh(true);
        return true;
      } catch (e) {
        if (e instanceof ClientError && e.status === 401) onLogout();
        toast(e instanceof Error ? e.message : "요청 실패", "error");
        await refresh(true);
        return false;
      }
    },
    [token, toast, refresh, onLogout],
  );

  const teams = useTeamMap(state?.teams);

  if (!state) {
    return (
      <div className="flex min-h-dvh items-center justify-center p-6 text-center text-slate-500">
        {error ? <p className="text-sm text-rose-600">{error}</p> : <Spinner className="size-6" />}
      </div>
    );
  }
  const s = state.settings;

  return (
    <div className="min-h-dvh">
      <Hero
        title={s.title}
        status={s.status}
        revealed={s.revealed}
        live={live}
        badge="관리자"
        sub={
          <span>
            참여자 <b className="tabular text-white">{state.participantCount}</b>/{s.maxParticipants}명 · 팀 {state.teams.length}/{MAX_TEAMS}
          </span>
        }
        right={
          <div className="flex items-center gap-1">
            <a href="/" target="_blank" className="rounded-lg px-2.5 py-1.5 text-[13px] font-semibold text-slate-300 hover:bg-white/10">
              참여자 화면 ↗
            </a>
            <button onClick={onLogout} className="rounded-lg px-2.5 py-1.5 text-[13px] font-semibold text-slate-300 hover:bg-white/10">
              로그아웃
            </button>
          </div>
        }
      />
      <main className="relative z-10 mx-auto -mt-14 max-w-6xl space-y-4 px-4 pb-24 sm:space-y-5 sm:px-6">
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { value: "ops", label: "운영" },
            { value: "teams", label: "팀 · 대진" },
            { value: "results", label: "결과 입력" },
            { value: "people", label: "참여자" },
          ]}
        />
        {tab === "ops" && <OpsPanel state={state} act={act} goTo={setTab} />}
        {tab === "teams" && <TeamsPanel state={state} teams={teams} act={act} />}
        {tab === "results" && <ResultsAdminPanel state={state} teams={teams} act={act} />}
        {tab === "people" && <PeoplePanel state={state} teams={teams} token={token} act={act} />}
      </main>
    </div>
  );
}

type Act = (action: string, payload?: Record<string, unknown>, okMsg?: string) => Promise<boolean>;

// ── 운영 ──────────────────────────────────────────────
const STEPS: { key: string; label: string; desc: string }[] = [
  { key: "ready", label: "준비", desc: "팀·대진·예측 방식 설정" },
  { key: "open", label: "참여 오픈", desc: "참여자 등록·예측 입력" },
  { key: "closed", label: "참여 마감", desc: "입력 잠금 · 결과 입력" },
  { key: "revealed", label: "예측 공개", desc: "모든 예측 열람 가능" },
];

function OpsPanel({ state, act, goTo }: { state: PublicState; act: Act; goTo: (t: Tab) => void }) {
  const confirm = useConfirm();
  const s = state.settings;
  const [titleDraft, setTitle] = useState<string | null>(null);
  const [maxDraft, setMax] = useState<string | null>(null);
  const title = titleDraft ?? s.title;
  const max = maxDraft ?? String(s.maxParticipants);
  const [busy, setBusy] = useState<string | null>(null);

  const stepIdx = s.status === "ready" ? 0 : s.status === "open" ? 1 : s.revealed ? 3 : 2;
  const problems = validateDraw(
    s.draw,
    state.teams.map((t) => t.id),
  );
  const structure = resolveActual(s, state.matches);
  const playable = structure.filter(isPlayable);
  const decided = playable.filter((m) => isTeam(m.winner)).length;

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  };

  const setStatus = async (status: Status, msg: { title: string; body: string; ok: string; danger?: boolean }) => {
    const ok = await confirm({ title: msg.title, message: msg.body, confirmText: msg.ok, danger: msg.danger });
    if (ok) await run(status, () => act("setStatus", { status }, `${msg.ok} 완료`));
  };

  return (
    <div className="grid gap-4 sm:gap-5 lg:grid-cols-[1.5fr_1fr]">
      <Card>
        <CardHeader title="진행 단계" desc="버튼을 누르면 참여자 화면에 실시간으로 반영됩니다." />
        <ol className="mt-5 grid grid-cols-4 gap-2 px-5 sm:px-6">
          {STEPS.map((st, i) => (
            <li key={st.key} className="min-w-0">
              <div className={cx("h-1.5 rounded-full", i <= stepIdx ? "bg-pitch-500" : "bg-slate-200")} />
              <div className={cx("mt-2 text-[13px] font-bold", i === stepIdx ? "text-ink" : i < stepIdx ? "text-slate-500" : "text-slate-400")}>
                {st.label}
              </div>
              <div className="hidden text-[11px] text-slate-400 sm:block">{st.desc}</div>
            </li>
          ))}
        </ol>

        <div className="mt-6 space-y-3 border-t border-slate-100 bg-slate-50/50 px-5 py-5 sm:px-6">
          {s.status === "ready" && (
            <>
              {problems.length > 0 ? (
                <Notice tone="warn">
                  <b>오픈 전 확인:</b> {problems.join(" ")}{" "}
                  <button className="font-semibold underline" onClick={() => goTo("teams")}>
                    팀·대진 설정으로
                  </button>
                </Notice>
              ) : (
                <Notice tone="ok">
                  {state.teams.length}개 팀 · {playable.length}경기 준비 완료. 오픈하면 참여자가 등록할 수 있습니다.
                </Notice>
              )}
              <Button
                variant="accent"
                size="lg"
                className="w-full sm:w-auto"
                disabled={problems.length > 0}
                loading={busy === "open"}
                onClick={() =>
                  setStatus("open", {
                    title: "토토 참여를 오픈할까요?",
                    body: "오픈 후에는 팀·대진·예측 방식을 수정할 수 없습니다. (준비 상태로 되돌리면 다시 수정 가능)",
                    ok: "참여 오픈",
                  })
                }
              >
                ▶ 참여 오픈
              </Button>
            </>
          )}
          {s.status === "open" && (
            <div className="flex flex-wrap gap-2">
              <Button
                size="lg"
                loading={busy === "closed"}
                onClick={() =>
                  setStatus("closed", {
                    title: "참여를 마감할까요?",
                    body: "마감하면 참여자는 더 이상 등록하거나 예측을 수정할 수 없습니다. 이후 경기 결과를 입력할 수 있습니다.",
                    ok: "참여 마감",
                  })
                }
              >
                ■ 참여 마감
              </Button>
              <Button
                variant="secondary"
                size="lg"
                loading={busy === "ready"}
                onClick={() =>
                  setStatus("ready", {
                    title: "준비 상태로 되돌릴까요?",
                    body: "참여가 일시 중단되고 대진을 수정할 수 있습니다. 대진을 바꾸면 기존 예측 중 성립하지 않는 항목은 무효가 됩니다.",
                    ok: "준비로 되돌리기",
                  })
                }
              >
                준비로 되돌리기
              </Button>
            </div>
          )}
          {s.status === "closed" && (
            <div className="flex flex-wrap gap-2">
              {s.revealed ? (
                <Button
                  variant="secondary"
                  size="lg"
                  loading={busy === "reveal"}
                  onClick={() => run("reveal", () => act("setRevealed", { value: false }, "공개를 취소했습니다"))}
                >
                  공개 취소
                </Button>
              ) : (
                <Button
                  variant="accent"
                  size="lg"
                  loading={busy === "reveal"}
                  onClick={async () => {
                    const ok = await confirm({
                      title: "모든 예측을 공개할까요?",
                      message: "참여자 누구나 다른 참여자의 예측 내용과 경기별 예측 분포를 볼 수 있게 됩니다.",
                      confirmText: "예측 공개",
                    });
                    if (ok) await run("reveal", () => act("setRevealed", { value: true }, "예측을 공개했습니다"));
                  }}
                >
                  👁 예측 공개
                </Button>
              )}
              <Button variant="secondary" size="lg" onClick={() => goTo("results")}>
                결과 입력하기
              </Button>
              <Button
                variant="ghost"
                size="lg"
                loading={busy === "open"}
                onClick={() =>
                  setStatus("open", {
                    title: "참여를 다시 오픈할까요?",
                    body: "참여자가 다시 등록·수정할 수 있게 되며, 공개 상태는 해제됩니다.",
                    ok: "다시 오픈",
                  })
                }
              >
                다시 오픈
              </Button>
            </div>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-2 lg:content-start">
        <MiniStat label="참여자" value={`${state.participantCount}`} sub={`최대 ${s.maxParticipants}명`} />
        <MiniStat label="등록 팀" value={`${state.teams.length}`} sub={`최대 ${MAX_TEAMS}팀`} />
        <MiniStat label="예측 경기" value={`${playable.length}`} sub={`스코어 ${playable.filter((m) => state.matches.find((x) => x.key === m.key)?.mode === "score").length}경기`} />
        <MiniStat label="결과 입력" value={`${decided}/${playable.length}`} sub={decided === playable.length && playable.length ? "모든 경기 종료" : "진행 중"} />
      </div>

      <Card>
        <CardHeader title="기본 설정" />
        <div className="grid gap-4 p-5 sm:grid-cols-[1fr_auto] sm:items-end sm:px-6">
          <Field label="대회명">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} />
          </Field>
          <Button variant="secondary" disabled={!title.trim() || title === s.title} onClick={async () => {
              if (await act("setTitle", { title }, "대회명을 저장했습니다")) setTitle(null);
            }}>
            저장
          </Button>
          <Field label="최대 참여 인원">
            <Input value={max} onChange={(e) => setMax(e.target.value.replace(/\D/g, ""))} inputMode="numeric" />
          </Field>
          <Button
            variant="secondary"
            disabled={!max || Number(max) === s.maxParticipants}
            onClick={async () => {
              if (await act("setMaxParticipants", { value: Number(max) }, "최대 인원을 저장했습니다")) setMax(null);
            }}
          >
            저장
          </Button>
        </div>
      </Card>

      <Card>
        <CardHeader title="초기화" desc="리허설 후 실제 대회 전에 사용하세요. 되돌릴 수 없습니다." />
        <div className="flex flex-wrap gap-2 p-5 sm:px-6">
          <Button
            variant="dangerGhost"
            onClick={async () => {
              const ok = await confirm({
                title: "경기 결과 전체 초기화",
                message: "입력된 모든 경기 결과가 삭제됩니다.",
                danger: true,
                typeToConfirm: "초기화",
                confirmText: "결과 초기화",
              });
              if (ok) await act("clearAllResults", { confirm: "초기화" }, "결과를 초기화했습니다");
            }}
          >
            결과 전체 초기화
          </Button>
          <Button
            variant="dangerGhost"
            onClick={async () => {
              const ok = await confirm({
                title: "참여자 전체 삭제",
                message: `참여자 ${state.participantCount}명과 모든 예측이 영구 삭제됩니다.`,
                danger: true,
                typeToConfirm: "삭제",
                confirmText: "전체 삭제",
              });
              if (ok) await act("deleteAllParticipants", { confirm: "삭제" }, "참여자를 모두 삭제했습니다");
            }}
          >
            참여자 전체 삭제
          </Button>
        </div>
      </Card>
    </div>
  );
}

function MiniStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card className="px-5 py-4">
      <div className="text-[12px] font-semibold text-slate-500">{label}</div>
      <div className="tabular mt-1 text-[26px] leading-8 font-extrabold tracking-tight">{value}</div>
      {sub && <div className="mt-0.5 text-[12px] text-slate-400">{sub}</div>}
    </Card>
  );
}

// ── 팀 · 대진 ─────────────────────────────────────────
function TeamsPanel({ state, teams, act }: { state: PublicState; teams: TeamMap; act: Act }) {
  const confirm = useConfirm();
  const s = state.settings;
  const locked = s.status !== "ready";
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [sel, setSel] = useState<number | null>(null);

  const size = bracketSize(state.teams.length);
  const draw = s.draw;
  const byes = draw.filter((x) => !x).length;
  const problems = validateDraw(
    draw,
    state.teams.map((t) => t.id),
  );
  const modes = useMemo(() => Object.fromEntries(state.matches.map((m) => [m.key, m.mode])) as Record<string, Mode>, [state.matches]);
  const structure = useMemo(() => resolveActual(s, []), [s]);
  const total = roundCount(Math.max(2, draw.length));

  // 저장 중에도 다음 팀명을 입력할 수 있게: 보낸 이름만 비우고, 저장이 끝날 때까지 다음 제출은 대기
  const add = async () => {
    const submitted = name.trim();
    if (!submitted || adding) return;
    setName("");
    setAdding(true);
    const ok = await act("addTeam", { name: submitted });
    setAdding(false);
    if (!ok) setName((cur) => cur || submitted);
  };

  const tapSlot = async (i: number) => {
    if (locked) return;
    if (sel === null) {
      setSel(i);
      return;
    }
    if (sel === i) {
      setSel(null);
      return;
    }
    const next = [...draw];
    [next[sel], next[i]] = [next[i], next[sel]];
    setSel(null);
    await act("setDraw", { draw: next });
  };

  const setModes = (entries: [string, Mode][]) => act("setModes", { modes: Object.fromEntries(entries) });

  return (
    <div className="space-y-4 sm:space-y-5">
      {locked && (
        <Notice tone="warn">
          현재 <b>{s.status === "open" ? "참여 진행 중" : "참여 마감"}</b> 상태라 팀 추가·삭제, 대진, 예측 방식을 바꿀 수 없습니다. (팀 이름 수정은
          가능) 수정하려면 운영 탭에서 <b>준비로 되돌리기</b>를 하세요.
        </Notice>
      )}

      <div className="grid gap-4 sm:gap-5 lg:grid-cols-[360px_1fr]">
        {/* 팀 목록 */}
        <Card className="lg:self-start">
          <CardHeader
            title="팀 등록"
            desc="최대 16팀. 팀 수에 맞춰 대진(2·4·8·16강)이 자동으로 만들어집니다."
            right={<span className="tabular rounded-full bg-slate-100 px-2.5 py-1 text-[12px] font-bold text-slate-600">{state.teams.length}/{MAX_TEAMS}</span>}
          />
          <form
            className="flex gap-2 px-5 pt-4 sm:px-6"
            onSubmit={(e) => {
              e.preventDefault();
              add();
            }}
          >
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="팀명 입력" maxLength={40} disabled={locked || state.teams.length >= MAX_TEAMS} />
            <Button type="submit" loading={adding} disabled={adding || locked || !name.trim() || state.teams.length >= MAX_TEAMS} className="h-11">
              추가
            </Button>
          </form>
          <ul className="mt-3 max-h-[520px] divide-y divide-slate-100 overflow-y-auto px-2 pb-3 sm:px-3">
            {state.teams.map((t, i) => (
              <li key={t.id} className="flex items-center gap-2.5 rounded-xl px-3 py-2">
                <span className="tabular w-5 text-[12px] font-semibold text-slate-400">{i + 1}</span>
                <TeamAvatar id={t.id} name={t.name} />
                {editing?.id === t.id ? (
                  <form
                    className="flex flex-1 gap-1.5"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (await act("renameTeam", { id: t.id, name: editing.name }, "팀명을 수정했습니다")) setEditing(null);
                    }}
                  >
                    <Input value={editing.name} onChange={(e) => setEditing({ id: t.id, name: e.target.value })} className="h-9 text-sm" autoFocus maxLength={40} />
                    <Button size="sm" type="submit" className="h-9">
                      저장
                    </Button>
                  </form>
                ) : (
                  <>
                    <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">{t.name}</span>
                    <button
                      className="rounded-lg px-2 py-1 text-[12px] font-semibold text-slate-500 hover:bg-slate-100"
                      onClick={() => setEditing({ id: t.id, name: t.name })}
                    >
                      수정
                    </button>
                    <button
                      className="rounded-lg px-2 py-1 text-[12px] font-semibold text-rose-500 hover:bg-rose-50 disabled:opacity-30"
                      disabled={locked}
                      onClick={async () => {
                        if (await confirm({ title: `'${t.name}' 삭제`, message: "이 팀을 삭제하고 대진을 다시 맞춥니다.", danger: true, confirmText: "삭제" }))
                          act("deleteTeam", { id: t.id }, "팀을 삭제했습니다");
                      }}
                    >
                      삭제
                    </button>
                  </>
                )}
              </li>
            ))}
            {!state.teams.length && <li className="px-3 py-8 text-center text-sm text-slate-400">팀을 추가하세요.</li>}
          </ul>
        </Card>

        {/* 대진 */}
        <Card>
          <CardHeader
            title="대진 (1라운드)"
            desc={
              state.teams.length >= 2
                ? `${roundName(1, roundCount(size))} 대진 · 부전승 ${byes}자리. 두 칸을 차례로 누르면 자리가 바뀝니다.`
                : "팀을 2개 이상 등록하세요."
            }
            right={
              <>
                <Button variant="secondary" size="sm" disabled={locked || state.teams.length < 2} onClick={() => act("autoDraw", { random: false }, "등록 순서대로 배치했습니다")}>
                  등록순 배치
                </Button>
                <Button variant="secondary" size="sm" disabled={locked || state.teams.length < 2} onClick={() => act("autoDraw", { random: true }, "무작위로 배치했습니다")}>
                  🎲 랜덤 배치
                </Button>
              </>
            }
          />
          <div className="p-5 sm:px-6">
            {problems.length > 0 && state.teams.length >= 2 && (
              <div className="mb-4">
                <Notice tone="warn">{problems.join(" ")}</Notice>
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: draw.length / 2 }, (_, m) => (
                <div key={m} className="rounded-2xl bg-slate-50 p-2 ring-1 ring-slate-900/[0.04]">
                  <div className="mb-1.5 px-1 text-[11px] font-semibold text-slate-400">{m + 1}경기</div>
                  {[m * 2, m * 2 + 1].map((slot) => {
                    const id = draw[slot];
                    const t = id ? teams.get(id) : null;
                    return (
                      <button
                        key={slot}
                        type="button"
                        disabled={locked}
                        onClick={() => tapSlot(slot)}
                        className={cx(
                          "mb-1 flex h-11 w-full items-center gap-2 rounded-xl px-2.5 text-left text-[13px] transition last:mb-0",
                          sel === slot ? "bg-pitch-50 ring-2 ring-pitch-500" : "bg-white ring-1 ring-slate-200 hover:ring-slate-300",
                          locked && "cursor-default",
                        )}
                      >
                        {t ? <TeamAvatar id={t.id} name={t.name} size="sm" /> : <span className="flex size-6 items-center justify-center rounded-md border border-dashed border-slate-300 text-[10px] text-slate-400">–</span>}
                        <span className={cx("truncate", t ? "font-semibold" : "text-slate-400")}>{t?.name ?? "부전승 (빈 자리)"}</span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
            <div className="mt-5 flex items-center justify-between gap-4 rounded-2xl bg-slate-50 px-4 py-3">
              <div>
                <div className="text-[14px] font-semibold">3·4위전</div>
                <div className="text-[12px] text-slate-500">4강 패자끼리의 경기를 추가합니다.</div>
              </div>
              <Toggle checked={s.thirdPlace} disabled={locked || state.teams.length < 3} onChange={(v) => act("setThirdPlace", { value: v })} label="3·4위전" />
            </div>
          </div>
        </Card>
      </div>

      {/* 예측 방식 */}
      {draw.length >= 2 && state.teams.length >= 2 && (
        <Card>
          <CardHeader
            title="경기별 예측 방식"
            desc="승패: 승리 팀만 예측 · 스코어: 승리 팀 + 정확한 스코어까지 예측 (맞히면 +1점)"
            right={
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={locked}
                  onClick={() => setModes(structure.filter(isPlayable).map((m) => [m.key, "winner"]))}
                >
                  전체 승패
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={locked}
                  onClick={() => setModes(structure.filter(isPlayable).map((m) => [m.key, "score"]))}
                >
                  전체 스코어
                </Button>
              </>
            }
          />
          <div className="grid gap-5 p-5 sm:px-6 md:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: total }, (_, i) => i + 1).map((r) => {
              const list = structure.filter((m) => m.round === r);
              const playableList = list.filter(isPlayable);
              return (
                <div key={r}>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-[13px] font-bold">{roundName(r, total)}</span>
                    {playableList.length > 1 && (
                      <Segmented
                        size="sm"
                        disabled={locked}
                        value={playableList.every((m) => modes[m.key] === "score") ? "score" : playableList.every((m) => (modes[m.key] ?? "winner") === "winner") ? "winner" : ("mixed" as Mode)}
                        options={[
                          { value: "winner" as Mode, label: "모두 승패" },
                          { value: "score" as Mode, label: "모두 스코어" },
                        ]}
                        onChange={(v) => setModes(playableList.map((m) => [m.key, v]))}
                      />
                    )}
                  </div>
                  <ul className="space-y-1.5">
                    {list.map((m) => (
                      <li key={m.key} className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2">
                        <div className="min-w-0">
                          <div className="truncate text-[13px] font-semibold">{matchLabel(m, total)}</div>
                          <div className="truncate text-[11px] text-slate-400">
                            {m.bye || m.dead ? "부전승 — 예측 없음" : m.round === 1 ? `${teams.get(m.a ?? "")?.name ?? "?"} vs ${teams.get(m.b ?? "")?.name ?? "?"}` : `${feederLabel(m, "a", total)} vs ${feederLabel(m, "b", total)}`}
                          </div>
                        </div>
                        {isPlayable(m) && (
                          <Segmented
                            size="sm"
                            disabled={locked}
                            value={modes[m.key] ?? "winner"}
                            options={[
                              { value: "winner" as Mode, label: "승패" },
                              { value: "score" as Mode, label: "스코어" },
                            ]}
                            onChange={(v) => setModes([[m.key, v]])}
                          />
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}

// ── 결과 입력 ─────────────────────────────────────────
function ResultsAdminPanel({ state, teams, act }: { state: PublicState; teams: TeamMap; act: Act }) {
  const s = state.settings;
  const resolved = useMemo(() => resolveActual(s, state.matches), [s, state.matches]);
  const rows = useMemo(() => new Map(state.matches.map((m) => [m.key, m])), [state.matches]);
  const size = Math.max(2, s.draw.length);
  const total = roundCount(size);
  const playable = resolved.filter(isPlayable);
  const decided = playable.filter((m) => isTeam(m.winner)).length;
  const enabled = s.status === "closed";

  return (
    <div className="space-y-4 sm:space-y-5">
      {!enabled && <Notice tone="warn">경기 결과는 <b>참여 마감</b> 후에 입력할 수 있습니다. (운영 탭에서 마감)</Notice>}
      <Card className="p-4 sm:p-6">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-[17px] font-bold tracking-tight">경기 결과 입력</h2>
            <p className="mt-1 text-[13px] text-slate-500">승리 팀을 누르고(필요하면 점수 입력) 저장하세요. 저장 즉시 순위가 실시간으로 갱신됩니다.</p>
          </div>
          <span className="tabular rounded-full bg-slate-100 px-3 py-1 text-[12px] font-semibold text-slate-600">
            {decided} / {playable.length} 입력
          </span>
        </div>
        {state.teams.length < 2 ? (
          <Empty title="팀을 먼저 등록하세요" />
        ) : (
          <BracketLayout
            matches={resolved}
            size={size}
            render={(m) => {
              const r = rows.get(m.key);
              return (
                <AdminResultCard
                  key={`${m.key}:${m.a}:${m.b}:${r?.winnerTeamId}:${r?.winnerScore}:${r?.loserScore}`}
                  m={m}                   total={total}
                  teams={teams}
                  row={r}
                  enabled={enabled}
                  act={act}
                />
              );
            }}
          />
        )}
      </Card>
    </div>
  );
}

function AdminResultCard({
  m,
  total,
  teams,
  row,
  enabled,
  act,
}: {
  m: ResolvedMatch;
  total: number;
  teams: TeamMap;
  row: MatchRow | undefined;
  enabled: boolean;
  act: Act;
}) {
  const savedWinner = row?.winnerTeamId && (row.winnerTeamId === m.a || row.winnerTeamId === m.b) ? row.winnerTeamId : null;
  const savedScore = (id: string | null) =>
    !savedWinner || !id || row?.winnerScore === null || row?.winnerScore === undefined ? "" : String(id === savedWinner ? row.winnerScore : row.loserScore);
  const a = isTeam(m.a) ? m.a : null;
  const b = isTeam(m.b) ? m.b : null;
  const [winner, setWinner] = useState<string | null>(savedWinner);
  const [sa, setSa] = useState(savedScore(a));
  const [sb, setSb] = useState(savedScore(b));
  const [busy, setBusy] = useState(false);
  const confirm = useConfirm();

  if (m.bye || m.dead) return <ByeCard m={m} teams={teams} total={total} />;
  const mode = row?.mode ?? "winner";
  const dirty = winner !== savedWinner || sa !== savedScore(a) || sb !== savedScore(b);

  const onScore = (side: "a" | "b", v: string) => {
    const val = v.replace(/\D/g, "").slice(0, 2);
    const na = side === "a" ? val : sa;
    const nb = side === "b" ? val : sb;
    if (side === "a") setSa(val);
    else setSb(val);
    if (na !== "" && nb !== "" && a && b) {
      if (Number(na) > Number(nb)) setWinner(a);
      else if (Number(nb) > Number(na)) setWinner(b);
    }
  };

  const sideRow = (side: "a" | "b") => {
    const id = side === "a" ? a : b;
    if (!id) return <Placeholder key={side} text={feederLabel(m, side, total)} />;
    const t = teams.get(id);
    const sel = winner === id;
    return (
      <div
        key={side}
        className={cx(
          "flex h-12 items-center gap-2 rounded-xl px-2.5 transition",
          sel ? "bg-pitch-50 ring-2 ring-pitch-500" : "bg-slate-50 ring-1 ring-transparent",
          enabled && "cursor-pointer hover:ring-slate-200",
        )}
        onClick={() => enabled && setWinner(id)}
      >
        <TeamAvatar id={id} name={t?.name ?? "?"} />
        <span className={cx("min-w-0 flex-1 truncate text-[14px]", sel ? "font-bold" : "font-semibold text-slate-600")}>{t?.name}</span>
        {sel && <span className="rounded-md bg-pitch-600 px-1.5 py-0.5 text-[10px] font-bold text-white">승</span>}
        <input
          value={side === "a" ? sa : sb}
          onChange={(e) => onScore(side, e.target.value)}
          onClick={(e) => e.stopPropagation()}
          disabled={!enabled}
          inputMode="numeric"
          placeholder={mode === "score" ? "점수" : "-"}
          className="tabular h-9 w-12 rounded-lg bg-white text-center text-[15px] font-bold ring-1 ring-slate-200 focus:ring-2 focus:ring-pitch-500 focus:outline-none disabled:opacity-50"
        />
      </div>
    );
  };

  const ready = !!(a && b);
  return (
    <CardShell
      label={matchLabel(m, total)}
      mode={mode}
      highlight={savedWinner ? "ok" : null}
      footer={
        ready && enabled ? (
          <div className="flex items-center justify-end gap-1.5">
            {savedWinner && (
              <Button
                size="sm"
                variant="dangerGhost"
                disabled={busy}
                onClick={async () => {
                  const ok = await confirm({
                    title: `${matchLabel(m, total)} 결과 지우기`,
                    message: "이 경기 결과에 이어지는 다음 라운드 결과도 함께 지워집니다.",
                    danger: true,
                    confirmText: "지우기",
                  });
                  if (!ok) return;
                  setBusy(true);
                  await act("clearResult", { key: m.key }, "결과를 지웠습니다");
                  setBusy(false);
                }}
              >
                결과 지우기
              </Button>
            )}
            <Button
              size="sm"
              variant="accent"
              loading={busy}
              disabled={!winner || !dirty || (mode === "score" && (sa === "" || sb === ""))}
              onClick={async () => {
                if (savedWinner && winner !== savedWinner) {
                  const ok = await confirm({
                    title: "승리 팀을 바꿀까요?",
                    message: "이 경기의 승자가 바뀌면 이어지는 다음 라운드 결과는 지워집니다.",
                    confirmText: "변경 저장",
                  });
                  if (!ok) return;
                }
                setBusy(true);
                await act(
                  "setResult",
                  { key: m.key, winnerTeamId: winner, scoreA: sa === "" ? null : Number(sa), scoreB: sb === "" ? null : Number(sb) },
                  "결과를 저장했습니다",
                );
                setBusy(false);
              }}
            >
              {savedWinner ? "수정 저장" : "결과 저장"}
            </Button>
          </div>
        ) : !ready ? (
          <span className="text-[11px] text-slate-400">앞 경기 결과가 필요합니다</span>
        ) : null
      }
    >
      {sideRow("a")}
      {sideRow("b")}
    </CardShell>
  );
}

// ── 참여자 관리 ───────────────────────────────────────
function PeoplePanel({ state, teams, token, act }: { state: PublicState; teams: TeamMap; token: string; act: Act }) {
  const confirm = useConfirm();
  const toast = useToast();
  const [list, setList] = useState<AdminParticipant[] | null>(null);
  const [q, setQ] = useState("");
  const [viewing, setViewing] = useState<AdminParticipant | null>(null);
  const [pinFor, setPinFor] = useState<AdminParticipant | null>(null);
  const [pin, setPin] = useState("");

  // 상태(결과·참여자 수)가 바뀔 때마다 갱신
  const version = `${state.participantCount}:${state.matches.map((m) => m.winnerTeamId ?? "").join(",")}`;
  const [tick, setTick] = useState(0);
  const load = () => setTick((t) => t + 1);
  useEffect(() => {
    let alive = true;
    api<{ participants: AdminParticipant[] }>("/api/admin", { token })
      .then((r) => alive && setList(r.participants))
      .catch((e) => toast(e instanceof Error ? e.message : "불러오기 실패", "error"));
    return () => {
      alive = false;
    };
  }, [token, toast, version, tick]);

  const structure = useMemo(() => resolveActual(state.settings, []).filter(isPlayable).length, [state.settings]);
  const filtered = useMemo(() => {
    const s = q.replace(/\s+/g, "").toLowerCase();
    return (list ?? []).filter((r) => !s || `${r.dept}${r.name}`.replace(/\s+/g, "").toLowerCase().includes(s));
  }, [list, q]);

  const exportCsv = () => {
    if (!list) return;
    const head = ["순위", "부서", "이름", "점수", "적중", "스코어적중", "결과확정경기", "승률(%)", "예측수", "등록시각"];
    const lines = list.map((r) =>
      [r.rank, r.dept, r.name, r.points, r.hits, r.exact, r.decided, Math.round(r.rate * 1000) / 10, r.picked, new Date(r.createdAt).toLocaleString("ko-KR")]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(","),
    );
    const blob = new Blob(["﻿" + [head.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `fifa-toto-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="참여자"
        desc={`${state.participantCount}명 참여 · 예측 대상 ${structure}경기`}
        right={
          <>
            <Input placeholder="부서·이름 검색" value={q} onChange={(e) => setQ(e.target.value)} className="h-9 w-44 text-sm" />
            <Button variant="secondary" size="sm" className="h-9" onClick={exportCsv} disabled={!list?.length}>
              CSV 다운로드
            </Button>
          </>
        }
      />
      {!list ? (
        <div className="flex justify-center py-14">
          <Spinner className="size-6 text-slate-400" />
        </div>
      ) : !filtered.length ? (
        <Empty icon="👥" title={list.length ? "검색 결과가 없습니다" : "아직 참여자가 없습니다"} />
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-[13px]">
            <thead className="border-y border-slate-100 bg-slate-50/70 text-[11px] font-semibold tracking-wide text-slate-400">
              <tr>
                <th className="py-2 pr-2 pl-6">순위</th>
                <th className="px-2">부서</th>
                <th className="px-2">이름</th>
                <th className="px-2 text-right">예측</th>
                <th className="px-2 text-right">적중</th>
                <th className="px-2 text-right">승률</th>
                <th className="px-2 text-right">점수</th>
                <th className="px-2">등록</th>
                <th className="py-2 pr-6 pl-2 text-right">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50/60">
                  <td className="tabular py-2.5 pr-2 pl-6 font-bold">{r.rank}</td>
                  <td className="max-w-40 truncate px-2 text-slate-600">{r.dept}</td>
                  <td className="max-w-32 truncate px-2 font-semibold">{r.name}</td>
                  <td className={cx("tabular px-2 text-right", r.picked < structure ? "text-amber-600" : "text-slate-600")}>
                    {r.picked}/{structure}
                  </td>
                  <td className="tabular px-2 text-right">
                    {r.hits}/{r.decided}
                    {r.exact > 0 && <span className="ml-1 text-violet-600">+{r.exact}</span>}
                  </td>
                  <td className="tabular px-2 text-right">{pct(r.rate)}</td>
                  <td className="tabular px-2 text-right font-bold">{r.points}</td>
                  <td className="px-2 text-[12px] whitespace-nowrap text-slate-400">
                    {new Date(r.createdAt).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </td>
                  <td className="py-2 pr-6 pl-2 text-right whitespace-nowrap">
                    <button className="rounded-lg px-2 py-1 font-semibold text-slate-600 hover:bg-slate-100" onClick={() => setViewing(r)}>
                      예측
                    </button>
                    <button
                      className="rounded-lg px-2 py-1 font-semibold text-slate-600 hover:bg-slate-100"
                      onClick={() => {
                        setPin("");
                        setPinFor(r);
                      }}
                    >
                      PIN
                    </button>
                    <button
                      className="rounded-lg px-2 py-1 font-semibold text-rose-500 hover:bg-rose-50"
                      onClick={async () => {
                        if (
                          await confirm({
                            title: `${r.name} 삭제`,
                            message: `${r.dept} ${r.name}님의 참여 정보와 예측이 영구 삭제됩니다.`,
                            danger: true,
                            confirmText: "삭제",
                          })
                        ) {
                          if (await act("deleteParticipant", { id: r.id }, "삭제했습니다")) load();
                        }
                      }}
                    >
                      삭제
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={!!pinFor}
        onClose={() => setPinFor(null)}
        title="비밀번호 재설정"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPinFor(null)}>
              취소
            </Button>
            <Button
              disabled={pin.length !== 4}
              onClick={async () => {
                if (pinFor && (await act("resetPin", { id: pinFor.id, pin }, "비밀번호를 재설정했습니다"))) setPinFor(null);
              }}
            >
              재설정
            </Button>
          </>
        }
      >
        <p className="mb-4 text-[14px] text-slate-600">
          {pinFor?.dept} <b>{pinFor?.name}</b>님의 새 비밀번호(숫자 4자리)를 입력하세요.
        </p>
        <Input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" placeholder="0000" autoFocus className="tracking-[0.4em]" />
      </Modal>

      <AdminPicksModal row={viewing} onClose={() => setViewing(null)} state={state} teams={teams} token={token} />
    </Card>
  );
}

function AdminPicksModal({
  row,
  onClose,
  state,
  teams,
  token,
}: {
  row: AdminParticipant | null;
  onClose: () => void;
  state: PublicState;
  teams: TeamMap;
  token: string;
}) {
  const [loadedData, setData] = useState<OtherPicks | null>(null);
  useEffect(() => {
    if (!row) return;
    api<OtherPicks>(`/api/admin?id=${encodeURIComponent(row.id)}`, { token })
      .then(setData)
      .catch(() => setData({ id: row.id, dept: row.dept, name: row.name, picks: {} }));
  }, [row, token]);
  const data = row && loadedData?.id === row.id ? loadedData : null;
  const s = state.settings;
  const size = Math.max(2, s.draw.length);
  const resolved = useMemo(() => (data ? resolvePicks(s, data.picks) : []), [s, data]);
  const rows = useMemo(() => new Map(state.matches.map((m) => [m.key, m])), [state.matches]);
  return (
    <Modal open={!!row} onClose={onClose} wide title={row && `${row.name} · ${row.dept}`}>
      {!data ? (
        <div className="flex justify-center py-16">
          <Spinner className="size-6 text-slate-400" />
        </div>
      ) : (
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
              actual={s.status === "closed" ? (rows.get(m.key) ?? null) : undefined}
            />
          )}
        />
      )}
    </Modal>
  );
}
