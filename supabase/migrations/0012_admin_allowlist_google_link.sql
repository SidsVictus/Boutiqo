-- Super admins without passwords in code or chat.
--
-- 1. Removes the placeholder dev admins (*@boutiqo.dev) seeded in Phase 1.
-- 2. Adds the real Boutiqo team as owner_admin, by EMAIL ONLY (user_id null).
--    No password is created or stored anywhere.
-- 3. A pending admin row is claimed automatically the first time that exact
--    address signs in with Google, and only when Google itself says the
--    address is verified. Typing someone's email into a password signup form
--    can never claim an admin row: only a verified Google identity can.
--    After that first Google sign-in the admin may also set a password with
--    "Forgot password?" (the reset email goes to that same inbox).
--
-- To add another admin later, insert an email-only row the same way:
--   insert into public.admins (name, email, role) values ('Name', 'x@gmail.com', 'support_admin');

-- 1. Placeholder admins and their auth users (only the four dev admin
--    addresses; boutique-owner accounts are never touched here).
delete from public.admins
where lower(email) in ('admin.owner@boutiqo.dev', 'admin.support@boutiqo.dev', 'admin.billing@boutiqo.dev', 'admin.viewer@boutiqo.dev');

delete from auth.users u
where lower(u.email) in ('admin.owner@boutiqo.dev', 'admin.support@boutiqo.dev', 'admin.billing@boutiqo.dev', 'admin.viewer@boutiqo.dev')
  and not exists (select 1 from public.boutiques b where b.owner_user_id = u.id);

-- 2. The real team (email-only, claimed on first verified Google sign-in).
insert into public.admins (name, email, role, active)
select v.name, v.email, 'owner_admin', true
from (values ('Sids Victus', 'sidsvictus@gmail.com'), ('Boutiqo Help', 'help.boutiqo@gmail.com')) as v(name, email)
where not exists (select 1 from public.admins a where lower(a.email) = lower(v.email));

-- 3. Claim a pending admin row from a verified Google identity.
create or replace function public.claim_admin_from_identity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(new.identity_data ->> 'email');
begin
  if new.provider = 'google'
     and v_email is not null
     and coalesce((new.identity_data ->> 'email_verified')::boolean, false) then
    update public.admins
    set user_id = new.user_id, updated_at = now()
    where lower(email) = v_email
      and user_id is null
      and not exists (select 1 from public.admins other where other.user_id = new.user_id);
  end if;
  return new;
exception when others then
  -- Never let admin linking break sign-in for anyone.
  raise warning 'claim_admin_from_identity skipped: %', sqlerrm;
  return new;
end;
$$;

revoke all on function public.claim_admin_from_identity() from public, anon, authenticated;

drop trigger if exists claim_admin_from_identity on auth.identities;
create trigger claim_admin_from_identity
  after insert or update of identity_data on auth.identities
  for each row execute function public.claim_admin_from_identity();

-- Backfill: someone on the list who already signed in with Google before this
-- migration is linked now, under the same verified-Google rule.
update public.admins a
set user_id = i.user_id, updated_at = now()
from auth.identities i
where a.user_id is null
  and i.provider = 'google'
  and lower(i.identity_data ->> 'email') = lower(a.email)
  and coalesce((i.identity_data ->> 'email_verified')::boolean, false)
  and not exists (select 1 from public.admins other where other.user_id = i.user_id);

comment on function public.claim_admin_from_identity() is
  'Links an email-only admins row to the auth user whose verified Google identity has that email. Password signups can never claim an admin row.';
