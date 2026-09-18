-- Boutiqo Phase 1 — customer tracking token read path (§8).
--
-- Deliberately NOT a broad "anon can SELECT orders" RLS policy: that pattern is easy
-- to get subtly wrong (extra columns leaking, cheap brute-forcing). Instead this is a
-- SECURITY DEFINER function returning only the exact safe columns cust-track needs,
-- called via RPC. It returns the cloth photo's R2 object key so that the trusted
-- Next.js server (never the browser) can mint a short-lived presigned GET URL —
-- the raw key itself is never sent to the client.
--
-- A token that doesn't match any order returns zero rows; the caller (the API route)
-- must turn that into one generic "not found" response, never a distinguishing error.

create or replace function public.get_order_tracking(p_token text)
returns table (
  order_code text,
  garment_type text,
  stage text,
  effective_stage text,
  due_date date,
  total_amount numeric,
  advance_amount numeric,
  balance_amount numeric,
  paid boolean,
  boutique_name text,
  boutique_phone text,
  cloth_object_key text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    o.order_code,
    o.garment_type,
    o.stage,
    case
      when o.stage not in ('ready', 'delivered') and o.due_date < current_date then 'overdue'
      else o.stage
    end as effective_stage,
    o.due_date,
    o.total_amount,
    o.advance_amount,
    (o.total_amount - o.advance_amount) as balance_amount,
    o.paid,
    b.name as boutique_name,
    b.phone as boutique_phone,
    f.object_key as cloth_object_key
  from public.orders o
  join public.boutiques b on b.id = o.boutique_id
  left join public.files f on f.id = o.cloth_photo_file_id and f.upload_status = 'uploaded'
  where o.tracking_token = p_token
    and p_token is not null
    and char_length(p_token) = 64; -- matches the 32-byte hex tokens this app issues
$$;

revoke all on function public.get_order_tracking(text) from public;
grant execute on function public.get_order_tracking(text) to anon, authenticated;

comment on function public.get_order_tracking(text) is
  'Anon-callable. Returns exactly one safe row for a valid tracking token, zero rows otherwise. Never expose more columns here.';
