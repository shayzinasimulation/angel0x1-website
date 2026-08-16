-- db/02_reserve_rpc.sql — run SECOND in the Supabase SQL editor.
--
-- reserve_spot() performs the global-cap check, the per-IP-cap check, the insert,
-- and the pending-row cleanup in ONE transaction, so two concurrent verifications
-- cannot both slip past the caps (no race). Returns a typed status string.

create or replace function reserve_spot(p_email text, p_ip_hash text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare total int; per_ip int;
begin
  select count(*) into total from reservations;
  if total >= 1000 then return 'full'; end if;

  select count(*) into per_ip from reservations where ip_hash = p_ip_hash;
  if per_ip >= 3 then return 'ip_capped'; end if;

  insert into reservations(email, ip_hash) values (p_email, p_ip_hash);
  delete from pending_reservations where email = p_email;
  return 'ok';
exception when unique_violation then
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
