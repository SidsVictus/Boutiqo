-- Boutiqo — any number of cloth photos per order, no per-file size cap.
--
-- 1. files.size_bytes: drop the 10 MB ceiling set in 0002 (photos go straight
--    from the browser to R2, never through the app server). A file still has
--    to be a positive number of bytes.
-- 2. get_order_tracking(): also return every uploaded cloth photo's object key
--    (oldest first) as cloth_object_keys. cloth_object_key is kept, now the
--    first of those, so the tracking route that is deployed today keeps working
--    until the new one is live. The function is dropped and re-created because
--    Postgres cannot change a function's result columns in place.
--
-- orders.cloth_photo_file_id stays as the order's "cover" (the first photo);
-- the photos themselves are the public.files rows with that order_id.

alter table public.files drop constraint if exists files_size_bytes_check;
alter table public.files add constraint files_size_bytes_check check (size_bytes > 0);

drop function if exists public.get_order_tracking(text);

create function public.get_order_tracking(p_token text)
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
  cloth_object_key text,
  cloth_object_keys text[]
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
    p.keys[1] as cloth_object_key,
    coalesce(p.keys, '{}'::text[]) as cloth_object_keys
  from public.orders o
  join public.boutiques b on b.id = o.boutique_id
  left join lateral (
    select array_agg(f.object_key order by f.created_at, f.id) as keys
    from public.files f
    where f.order_id = o.id
      and f.kind = 'cloth_photo'
      and f.upload_status = 'uploaded'
  ) p on true
  where o.tracking_token = p_token
    and p_token is not null
    and char_length(p_token) = 64; -- matches the 32-byte hex tokens this app issues
$$;

revoke all on function public.get_order_tracking(text) from public;
grant execute on function public.get_order_tracking(text) to anon, authenticated;

comment on function public.get_order_tracking(text) is
  'Anon-callable. Returns exactly one safe row for a valid tracking token, zero rows otherwise. Never expose more columns here.';
