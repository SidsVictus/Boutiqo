-- Security audit finding (CRITICAL/HIGH): orders.customer_id only had a bare
-- foreign key to public.customers(id), with no check that the referenced
-- customer actually belongs to the order's own boutique_id. orders_insert's
-- RLS policy only validates boutique_id = current_boutique_id() — it never
-- looks at customer_id at all. A boutique owner (or a support/viewer admin
-- reusing customer_id from a request they observed) could create an order in
-- their OWN boutique that references ANOTHER boutique's customer row,
-- permanently exposing that customer's name/phone/address/instagram_handle
-- inside the attacking boutique's own order list and order-detail views.
--
-- Reproduced live against the project during this audit: as owner1
-- (authenticated, RLS-scoped), inserted an order with boutique_id = owner1's
-- own boutique but customer_id = owner2's customer row — it succeeded. The
-- test row was deleted and boutiques.order_seq restored immediately after.
--
-- Fixed with a BEFORE INSERT OR UPDATE trigger that raises unless the
-- customer's boutique_id matches the order's own boutique_id. A trigger
-- (not just a CHECK constraint) is required because the comparison needs a
-- cross-table lookup, which plain CHECK constraints cannot express.

create or replace function public.enforce_order_customer_same_boutique()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_boutique_id uuid;
begin
  select boutique_id into v_customer_boutique_id
  from public.customers
  where id = new.customer_id;

  if v_customer_boutique_id is distinct from new.boutique_id then
    raise exception 'customer_id does not belong to this boutique' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_order_customer_same_boutique() from public, anon, authenticated;

create trigger orders_enforce_customer_same_boutique
  before insert or update of customer_id, boutique_id on public.orders
  for each row execute function public.enforce_order_customer_same_boutique();
