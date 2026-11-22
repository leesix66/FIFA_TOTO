-- FIFA TOTO · Supabase schema
-- Supabase 대시보드 > SQL Editor 에 전체를 붙여넣고 Run 하세요. 여러 번 실행해도 안전합니다.

create extension if not exists pgcrypto;

-- 1) 운영 설정 (단일 행)
create table if not exists public.settings (
  id               int primary key default 1 check (id = 1),
  title            text not null default '사내 FIFA 대회 토토',
  status           text not null default 'ready' check (status in ('ready', 'open', 'closed')),
  revealed         boolean not null default false,
  third_place      boolean not null default false,
  draw             jsonb not null default '[]'::jsonb,   -- 1라운드 슬롯 순서 (team id 또는 null = 부전승)
  max_participants int not null default 500,
  updated_at       timestamptz not null default now()
);
insert into public.settings (id) values (1) on conflict (id) do nothing;

-- 2) 팀 (최대 16개, 서버에서 제한)
create table if not exists public.teams (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(name) between 1 and 40),
  created_at timestamptz not null default now()
);

-- 3) 경기별 설정 + 결과. key = '<라운드>-<인덱스>' (예: '1-0'), 3·4위전 = '3P'
create table if not exists public.matches (
  key            text primary key,
  mode           text not null default 'winner' check (mode in ('winner', 'score')),
  winner_team_id uuid references public.teams(id) on delete set null,
  winner_score   int check (winner_score between 0 and 99),
  loser_score    int check (loser_score between 0 and 99),
  updated_at     timestamptz not null default now()
);

-- 4) 참여자. picks = { "<match key>": { "w": "<team id>", "ws": 2, "ls": 1 } }
create table if not exists public.participants (
  id            uuid primary key default gen_random_uuid(),
  dept          text not null check (char_length(dept) between 1 and 40),
  name          text not null check (char_length(name) between 1 and 30),
  ident         text not null unique,            -- 공백 제거·소문자 '부서|이름' (중복 참여 방지)
  pin_hash      text not null,
  picks         jsonb not null default '{}'::jsonb,
  failed_logins int not null default 0,
  locked_until  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- 5) 순위 계산: 승패 적중 1점 + (스코어 경기) 정확한 스코어 적중 시 +1점
create or replace function public.leaderboard()
returns table (id uuid, dept text, name text, hits int, exact int, decided int, picked int)
language sql stable security definer set search_path = public as $$
  with r as (
    select key, winner_team_id::text as w, winner_score, loser_score, mode
    from matches where winner_team_id is not null
  )
  select p.id, p.dept, p.name,
    (count(r.key) filter (where p.picks -> r.key ->> 'w' = r.w))::int as hits,
    (count(r.key) filter (
      where r.mode = 'score' and r.winner_score is not null
        and p.picks -> r.key ->> 'w' = r.w
        and p.picks -> r.key -> 'ws' = to_jsonb(r.winner_score)
        and p.picks -> r.key -> 'ls' = to_jsonb(r.loser_score)
    ))::int as exact,
    (select count(*) from r)::int as decided,
    (select count(*) from jsonb_object_keys(p.picks))::int as picked
  from participants p
  left join r on true
  group by p.id;
$$;

-- 6) 경기별 예측 분포 (공개 이후 사용)
create or replace function public.pick_stats()
returns table (match_key text, team_id text, cnt int)
language sql stable security definer set search_path = public as $$
  select x.key, x.value ->> 'w', count(*)::int
  from participants p, jsonb_each(p.picks) as x(key, value)
  where x.value ->> 'w' is not null
  group by x.key, x.value ->> 'w';
$$;

revoke all on function public.leaderboard() from public, anon, authenticated;
revoke all on function public.pick_stats() from public, anon, authenticated;

-- 7) RLS: 공개 정보(설정·팀·경기)만 읽기 허용. 참여자 테이블은 서버(service role)만 접근.
alter table public.settings     enable row level security;
alter table public.teams        enable row level security;
alter table public.matches      enable row level security;
alter table public.participants enable row level security;

drop policy if exists "public read settings" on public.settings;
drop policy if exists "public read teams"    on public.teams;
drop policy if exists "public read matches"  on public.matches;
create policy "public read settings" on public.settings for select using (true);
create policy "public read teams"    on public.teams    for select using (true);
create policy "public read matches"  on public.matches  for select using (true);

-- 8) 실시간 반영: 설정/팀/경기 변경을 브라우저에 푸시
do $$
declare t text;
begin
  foreach t in array array['settings', 'teams', 'matches'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
