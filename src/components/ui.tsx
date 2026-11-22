"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";
import type { Status } from "@/lib/bracket";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

// ── Button ────────────────────────────────────────────
type Variant = "primary" | "accent" | "secondary" | "ghost" | "danger" | "dangerGhost";
const variants: Record<Variant, string> = {
  primary: "bg-ink text-white hover:bg-slate-800 active:bg-slate-900 shadow-sm",
  accent: "bg-pitch-600 text-white hover:bg-pitch-700 shadow-sm shadow-pitch-600/20",
  secondary: "bg-white text-slate-700 ring-1 ring-inset ring-slate-200 hover:bg-slate-50",
  ghost: "text-slate-600 hover:bg-slate-100",
  danger: "bg-rose-600 text-white hover:bg-rose-700 shadow-sm",
  dangerGhost: "text-rose-600 hover:bg-rose-50",
};

export function Button({
  variant = "primary",
  size = "md",
  loading,
  className,
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: "sm" | "md" | "lg";
  loading?: boolean;
}) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cx(
        "inline-flex select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-xl font-semibold transition",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pitch-500",
        "disabled:cursor-not-allowed disabled:opacity-45",
        size === "sm" && "h-8 px-3 text-[13px]",
        size === "md" && "h-10 px-4 text-sm",
        size === "lg" && "h-12 px-5 text-[15px]",
        variants[variant],
        className,
      )}
    >
      {loading && <Spinner className="size-4" />}
      {children}
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cx("animate-spin", className)} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

// ── Card ──────────────────────────────────────────────
export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <section className={cx("rounded-2xl bg-white shadow-card ring-1 ring-slate-900/[0.04]", className)}>
      {children}
    </section>
  );
}

export function CardHeader({
  title,
  desc,
  right,
}: {
  title: ReactNode;
  desc?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5 sm:px-6">
      <div className="min-w-0">
        <h2 className="text-[17px] font-bold tracking-tight text-ink">{title}</h2>
        {desc && <p className="mt-1 text-[13px] leading-relaxed text-slate-500">{desc}</p>}
      </div>
      {right && <div className="flex shrink-0 flex-wrap items-center gap-2">{right}</div>}
    </div>
  );
}

// ── Inputs ────────────────────────────────────────────
export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...rest}
      className={cx(
        "h-11 w-full rounded-xl border-0 bg-slate-50 px-3.5 text-[15px] text-ink ring-1 ring-inset ring-slate-200 transition",
        "placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-pitch-500",
        "disabled:opacity-60",
        className,
      )}
    />
  );
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-semibold text-slate-700">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  size = "md",
  disabled,
}: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
  size?: "sm" | "md";
  disabled?: boolean;
}) {
  return (
    <div className={cx("inline-flex rounded-xl bg-slate-100 p-1", disabled && "opacity-50")}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          disabled={disabled}
          onClick={() => onChange(o.value)}
          className={cx(
            "rounded-lg font-semibold transition disabled:cursor-not-allowed",
            size === "sm" ? "h-7 px-2.5 text-xs" : "h-8 px-3.5 text-[13px]",
            value === o.value ? "bg-white text-ink shadow-sm" : "text-slate-500 hover:text-slate-700",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        "relative h-6 w-11 shrink-0 rounded-full transition disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-pitch-600" : "bg-slate-300",
      )}
    >
      <span
        className={cx(
          "absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition",
          checked && "translate-x-5",
        )}
      />
    </button>
  );
}

// ── Tabs ──────────────────────────────────────────────
export function Tabs<T extends string>({
  value,
  onChange,
  items,
}: {
  value: T;
  onChange: (v: T) => void;
  items: { value: T; label: string; badge?: ReactNode }[];
}) {
  return (
    <div className="no-scrollbar -mx-4 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <div className="flex gap-1 rounded-2xl bg-white p-1.5 shadow-card ring-1 ring-slate-900/[0.04]">
        {items.map((it) => (
          <button
            key={it.value}
            type="button"
            onClick={() => onChange(it.value)}
            className={cx(
              "flex h-10 items-center gap-1.5 whitespace-nowrap rounded-xl px-4 text-sm font-semibold transition sm:px-5",
              value === it.value ? "bg-ink text-white shadow" : "text-slate-500 hover:bg-slate-50 hover:text-slate-800",
            )}
          >
            {it.label}
            {it.badge}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Status ────────────────────────────────────────────
export function statusInfo(status: Status, revealed: boolean) {
  if (status === "open") return { label: "참여 진행 중", tone: "bg-pitch-500/15 text-pitch-500 ring-pitch-500/30", dot: "bg-pitch-500" };
  if (status === "closed" && revealed)
    return { label: "마감 · 예측 공개", tone: "bg-sky-400/15 text-sky-300 ring-sky-400/30", dot: "bg-sky-400" };
  if (status === "closed") return { label: "참여 마감", tone: "bg-amber-400/15 text-amber-300 ring-amber-400/30", dot: "bg-amber-400" };
  return { label: "오픈 준비 중", tone: "bg-white/10 text-slate-300 ring-white/20", dot: "bg-slate-400" };
}

export function StatusPill({ status, revealed }: { status: Status; revealed: boolean }) {
  const s = statusInfo(status, revealed);
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1", s.tone)}>
      <span className={cx("size-1.5 rounded-full", s.dot, status === "open" && "animate-pulse")} />
      {s.label}
    </span>
  );
}

export function LiveDot({ live }: { live: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400" title={live ? "실시간 연결됨" : "주기적으로 갱신"}>
      <span className="relative flex size-2">
        {live && <span className="absolute inline-flex size-full animate-ping rounded-full bg-pitch-500 opacity-60" />}
        <span className={cx("relative inline-flex size-2 rounded-full", live ? "bg-pitch-500" : "bg-slate-500")} />
      </span>
      {live ? "실시간" : "자동 갱신"}
    </span>
  );
}

// ── Team avatar ───────────────────────────────────────
const TEAM_COLORS = [
  "from-sky-500 to-blue-600",
  "from-rose-500 to-red-600",
  "from-amber-400 to-orange-500",
  "from-emerald-500 to-green-600",
  "from-violet-500 to-purple-600",
  "from-cyan-500 to-teal-600",
  "from-fuchsia-500 to-pink-600",
  "from-lime-500 to-green-600",
  "from-indigo-500 to-blue-700",
  "from-orange-500 to-red-500",
  "from-teal-500 to-emerald-600",
  "from-slate-500 to-slate-700",
];

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function TeamAvatar({ id, name, size = "md" }: { id: string; name: string; size?: "sm" | "md" | "lg" }) {
  // '[테스트] 개발팀' 처럼 괄호로 시작해도 글자만으로 이니셜을 만든다
  const clean = name.replace(/\[[^\]]*\]|\([^)]*\)/g, "").replace(/[^\p{L}\p{N}]/gu, "") || name.replace(/[^\p{L}\p{N}]/gu, "");
  const initials = [...clean].slice(0, /[a-zA-Z]/.test(clean[0] ?? "") ? 2 : 1).join("").toUpperCase();
  return (
    <span
      className={cx(
        "inline-flex shrink-0 items-center justify-center rounded-lg bg-linear-to-br font-bold text-white shadow-sm",
        TEAM_COLORS[hash(id) % TEAM_COLORS.length],
        size === "sm" && "size-6 text-[10px]",
        size === "md" && "size-8 text-xs",
        size === "lg" && "size-10 text-sm",
      )}
    >
      {initials || "?"}
    </span>
  );
}

// ── Modal (모바일: 바텀시트 / PC: 가운데) ───────────────
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal>
      <div className="absolute inset-0 bg-slate-950/50 backdrop-blur-[2px]" onClick={onClose} />
      <div
        className={cx(
          "relative flex max-h-[92dvh] w-full animate-sheet-up flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl",
          wide ? "sm:max-w-5xl" : "sm:max-w-md",
        )}
      >
        <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-slate-200 sm:hidden" />
        {title && (
          <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-2 sm:px-6 sm:pt-6">
            <div className="min-w-0 text-lg font-bold tracking-tight">{title}</div>
            <button
              type="button"
              onClick={onClose}
              className="-mr-2 flex size-9 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              aria-label="닫기"
            >
              <svg viewBox="0 0 20 20" className="size-5" fill="currentColor">
                <path d="M5.3 5.3a1 1 0 0 1 1.4 0L10 8.6l3.3-3.3a1 1 0 1 1 1.4 1.4L11.4 10l3.3 3.3a1 1 0 0 1-1.4 1.4L10 11.4l-3.3 3.3a1 1 0 0 1-1.4-1.4L8.6 10 5.3 6.7a1 1 0 0 1 0-1.4Z" />
              </svg>
            </button>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 sm:px-6">{children}</div>
        {footer && (
          <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-5 py-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))] sm:px-6">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Confirm dialog ────────────────────────────────────
interface ConfirmOpts {
  title: string;
  message?: ReactNode;
  confirmText?: string;
  danger?: boolean;
  typeToConfirm?: string;
}
const ConfirmCtx = createContext<(o: ConfirmOpts) => Promise<boolean>>(async () => false);
const ToastCtx = createContext<(msg: string, tone?: "ok" | "error") => void>(() => {});

export function Providers({ children }: { children: ReactNode }) {
  const [confirm, setConfirm] = useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null);
  const [typed, setTyped] = useState("");
  const [toasts, setToasts] = useState<{ id: number; msg: string; tone: "ok" | "error" }[]>([]);

  const ask = useCallback(
    (o: ConfirmOpts) =>
      new Promise<boolean>((resolve) => {
        setTyped("");
        setConfirm({ ...o, resolve });
      }),
    [],
  );
  const toast = useCallback((msg: string, tone: "ok" | "error" = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-2), { id, msg, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === "error" ? 4500 : 2600);
  }, []);

  const close = (v: boolean) => {
    confirm?.resolve(v);
    setConfirm(null);
  };

  return (
    <ConfirmCtx.Provider value={ask}>
      <ToastCtx.Provider value={toast}>
        {children}
        <Modal
          open={!!confirm}
          onClose={() => close(false)}
          title={confirm?.title}
          footer={
            <>
              <Button variant="secondary" onClick={() => close(false)}>
                취소
              </Button>
              <Button
                variant={confirm?.danger ? "danger" : "primary"}
                disabled={!!confirm?.typeToConfirm && typed !== confirm.typeToConfirm}
                onClick={() => close(true)}
              >
                {confirm?.confirmText ?? "확인"}
              </Button>
            </>
          }
        >
          <div className="space-y-4 pt-1 text-[15px] leading-relaxed text-slate-600">
            {confirm?.message}
            {confirm?.typeToConfirm && (
              <Field label={`확인을 위해 '${confirm.typeToConfirm}' 를 입력하세요`}>
                <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus />
              </Field>
            )}
          </div>
        </Modal>
        <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex flex-col items-center gap-2 px-4 sm:bottom-8">
          {toasts.map((t) => (
            <div
              key={t.id}
              className={cx(
                "pointer-events-auto max-w-md animate-fade-up rounded-2xl px-4 py-3 text-sm font-medium shadow-lift",
                t.tone === "error" ? "bg-rose-600 text-white" : "bg-ink text-white",
              )}
            >
              {t.msg}
            </div>
          ))}
        </div>
      </ToastCtx.Provider>
    </ConfirmCtx.Provider>
  );
}

export const useConfirm = () => useContext(ConfirmCtx);
export const useToast = () => useContext(ToastCtx);

export function Empty({ icon, title, desc }: { icon?: ReactNode; title: string; desc?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <div className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-slate-100 text-2xl">{icon ?? "⚽"}</div>
      <p className="font-semibold text-slate-800">{title}</p>
      {desc && <p className="mt-1 max-w-sm text-sm leading-relaxed text-slate-500">{desc}</p>}
    </div>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warn" | "ok"; children: ReactNode }) {
  return (
    <div
      className={cx(
        "flex gap-2.5 rounded-xl px-4 py-3 text-[13px] leading-relaxed",
        tone === "info" && "bg-sky-50 text-sky-900",
        tone === "warn" && "bg-amber-50 text-amber-900",
        tone === "ok" && "bg-pitch-50 text-pitch-700",
      )}
    >
      <span className="mt-px">{tone === "warn" ? "⚠️" : tone === "ok" ? "✅" : "ℹ️"}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
