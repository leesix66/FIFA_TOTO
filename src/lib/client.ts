"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { PublicState } from "./types";

export class ClientError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T = unknown>(
  path: string,
  opts: { method?: string; body?: unknown; token?: string | null } = {},
): Promise<T> {
  const res = await fetch(path, {
    method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
    headers: {
      ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    cache: "no-store",
  });
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* empty */
  }
  if (!res.ok) {
    const msg = (data as { error?: string } | null)?.error ?? `요청 실패 (${res.status})`;
    throw new ClientError(res.status, msg);
  }
  return data as T;
}

export const storage = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string | null) {
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch {
      /* private mode 등 */
    }
    window.dispatchEvent(new Event("fifa-toto-storage"));
  },
};

function subscribeStorage(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener("fifa-toto-storage", cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener("fifa-toto-storage", cb);
  };
}

/** localStorage 값을 SSR/하이드레이션 안전하게 구독 */
export function useStored(key: string): string | null {
  return useSyncExternalStore(
    subscribeStorage,
    () => storage.get(key),
    () => null,
  );
}

type StateResponse = (PublicState & { version: string }) | { version: string; unchanged: true };

/**
 * 공개 상태 + 실시간 반영.
 * Supabase Realtime 으로 설정/팀/경기 변경을 받으면 즉시 새로고침하고,
 * 연결이 없을 때를 대비해 주기적으로(버전 비교라 가벼움) 확인한다.
 */
export function useLiveState() {
  const [state, setState] = useState<PublicState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const versionRef = useRef<string | null>(null);
  const inflight = useRef(false);

  const refresh = useCallback(async (force = false) => {
    if (inflight.current) return;
    inflight.current = true;
    try {
      const v = force ? "" : (versionRef.current ?? "");
      const data = await api<StateResponse>(`/api/state${v ? `?v=${encodeURIComponent(v)}` : ""}`);
      versionRef.current = data.version;
      if (!("unchanged" in data)) setState(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "불러오기 실패");
    } finally {
      inflight.current = false;
    }
  }, []);

  useEffect(() => {
    refresh(true);
    let cancelled = false;
    let cleanup: (() => void) | null = null;
    let debounce: ReturnType<typeof setTimeout> | null = null;

    const schedule = () => {
      if (debounce) clearTimeout(debounce);
      // 500명이 동시에 요청하지 않도록 약간의 지터
      debounce = setTimeout(() => refresh(), 300 + Math.random() * 1200);
    };

    (async () => {
      try {
        const cfg = await api<{ url: string | null; key: string | null }>("/api/config");
        if (!cfg.url || !cfg.key || cancelled) return;
        const { createClient } = await import("@supabase/supabase-js");
        const supa = createClient(cfg.url, cfg.key, { auth: { persistSession: false, autoRefreshToken: false } });
        const ch = supa
          .channel("toto-live")
          .on("postgres_changes", { event: "*", schema: "public", table: "settings" }, schedule)
          .on("postgres_changes", { event: "*", schema: "public", table: "teams" }, schedule)
          .on("postgres_changes", { event: "*", schema: "public", table: "matches" }, schedule)
          .subscribe((status) => {
            setLive(status === "SUBSCRIBED");
            if (status === "SUBSCRIBED") schedule();
          });
        cleanup = () => {
          supa.removeChannel(ch);
        };
        if (cancelled) cleanup();
      } catch {
        setLive(false);
      }
    })();

    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      cleanup?.();
      if (debounce) clearTimeout(debounce);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  // 폴링 백업: 실시간 연결 시 60초, 미연결 시 12초. 탭이 숨겨지면 쉼.
  useEffect(() => {
    const id = setInterval(
      () => {
        if (document.visibilityState === "visible") refresh();
      },
      live ? 60_000 : 12_000,
    );
    return () => clearInterval(id);
  }, [live, refresh]);

  return { state, error, live, refresh };
}

export function pct(rate: number): string {
  return `${Math.round(rate * 1000) / 10}%`;
}
