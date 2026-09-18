-- Bug found during testing: generate_order_code() increments boutiques.order_seq via
-- a plain UPDATE, which re-enters enforce_boutique_update_rules() (the trigger meant to
-- stop owners/admins editing order_seq directly through the API) and always rejected it,
-- since no session running that internal UPDATE is ever "the owner" or "an admin" of
-- that row. Narrow the guard to only block changes that AREN'T the one legitimate
-- +1 increment generate_order_code() performs.

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
    if new.status <> old.status then
      raise exception 'Boutique owners cannot change their own account status' using errcode = '42501';
    end if;
    if new.owner_user_id is distinct from old.owner_user_id then
      raise exception 'Cannot reassign boutique ownership' using errcode = '42501';
    end if;
  end if;

  -- order_seq may only ever move forward by exactly 1 (generate_order_code's own
  -- increment) — true regardless of who/what triggered the surrounding UPDATE.
  if new.order_seq <> old.order_seq and new.order_seq <> old.order_seq + 1 then
    raise exception 'order_seq is managed by the system' using errcode = '42501';
  end if;

  return new;
end;
$$;
