-- Phase 3 integration finding: admins_select's USING clause is `is_admin()`,
-- and is_admin() itself only returns true for an ACTIVE admin — so a
-- suspended admin's own row is invisible to them under plain RLS. That's
-- fine for the admin roster (no reason a suspended admin should see anyone
-- else's row either), but it means the app has no way to distinguish
-- "you're suspended" from "you were never an admin" for the suspended-admin
-- login UI state Phase 2 already built. This adds a narrow, additive
-- SECURITY DEFINER function that returns ONLY the calling user's own admin
-- row (active or not) — same safety property as current_admin_role()/
-- is_admin() (never any other user's data), just without the active-only
-- filter. No existing policy, trigger, or table is changed.

create or replace function public.current_admin_self()
returns table (
  id uuid,
  name text,
  email text,
  role text,
  active boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select id, name, email, role, active
  from public.admins
  where user_id = auth.uid();
$$;

revoke all on function public.current_admin_self() from public, anon;
grant execute on function public.current_admin_self() to authenticated;

comment on function public.current_admin_self() is
  'Returns the calling user''s own admin row regardless of active status (unlike admins_select RLS / is_admin()), so the app can distinguish "suspended" from "not an admin" at login. Never returns another user''s row.';
