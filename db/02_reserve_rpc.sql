-- db/02_reserve_rpc.sql — run SECOND in the Supabase SQL editor.
--
-- reserve_spot() takes a transaction-level advisory lock, then checks the global cap
-- and the per-IP cap, inserts, and clears the pending row. The advisory lock serializes
-- all reservations so the cap checks are truly race-free — plain `select count(*)` under
-- READ COMMITTED does NOT block a concurrent insert, so without the lock two callers could
-- both read 999 and both insert. Reservation is a rare, low-throughput event, so the lock
-- has no meaningful cost. Returns a typed status string.

create or replace function reserve_spot(p_email text, p_ip_hash text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare total int; per_ip int;
begin
  -- serialize all reservations (single well-known lock key) so cap checks are atomic
  perform pg_advisory_xact_lock(hashtext('angel0x1_reserve_spot'));

  select count(*) into total from reservations;
  -- NOTE: 1000 = the global waitlist cap. This is the AUTHORITATIVE enforcement; it must be
  -- kept in sync with WAITLIST_CAP in the app env (src/lib/env.ts, used for the pre-check +
  -- counter). Changing the env var alone does NOT change this — edit both, or parameterize.
  if total >= 1000 then return 'full'; end if;

  select count(*) into per_ip from reservations where ip_hash = p_ip_hash;
  -- 3 = per-IP cap; must match IP_CLAIM_CAP in src/lib/env.ts (same sync caveat as above).
  if per_ip >= 3 then return 'ip_capped'; end if;

  insert into reservations(email, ip_hash) values (p_email, p_ip_hash);
  delete from pending_reservations where email = p_email;
  return 'ok';
exception when unique_violation then
  -- already reserved (email PK). Clear any lingering pending row so a used code
  -- can't be replayed and we don't keep re-sending confirmations.
  delete from pending_reservations where email = p_email;
  return 'duplicate';
end $$;

-- bump_attempts() atomically increments and returns the verify-attempt counter
-- for a pending row, so a brute-forcer can't reset it by racing.
create or replace function bump_attempts(p_email text)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare n int;
begin
  update pending_reservations set attempts = attempts + 1
    where email = p_email
    returning attempts into n;
  return coalesce(n, 0);
end $$;

-- ── Lock these DEFINER functions down ────────────────────────────────────────
-- They run as the owner and BYPASS Row Level Security, and PostgREST exposes public-
-- schema functions at /rest/v1/rpc/<name>. Postgres grants EXECUTE to PUBLIC by default,
-- so without this REVOKE anyone holding the (public-by-design) anon key could call
-- reserve_spot directly — supplying their own p_ip_hash — and bypass the OTP flow and the
-- per-IP cap entirely. The app calls these ONLY with the service-role key, which bypasses
-- these grants, so revoking has zero functional impact and makes abuse impossible by
-- construction rather than "safe only while the anon key stays secret".
revoke execute on function reserve_spot(text, text) from anon, authenticated, public;
revoke execute on function bump_attempts(text)      from anon, authenticated, public;
