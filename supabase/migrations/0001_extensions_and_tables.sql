-- Boutiqo Phase 1 schema — extensions and core tables.
-- See docs/decisions.md for the rationale behind ambiguous modelling choices
-- (overdue as derived status, per-boutique order numbering, boutique status effects,
-- parallel boutique-creation paths, and the billing_admin role's current scope).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- boutiques (the tenant)
-- ---------------------------------------------------------------------------
create table public.boutiques (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid unique references auth.users (id) on delete set null,
  name text not null check (char_length(btrim(name)) > 0),
  area text,
  owner_name text not null check (char_length(btrim(owner_name)) > 0),
  email text not null check (char_length(btrim(email)) > 0),
  phone text,
  gst_number text,
  category text not null check (char_length(btrim(category)) > 0),
  status text not null default 'active' check (status in ('active', 'on_hold', 'disabled')),
  terms_tnc_accepted boolean not null default false,
  terms_privacy_accepted boolean not null default false,
  terms_accepted_at timestamptz,
  -- Row-locked counter backing the per-boutique BQ-#### order code sequence (see generate_order_code()).
  order_seq integer not null default 0,
  logo_file_id uuid, -- FK to files(id) added after files exists (0002)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index boutiques_email_key on public.boutiques (lower(email));
create index boutiques_name_idx on public.boutiques (lower(name));
create index boutiques_area_idx on public.boutiques (lower(area));
create index boutiques_owner_name_idx on public.boutiques (lower(owner_name));
create index boutiques_status_idx on public.boutiques (status);

comment on table public.boutiques is 'One row per tenant boutique. 1:1 with an auth.users owner for V1.';
comment on column public.boutiques.order_seq is 'Row-locked counter; next order code = BQ- + lpad(order_seq+1, 4, 0). Never edit directly.';

-- ---------------------------------------------------------------------------
-- customers (a boutique's own customer — never authenticates)
-- ---------------------------------------------------------------------------
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  boutique_id uuid not null references public.boutiques (id) on delete cascade,
  name text not null check (char_length(btrim(name)) > 0),
  phone text,
  address text,
  instagram_handle text,
  customer_since date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index customers_boutique_id_idx on public.customers (boutique_id);
create index customers_boutique_name_idx on public.customers (boutique_id, lower(name));
create index customers_boutique_phone_idx on public.customers (boutique_id, phone);

-- ---------------------------------------------------------------------------
-- orders
-- ---------------------------------------------------------------------------
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  -- Denormalized onto the order directly (not only reachable via customers) so every
  -- RLS policy and index can scope on boutique_id without a join through customers.
  boutique_id uuid not null references public.boutiques (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete restrict,
  order_code text not null,
  garment_type text not null check (char_length(btrim(garment_type)) > 0),
  garment_type_other text,
  -- Stored stage is only ever one of the five real stages. "Overdue" is derived at
  -- read time from (stage, due_date) — see decision #1 in docs/decisions.md.
  stage text not null default 'received' check (stage in ('received', 'cutting', 'stitching', 'ready', 'delivered')),
  due_date date not null,
  total_amount numeric(10, 2) not null default 0 check (total_amount >= 0),
  advance_amount numeric(10, 2) not null default 0 check (advance_amount >= 0 and advance_amount <= total_amount),
  paid boolean not null default false,
  tailor_name text,
  cloth_description text,
  style_notes text,
  cloth_photo_file_id uuid, -- FK to files(id) added after files exists (0002)

  -- 14-field measurement guide (see CLAUDE_CODE_HANDOFF.md §"changes after first implementation").
  -- Structured, named, nullable numeric(4,1) columns: chosen over a jsonb blob because the field
  -- set is fixed and finalized in the design, and named columns give per-field type/range
  -- constraints and make future reporting/analytics trivial. See docs/decisions.md.
  m01_blouse_back_length numeric(4, 1) check (m01_blouse_back_length is null or (m01_blouse_back_length >= 0 and m01_blouse_back_length < 200)),
  m02_full_shoulder_width numeric(4, 1) check (m02_full_shoulder_width is null or (m02_full_shoulder_width >= 0 and m02_full_shoulder_width < 200)),
  m03_shoulder_strap numeric(4, 1) check (m03_shoulder_strap is null or (m03_shoulder_strap >= 0 and m03_shoulder_strap < 200)),
  m04_sleeve_length numeric(4, 1) check (m04_sleeve_length is null or (m04_sleeve_length >= 0 and m04_sleeve_length < 200)),
  m05_sleeve_round numeric(4, 1) check (m05_sleeve_round is null or (m05_sleeve_round >= 0 and m05_sleeve_round < 200)),
  m06_arm_round numeric(4, 1) check (m06_arm_round is null or (m06_arm_round >= 0 and m06_arm_round < 200)),
  m07_armhole_around numeric(4, 1) check (m07_armhole_around is null or (m07_armhole_around >= 0 and m07_armhole_around < 200)),
  m08_back_neck_depth numeric(4, 1) check (m08_back_neck_depth is null or (m08_back_neck_depth >= 0 and m08_back_neck_depth < 200)),
  m09_front_neck_depth numeric(4, 1) check (m09_front_neck_depth is null or (m09_front_neck_depth >= 0 and m09_front_neck_depth < 200)),
  m10_chest_around numeric(4, 1) check (m10_chest_around is null or (m10_chest_around >= 0 and m10_chest_around < 200)),
  m11_bust_around numeric(4, 1) check (m11_bust_around is null or (m11_bust_around >= 0 and m11_bust_around < 200)),
  m12_waist_around numeric(4, 1) check (m12_waist_around is null or (m12_waist_around >= 0 and m12_waist_around < 200)),
  m13_shoulders_to_apex numeric(4, 1) check (m13_shoulders_to_apex is null or (m13_shoulders_to_apex >= 0 and m13_shoulders_to_apex < 200)),
  m14_front_length numeric(4, 1) check (m14_front_length is null or (m14_front_length >= 0 and m14_front_length < 200)),

  -- Bearer credential for the no-login customer tracking page (§8). 32 random bytes hex-encoded
  -- = 256 bits of entropy — brute-forcing is not a practical concern.
  tracking_token text not null unique default encode(gen_random_bytes(32), 'hex'),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint orders_boutique_order_code_key unique (boutique_id, order_code)
);

create index orders_boutique_id_idx on public.orders (boutique_id);
create index orders_customer_id_idx on public.orders (customer_id);
create index orders_boutique_stage_idx on public.orders (boutique_id, stage);
create index orders_boutique_due_date_idx on public.orders (boutique_id, due_date);
-- tracking_token already has a unique index from the UNIQUE constraint.

comment on column public.orders.stage is 'One of the 5 real stages only. Overdue is derived — never stored.';
comment on column public.orders.tracking_token is 'Unguessable per-order bearer token for the anon customer tracking page.';

-- ---------------------------------------------------------------------------
-- admins (internal Super Admin team — seeded, not self-service)
-- ---------------------------------------------------------------------------
create table public.admins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users (id) on delete set null,
  name text not null check (char_length(btrim(name)) > 0),
  email text not null,
  role text not null check (role in ('owner_admin', 'support_admin', 'billing_admin', 'viewer')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index admins_email_key on public.admins (lower(email));

comment on table public.admins is 'Internal Super Admin team. Seeded only — no self-service signup in V1.';
comment on column public.admins.role is 'Permission scope is derived from this role in application code, not stored per-row.';
