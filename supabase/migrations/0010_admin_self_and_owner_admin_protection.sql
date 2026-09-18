-- Two protections on public.admins that RLS alone can't express.
--
-- 1. An admin may never change their OWN active flag. This closes a real,
--    unrecoverable deadlock: admins_update requires an *active* owner_admin
--    (is_admin() filters on active = true), so an owner_admin who suspended
--    themselves immediately lost the only permission that could undo it —
--    and since no other role may write this table at all, the entire admin
--    console became permanently unmanageable. Hit for real while testing.
--
-- 2. owner_admin is the top role: only another owner_admin may modify an
--    owner_admin row. Today admins_update already restricts every write to
--    owner_admin, so this is defense in depth — but it states the intent
--    explicitly and survives any future loosening of that policy.
--
-- An owner_admin may still act on OTHER owner_admins. Combined with rule 1
-- that guarantees at least one active owner_admin always remains: you must be
-- an active owner_admin to suspend anyone, and you can never be the one you
-- suspend.

create or replace function public.enforce_admin_update_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
begin
  if new.role <> old.role then
    raise exception 'Admin role changes are not supported in V1' using errcode = '42501';
  end if;
  if new.email <> old.email then
    raise exception 'Admin email changes are not supported in V1' using errcode = '42501';
  end if;

  -- Both rules below apply only to a real end-user session. A null auth.uid()
  -- is the service role or a direct server-side script (seeding, support
  -- recovery) which deliberately bypassed RLS to get here — the same carve-out
  -- the boutiques trigger makes for system-driven writes.
  if v_actor is not null then
    if new.active is distinct from old.active and old.user_id = v_actor then
      raise exception 'Admins cannot change their own status' using errcode = '42501';
    end if;

    if old.role = 'owner_admin' and public.current_admin_role() is distinct from 'owner_admin' then
      raise exception 'Only an owner admin can modify an owner admin' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_admin_update_rules() from public, anon, authenticated;
