-- Boutiqo Phase 1 schema — file metadata (Cloudflare R2 objects) and shared triggers.

-- ---------------------------------------------------------------------------
-- files (R2 object metadata — binary content lives in R2, never Supabase Storage)
-- ---------------------------------------------------------------------------
create table public.files (
  id uuid primary key default gen_random_uuid(),
  boutique_id uuid not null references public.boutiques (id) on delete cascade,
  kind text not null check (kind in ('boutique_logo', 'cloth_photo')),
  order_id uuid references public.orders (id) on delete cascade,
  object_key text not null unique,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'image/heic')),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 10485760), -- 10MB cap, see docs/decisions.md
  upload_status text not null default 'pending' check (upload_status in ('pending', 'uploaded', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint files_order_id_required_for_kind check (
    (kind = 'cloth_photo' and order_id is not null) or
    (kind = 'boutique_logo' and order_id is null)
  )
);

create index files_boutique_id_idx on public.files (boutique_id);
create index files_order_id_idx on public.files (order_id);

comment on table public.files is 'Metadata for objects stored in Cloudflare R2. object_key is the R2 key; never a public URL.';

-- Now that files exists, wire up the "current file" pointers on boutiques/orders.
alter table public.boutiques
  add constraint boutiques_logo_file_id_fkey foreign key (logo_file_id) references public.files (id) on delete set null;

alter table public.orders
  add constraint orders_cloth_photo_file_id_fkey foreign key (cloth_photo_file_id) references public.files (id) on delete set null;

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger boutiques_set_updated_at before update on public.boutiques
  for each row execute function public.set_updated_at();

create trigger customers_set_updated_at before update on public.customers
  for each row execute function public.set_updated_at();

create trigger orders_set_updated_at before update on public.orders
  for each row execute function public.set_updated_at();

create trigger admins_set_updated_at before update on public.admins
  for each row execute function public.set_updated_at();

create trigger files_set_updated_at before update on public.files
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Race-safe per-boutique order code generation (BQ-####).
-- The UPDATE takes a row lock on the boutique's own row, serializing concurrent
-- order creation for THAT boutique only; other boutiques are unaffected.
-- ---------------------------------------------------------------------------
create or replace function public.generate_order_code(p_boutique_id uuid)
returns text
language plpgsql
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
as $$
begin
  if new.order_code is null or btrim(new.order_code) = '' then
    new.order_code := public.generate_order_code(new.boutique_id);
  end if;
  return new;
end;
$$;

create trigger orders_set_order_code before insert on public.orders
  for each row execute function public.orders_set_order_code();
