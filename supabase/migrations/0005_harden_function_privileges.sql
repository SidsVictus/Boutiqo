-- Lock down search_path on all SECURITY DEFINER / trigger functions (prevents search_path
-- hijacking) and ensure trigger-only functions are not directly callable via PostgREST RPC.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.generate_order_code(p_boutique_id uuid)
returns text
language plpgsql
set search_path = public
as $$
declare
  v_seq integer;
begin
  update public.boutiques
  set order_seq = order_seq + 1
  where id = p_boutique_id
  returning order_seq into v_seq;

  if v_seq is null then
    raise exception 'Boutique % not found', p_boutique_id using errcode = 'P0002';
  end if;

  return 'BQ-' || lpad(v_seq::text, 4, '0');
end;
$$;

create or replace function public.orders_set_order_code()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.order_code is null or btrim(new.order_code) = '' then
    new.order_code := public.generate_order_code(new.boutique_id);
  end if;
  return new;
end;
$$;

-- Trigger-only functions: revoke direct callability entirely. Postgres invokes trigger
-- functions regardless of EXECUTE grants, so removing them is safe and closes off the
-- /rest/v1/rpc/enforce_* endpoints PostgREST would otherwise expose.
revoke all on function public.enforce_boutique_update_rules() from public, anon, authenticated;
revoke all on function public.enforce_admin_update_rules() from public, anon, authenticated;
revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.orders_set_order_code() from public, anon, authenticated;
revoke all on function public.generate_order_code(uuid) from public, anon, authenticated;

-- Belt-and-suspenders: re-affirm the intended grants on the RPC helper functions
-- (owner/admin identity lookups authenticated users need; anon must never call these).
revoke all on function public.current_boutique_id() from public, anon;
revoke all on function public.current_boutique_status() from public, anon;
revoke all on function public.is_admin() from public, anon;
revoke all on function public.current_admin_role() from public, anon;
grant execute on function public.current_boutique_id() to authenticated;
grant execute on function public.current_boutique_status() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.current_admin_role() to authenticated;

-- get_order_tracking is INTENTIONALLY callable by anon (that is the entire point of the
-- no-login customer tracking page) — left as-is, flagged in the security review as expected.
