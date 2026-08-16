-- db/01_schema.sql — run FIRST in the Supabase SQL editor.
--
-- Two tables:
--   pending_reservations  short-lived rows awaiting OTP verification (do NOT count)
--   reservations          verified spots (these count toward the 1,000 cap)
-- We store ip_hash (sha256(ip + salt)), never the raw IP.

create table if not exists pending_reservations (
  email      text primary key,
  code_hash  text        not null,
  ip_hash    text        not null,
  attempts   int         not null default 0,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists pending_ip_hash_idx on pending_reservations (ip_hash);

create table if not exists reservations (
  email      text primary key,
  ip_hash    text        not null,
  created_at timestamptz not null default now()
);
create index if not exists reservations_ip_hash_idx on reservations (ip_hash);

-- Row Level Security ON with NO policies → the anon/public key can do nothing.
-- Only the service-role key (used solely server-side) bypasses RLS. This means
-- even if the anon key leaked, no one could read or write these tables.
alter table pending_reservations enable row level security;
alter table reservations         enable row level security;
