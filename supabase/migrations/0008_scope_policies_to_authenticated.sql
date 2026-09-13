-- Bug found during testing: none of the owner/admin policies specified `TO authenticated`,
-- so Postgres also evaluated them for the anon role, which then hit "permission denied for
-- function current_boutique_id" (anon is intentionally not granted EXECUTE on that helper)
-- instead of the clean, silent "0 rows" a properly-scoped policy produces. Anon's only
-- sanctioned path is the get_order_tracking() RPC — recreate every policy scoped to
-- `authenticated` so anon never evaluates them at all.

drop policy boutiques_select on public.boutiques;
drop policy boutiques_update on public.boutiques;
create policy boutiques_select on public.boutiques
  for select to authenticated
  using (owner_user_id = auth.uid() or public.is_admin());
create policy boutiques_update on public.boutiques
  for update to authenticated
  using (owner_user_id = auth.uid() or (public.is_admin() and public.current_admin_role() <> 'viewer'))
  with check (owner_user_id = auth.uid() or (public.is_admin() and public.current_admin_role() <> 'viewer'));

drop policy customers_select on public.customers;
drop policy customers_insert on public.customers;
drop policy customers_update on public.customers;
create policy customers_select on public.customers
  for select to authenticated
  using (
    (boutique_id = public.current_boutique_id() and public.current_boutique_status() <> 'disabled')
    or public.is_admin()
  );
create policy customers_insert on public.customers
  for insert to authenticated
  with check (
    boutique_id = public.current_boutique_id()
    and public.current_boutique_status() in ('active', 'on_hold')
  );
create policy customers_update on public.customers
  for update to authenticated
  using (
    boutique_id = public.current_boutique_id()
    and public.current_boutique_status() in ('active', 'on_hold')
  )
  with check (boutique_id = public.current_boutique_id());

drop policy orders_select on public.orders;
drop policy orders_insert on public.orders;
drop policy orders_update on public.orders;
create policy orders_select on public.orders
  for select to authenticated
  using (
    (boutique_id = public.current_boutique_id() and public.current_boutique_status() <> 'disabled')
    or public.is_admin()
  );
create policy orders_insert on public.orders
  for insert to authenticated
  with check (
    boutique_id = public.current_boutique_id()
    and public.current_boutique_status() = 'active'
  );
create policy orders_update on public.orders
  for update to authenticated
  using (
    boutique_id = public.current_boutique_id()
    and public.current_boutique_status() in ('active', 'on_hold')
  )
  with check (boutique_id = public.current_boutique_id());

drop policy admins_select on public.admins;
drop policy admins_update on public.admins;
create policy admins_select on public.admins
  for select to authenticated
  using (public.is_admin());
create policy admins_update on public.admins
  for update to authenticated
  using (public.is_admin() and public.current_admin_role() = 'owner_admin')
  with check (public.is_admin() and public.current_admin_role() = 'owner_admin');

drop policy files_select on public.files;
drop policy files_insert on public.files;
drop policy files_update on public.files;
create policy files_select on public.files
  for select to authenticated
  using (
    (boutique_id = public.current_boutique_id() and public.current_boutique_status() <> 'disabled')
    or public.is_admin()
  );
create policy files_insert on public.files
  for insert to authenticated
  with check (
    boutique_id = public.current_boutique_id()
    and public.current_boutique_status() <> 'disabled'
  );
create policy files_update on public.files
  for update to authenticated
  using (
    boutique_id = public.current_boutique_id()
    and public.current_boutique_status() <> 'disabled'
  )
  with check (boutique_id = public.current_boutique_id());
