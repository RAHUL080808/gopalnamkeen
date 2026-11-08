-- Owner schedules bills for a driver's visit date, independently of the original bill date.
create table if not exists public.daily_order_bills (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid not null references public.bills(id) on delete cascade,
  bill_date date not null,
  visit_date date not null,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  constraint daily_order_bills_bill_unique unique (bill_id)
);

create index if not exists daily_order_bills_visit_date_idx
  on public.daily_order_bills (visit_date);
create index if not exists daily_order_bills_bill_date_idx
  on public.daily_order_bills (bill_date);

alter table public.daily_order_bills enable row level security;

drop policy if exists "authenticated staff view scheduled bills" on public.daily_order_bills;
create policy "authenticated staff view scheduled bills"
  on public.daily_order_bills for select to authenticated
  using (true);

drop policy if exists "owner inserts scheduled bills" on public.daily_order_bills;
create policy "owner inserts scheduled bills"
  on public.daily_order_bills for insert to authenticated
  with check (has_role(auth.uid(), 'owner'::app_role));

drop policy if exists "owner deletes scheduled bills" on public.daily_order_bills;
create policy "owner deletes scheduled bills"
  on public.daily_order_bills for delete to authenticated
  using (has_role(auth.uid(), 'owner'::app_role));
