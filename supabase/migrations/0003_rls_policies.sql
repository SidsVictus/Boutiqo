-- Boutiqo Phase 1 — Row Level Security.
-- Every tenant/order/customer/admin/file table has RLS enabled with default-deny;
-- policies below are the only way in. See docs/decisions.md for the boutique-status
-- effect matrix and the admin sub-role permission matrix these policies implement.

-- ---------------------------------------------------------------------------
-- Helper functions (SECURITY DEFINER so they can look past RLS to answer
-- narrow, safe questions about the CALLING user only — never arbitrary rows).
-- ---------------------------------------------------------------------------

create or replace function public.current_boutique_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.boutiques where owner_user_id = auth.uid();
$$;

create or replace function public.current_boutique_status()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select status from public.boutiques where owner_user_id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admins where user_id = auth.uid() and active = true
  );
$$;

create or replace function public.current_admin_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.admins where user_id = auth.uid() and active = true;
$$;

revoke all on function public.current_boutique_id() from public;
revoke all on function public.current_boutique_status() from public;
revoke all on function public.is_admin() from public;
revoke all on function public.current_admin_role() from public;
grant execute on function public.current_boutique_id() to authenticated;
grant execute on function public.current_boutique_status() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.current_admin_role() to authenticated;

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere.
-- ---------------------------------------------------------------------------
alter table public.boutiques enable row level security;
alter table public.customers enable row level security;
alter table public.orders enable row level security;
alter table public.admins enable row level security;
alter table public.files enable row level security;

-- ---------------------------------------------------------------------------
-- boutiques
-- Owner: SELECT/UPDATE own row only (creation is via signup+registration or
-- admin-add, both server-side with the service role — never a direct owner INSERT).
-- Admin: SELECT all; UPDATE gated further by the trigger below (role + status-
-- transition rules); viewer admins get read-only via the trigger raising on write.
-- ---------------------------------------------------------------------------
create policy boutiques_select on public.boutiques
  for select
  using (owner_user_id = auth.uid() or public.is_admin());

create policy boutiques_update on public.boutiques
  for update
  using (owner_user_id = auth.uid() or (public.is_admin() and public.current_admin_role() <> 'viewer'))
  with check (owner_user_id = auth.uid() or (public.is_admin() and public.current_admin_role() <> 'viewer'));

-- No INSERT/DELETE policy for anyone: both creation paths (owner self-signup,
-- admin-add) go through server code using the service-role key, which bypasses RLS
-- by design after its own application-level checks.

-- Enforce the admin sub-role / status-transition rules from docs/decisions.md that
-- RLS alone can't express (per-column, per-transition logic).
create or replace function public.enforce_boutique_update_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  if public.is_admin() then
    v_role := public.current_admin_role();
    if v_role = 'viewer' then
      raise exception 'Viewer admins have read-only access' using errcode = '42501';
    end if;
    if new.status <> old.status then
      if v_role = 'billing_admin' then
        raise exception 'Billing admins cannot change boutique status' using errcode = '42501';
      end if;
      if v_role = 'support_admin' and new.status = 'disabled' then
        raise exception 'Support admins cannot disable a boutique' using errcode = '42501';
      end if;
    end if;
  else
    -- Acting as the boutique's own owner.
    if new.status <> old.status then
      raise exception 'Boutique owners cannot change their own account status' using errcode = '42501';
    end if;
    if new.owner_user_id is distinct from old.owner_user_id then
      raise exception 'Cannot reassign boutique ownership' using errcode = '42501';
    end if;
    if new.order_seq <> old.order_seq then
      raise exception 'order_seq is managed by the system' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger boutiques_enforce_update_rules before update on public.boutiques
  for each row execute function public.enforce_boutique_update_rules();

-- ---------------------------------------------------------------------------
-- customers
-- Owner: full CRUD on their own boutique's customers, except while disabled
-- (blocks everything) — INSERT/UPDATE additionally blocked while on_hold is NOT
-- required by the spec (only new ORDERS are blocked on hold), so customer writes
-- are allowed for active/on_hold, blocked only for disabled.
-- Admin: read-only (no evidence admins need to write a tenant's customers).
-- ---------------------------------------------------------------------------
create policy customers_select on public.customers
  for select
  using (
    (boutique_id = public.current_boutique_id() and public.current_boutique_status() <> 'disabled')
    or public.is_admin()
  );

create policy customers_insert on public.customers
  for insert
  with check (
    boutique_id = public.current_boutique_id()
    and public.current_boutique_status() in ('active', 'on_hold')
  );

create policy customers_update on public.customers
  for update
  using (
    boutique_id = public.current_boutique_id()
    and public.current_boutique_status() in ('active', 'on_hold')
  )
  with check (boutique_id = public.current_boutique_id());

-- No DELETE policy: no delete-customer flow is evidenced in the design.

-- ---------------------------------------------------------------------------
-- orders
-- Owner: SELECT/UPDATE their own boutique's orders while not disabled; INSERT
-- (creating a new order) only while status = 'active' (on_hold blocks new orders,
-- per the default resolution of open question #3 in docs/decisions.md).
-- Admin: read-only.
-- ---------------------------------------------------------------------------
create policy orders_select on public.orders
  for select
  using (
    (boutique_id = public.current_boutique_id() and public.current_boutique_status() <> 'disabled')
    or public.is_admin()
  );

create policy orders_insert on public.orders
  for insert
  with check (
    boutique_id = public.current_boutique_id()
    and public.current_boutique_status() = 'active'
  );

create policy orders_update on public.orders
  for update
  using (
    boutique_id = public.current_boutique_id()
    and public.current_boutique_status() in ('active', 'on_hold')
  )
  with check (boutique_id = public.current_boutique_id());

-- No DELETE policy: no delete-order flow is evidenced in the design.

-- ---------------------------------------------------------------------------
-- admins
-- Any active admin can view the roster. Only owner_admin can write it
-- (suspend/reactivate is the only evidenced write; no self-service invite flow).
-- ---------------------------------------------------------------------------
create policy admins_select on public.admins
  for select
  using (public.is_admin());

create policy admins_update on public.admins
  for update
  using (public.is_admin() and public.current_admin_role() = 'owner_admin')
  with check (public.is_admin() and public.current_admin_role() = 'owner_admin');

-- No INSERT/DELETE policy: admins are seeded via the service role, not self-service.

create or replace function public.enforce_admin_update_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role <> old.role then
    raise exception 'Admin role changes are not supported in V1' using errcode = '42501';
  end if;
  if new.email <> old.email then
    raise exception 'Admin email changes are not supported in V1' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger admins_enforce_update_rules before update on public.admins
  for each row execute function public.enforce_admin_update_rules();

-- ---------------------------------------------------------------------------
-- files (R2 object metadata)
-- Owner: full CRUD scoped to their own boutique, blocked while disabled.
-- Admin: read-only, mirroring the parent entity's visibility.
-- ---------------------------------------------------------------------------
create policy files_select on public.files
  for select
  using (
    (boutique_id = public.current_boutique_id() and public.current_boutique_status() <> 'disabled')
    or public.is_admin()
  );

create policy files_insert on public.files
  for insert
  with check (
    boutique_id = public.current_boutique_id()
    and public.current_boutique_status() <> 'disabled'
  );

create policy files_update on public.files
  for update
  using (
    boutique_id = public.current_boutique_id()
    and public.current_boutique_status() <> 'disabled'
  )
  with check (boutique_id = public.current_boutique_id());
