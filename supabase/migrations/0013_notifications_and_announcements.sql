-- Notifications (activity log) and admin announcements.
--
-- notifications: short activity entries written ONLY by the triggers below
--   (clients can read their own, never write). audience 'boutique' entries
--   belong to one boutique; audience 'admins' entries are for the admin team.
-- announcements: posted by owner/support admins, shown to every boutique
--   (and admins) in the same bell. Title in the list, body when opened.
-- notification_reads: per-user "seen up to" time for the unread badge.
--
-- Trigger functions swallow their own errors: a failed log line must never
-- block saving a customer or an order.

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  audience text not null check (audience in ('boutique', 'admins')),
  boutique_id uuid references public.boutiques (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  link text check (link is null or link like '/%'),
  created_at timestamptz not null default now(),
  check (audience = 'admins' or boutique_id is not null)
);
create index notifications_boutique_idx on public.notifications (boutique_id, created_at desc);
create index notifications_admins_idx on public.notifications (audience, created_at desc);

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index announcements_created_idx on public.announcements (created_at desc);

create table public.notification_reads (
  user_id uuid primary key references auth.users (id) on delete cascade,
  last_seen_at timestamptz not null default now()
);

alter table public.notifications enable row level security;
alter table public.announcements enable row level security;
alter table public.notification_reads enable row level security;

create policy notifications_select on public.notifications
  for select to authenticated
  using (
    (audience = 'boutique' and boutique_id = public.current_boutique_id() and public.current_boutique_status() <> 'disabled')
    or (audience = 'admins' and public.is_admin())
  );

create policy announcements_select on public.announcements
  for select to authenticated
  using (public.current_boutique_id() is not null or public.is_admin());

create policy announcements_insert on public.announcements
  for insert to authenticated
  with check (
    public.is_admin()
    and public.current_admin_role() in ('owner_admin', 'support_admin')
    and created_by = auth.uid()
  );

create policy notification_reads_own on public.notification_reads
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

revoke all on public.notifications, public.announcements, public.notification_reads from anon, authenticated;
grant select on public.notifications to authenticated;
grant select, insert on public.announcements to authenticated;
grant select, insert, update on public.notification_reads to authenticated;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.ordinal(n bigint)
returns text
language sql
immutable
as $$
  select n::text || case
    when n % 100 in (11, 12, 13) then 'th'
    when n % 10 = 1 then 'st'
    when n % 10 = 2 then 'nd'
    when n % 10 = 3 then 'rd'
    else 'th' end;
$$;

create or replace function public.log_notification(p_audience text, p_boutique uuid, p_title text, p_link text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (audience, boutique_id, title, link)
  values (p_audience, p_boutique, left(p_title, 200), p_link);
exception when others then
  raise warning 'log_notification skipped: %', sqlerrm;
end;
$$;
revoke all on function public.log_notification(text, uuid, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Activity triggers
-- ---------------------------------------------------------------------------
create or replace function public.notify_customer_added()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count bigint;
begin
  -- Position of this customer, not the total (rows added in one statement
  -- share created_at, so ties are broken by id).
  select count(*) into v_count from public.customers
  where boutique_id = new.boutique_id
    and (created_at < new.created_at or (created_at = new.created_at and id <= new.id));
  perform public.log_notification('boutique', new.boutique_id,
    format('Added your %s customer: %s', public.ordinal(v_count), new.name),
    '/owner/customers/' || new.id);
  return new;
exception when others then
  return new;
end;
$$;

create or replace function public.notify_order_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer text;
  v_stage text;
begin
  select name into v_customer from public.customers where id = new.customer_id;
  if tg_op = 'INSERT' then
    perform public.log_notification('boutique', new.boutique_id,
      format('New order %s for %s, due %s', new.order_code, coalesce(v_customer, 'a customer'), to_char(new.due_date, 'DD Mon')),
      '/owner/orders/' || new.id);
  else
    if new.stage is distinct from old.stage then
      v_stage := case new.stage when 'received' then 'Received' when 'cutting' then 'Cutting' when 'stitching' then 'Stitching' when 'ready' then 'Ready for pickup' when 'delivered' then 'Delivered' else new.stage end;
      perform public.log_notification('boutique', new.boutique_id,
        format('%s (%s) moved to %s', new.order_code, coalesce(v_customer, 'customer'), v_stage),
        '/owner/orders/' || new.id);
    end if;
    if new.paid and not old.paid then
      perform public.log_notification('boutique', new.boutique_id,
        format('%s (%s) marked paid', new.order_code, coalesce(v_customer, 'customer')),
        '/owner/orders/' || new.id);
    end if;
  end if;
  return new;
exception when others then
  return new;
end;
$$;

create or replace function public.notify_boutique_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin text;
  v_word text;
begin
  if tg_op = 'INSERT' then
    perform public.log_notification('admins', new.id,
      format('New boutique joined: %s (%s)', new.name, new.owner_name),
      '/admin/boutiques/' || new.id);
    perform public.log_notification('boutique', new.id, 'Welcome to Boutiqo! Add your first customer to get started.', '/owner/customers/new');
  elsif new.status is distinct from old.status then
    select name into v_admin from public.admins where user_id = auth.uid();
    v_word := case new.status when 'active' then 'reactivated' when 'on_hold' then 'put on hold' else 'disabled' end;
    perform public.log_notification('admins', new.id,
      format('%s was %s%s', new.name, v_word, coalesce(' by ' || v_admin, '')),
      '/admin/boutiques/' || new.id);
    perform public.log_notification('boutique', new.id,
      case new.status
        when 'on_hold' then 'Your boutique is on hold. New orders are paused; contact Boutiqo support.'
        when 'active' then 'Your boutique is active again. You can take new orders.'
        else 'Your boutique has been disabled.' end,
      null);
  end if;
  return new;
exception when others then
  return new;
end;
$$;

create or replace function public.notify_announcement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin text;
begin
  select name into v_admin from public.admins where user_id = new.created_by;
  perform public.log_notification('admins', null,
    format('Announcement sent%s: %s', coalesce(' by ' || v_admin, ''), new.title), null);
  return new;
exception when others then
  return new;
end;
$$;

revoke all on function public.notify_customer_added(), public.notify_order_change(), public.notify_boutique_change(), public.notify_announcement() from public, anon, authenticated;

create trigger customers_notify after insert on public.customers
  for each row execute function public.notify_customer_added();
create trigger orders_notify after insert or update of stage, paid on public.orders
  for each row execute function public.notify_order_change();
create trigger boutiques_notify after insert or update of status on public.boutiques
  for each row execute function public.notify_boutique_change();
create trigger announcements_notify after insert on public.announcements
  for each row execute function public.notify_announcement();
