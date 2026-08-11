-- Shift Scheduler — initial schema
-- All access goes through the Next.js server using the secret key, which always
-- bypasses RLS. RLS is enabled on every table anyway, with zero policies, purely
-- as a deny-by-default backstop in case the publishable key ever reaches a client
-- that talks to Supabase directly.

create extension if not exists pgcrypto;

create table workers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  team text not null check (team in ('israeli','serbian')),
  lead text check (lead in ('primary','backup')),
  quota int not null default 5,
  night_cap_override int, -- 2 = this Serbian is locked in as one of the week's 2nd-night people
  excluded boolean not null default false,
  is_admin boolean not null default false,
  pin_hash text not null,
  created_at timestamptz not null default now()
);

create table weeks (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  starts_on date not null,
  created_at timestamptz not null default now()
);

create table availability (
  week_id uuid not null references weeks(id) on delete cascade,
  worker_id uuid not null references workers(id) on delete cascade,
  day text not null check (day in ('Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday')),
  shift_key text not null check (shift_key in ('morning','mid','evening','bridge','deepnight')),
  status text not null default 'can' check (status in ('can','prefer_not','cant')),
  primary key (week_id, worker_id, day, shift_key)
);

create table notes (
  worker_id uuid primary key references workers(id) on delete cascade,
  body text not null default '',
  updated_at timestamptz not null default now()
);

create table schedules (
  week_id uuid primary key references weeks(id) on delete cascade,
  assignments jsonb not null,
  warnings jsonb not null,
  per_worker jsonb not null,
  generated_at timestamptz not null default now()
);

-- Singleton settings row (id is always 1)
create table settings (
  id int primary key default 1 check (id = 1),
  team_note text not null default '',
  current_week_id uuid references weeks(id),
  rules jsonb not null
);
insert into settings (id, rules) values (1, '{
  "morningMin": 3, "morningMax": 5,
  "eveningWeekdayMin": 3, "eveningWeekdayMax": 5,
  "eveningWeekendMin": 4, "eveningWeekendMax": 6,
  "midMin": 1, "bridgeMin": 1, "deepnightMin": 2,
  "defaultQuota": 5, "maxSecondNightSerbians": 2,
  "israeliWeekendSoft": true
}'::jsonb);

create index availability_week_worker_idx on availability(week_id, worker_id);
create index notes_worker_idx on notes(worker_id);

-- Deny-by-default: enabled with no policies, so only the secret key (server-side, bypasses RLS)
-- can read/write. The publishable key gets nothing.
alter table workers enable row level security;
alter table weeks enable row level security;
alter table availability enable row level security;
alter table notes enable row level security;
alter table schedules enable row level security;
alter table settings enable row level security;
