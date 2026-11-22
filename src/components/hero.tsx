import type { ReactNode } from "react";
import type { Status } from "@/lib/bracket";
import { LiveDot, StatusPill } from "./ui";

export function Logo() {
  return (
    <span className="flex size-8 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/15">
      <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.6">
        <circle cx="12" cy="12" r="9" />
        <path d="m12 7 3.5 2.5-1.3 4.1H9.8L8.5 9.5 12 7Z" fill="currentColor" stroke="none" />
        <path d="M12 3v4M3.6 9.3l4.9.2M20.4 9.3l-4.9.2M6.5 19.3l3.3-5.7M17.5 19.3l-3.3-5.7" />
      </svg>
    </span>
  );
}

export function Hero({
  title,
  status,
  revealed,
  live,
  sub,
  right,
  badge,
}: {
  title: string;
  status?: Status;
  revealed?: boolean;
  live: boolean;
  sub?: ReactNode;
  right?: ReactNode;
  badge?: string;
}) {
  return (
    <header className="hero-pitch relative overflow-hidden text-white">
      <div className="relative z-10 mx-auto max-w-6xl px-4 pt-5 pb-20 sm:px-6 sm:pt-6 sm:pb-24">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Logo />
            <span className="text-[15px] font-extrabold tracking-tight">
              FIFA TOTO
              {badge && (
                <span className="ml-2 rounded-md bg-white/10 px-1.5 py-0.5 align-middle text-[11px] font-semibold text-slate-300">
                  {badge}
                </span>
              )}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <LiveDot live={live} />
            {right}
          </div>
        </div>
        <h1 className="mt-7 text-[26px] leading-tight font-extrabold tracking-tight text-balance sm:mt-9 sm:text-[40px]">
          {title}
        </h1>
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px] text-slate-300">
          {status && <StatusPill status={status} revealed={!!revealed} />}
          {sub}
        </div>
      </div>
    </header>
  );
}
