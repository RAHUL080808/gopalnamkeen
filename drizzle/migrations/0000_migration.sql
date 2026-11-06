
create type public.app_role as enum ('owner','driver','salesman');
create type public.payment_mode as enum ('cash','upi','bank_transfer','cheque');
create type public.correction_status as enum ('pending','approved','rejected');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  phone text,
  created_at timestamptz not null default now()
);
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role public.app_role not null,
  unique (user_id, role)
);
grant select, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;
create or replace function public.is_staff(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id)
$$;

create policy "own or owner reads profiles" on public.profiles for select to authenticated
  using (id = auth.uid() or public.has_role(auth.uid(),'owner'));
create policy "owner updates profiles" on public.profiles for update to authenticated
  using (public.has_role(auth.uid(),'owner')) with check (public.has_role(auth.uid(),'owner'));
create policy "own or owner reads roles" on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(),'owner'));

-- New user: profile; very first user becomes owner. Other roles assigned by owner server-side.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, phone)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)), new.raw_user_meta_data->>'phone');
  if not exists (select 1 from public.user_roles where role = 'owner') then
    insert into public.user_roles (user_id, role) values (new.id, 'owner');
  end if;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Shops
create table public.shops (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_name text,
  phone text,
  address text,
  created_at timestamptz not null default now()
);
grant select, insert, update on public.shops to authenticated;
grant all on public.shops to service_role;
alter table public.shops enable row level security;
create policy "staff read shops" on public.shops for select to authenticated using (public.is_staff(auth.uid()));
create policy "owner inserts shops" on public.shops for insert to authenticated with check (public.has_role(auth.uid(),'owner'));
create policy "owner updates shops" on public.shops for update to authenticated using (public.has_role(auth.uid(),'owner')) with check (public.has_role(auth.uid(),'owner'));

-- Bills
create sequence public.bill_number_seq start 1001;
create table public.bills (
  id uuid primary key default gen_random_uuid(),
  bill_number text not null unique default ('INV-' || nextval('public.bill_number_seq')::text),
  shop_id uuid not null references public.shops(id) on delete restrict,
  bill_date date not null default current_date,
  amount numeric(12,2) not null check (amount > 0),
  paid_amount numeric(12,2) not null default 0,
  balance numeric(12,2) generated always as (amount - paid_amount) stored,
  status text generated always as (
    case when paid_amount <= 0 then 'unpaid' when paid_amount >= amount then 'paid' else 'partial' end
  ) stored,
  notes text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
grant usage on sequence public.bill_number_seq to authenticated;
grant select, insert, update on public.bills to authenticated;
grant all on public.bills to service_role;
alter table public.bills enable row level security;
create policy "staff read bills" on public.bills for select to authenticated using (public.is_staff(auth.uid()));
create policy "owner inserts bills" on public.bills for insert to authenticated with check (public.has_role(auth.uid(),'owner'));
create policy "owner updates bills" on public.bills for update to authenticated using (public.has_role(auth.uid(),'owner')) with check (public.has_role(auth.uid(),'owner'));

create or replace function public.protect_bill_paid()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.paid_amount := 0;
  elsif coalesce(current_setting('app.recalc', true),'') <> 'on' then
    new.paid_amount := old.paid_amount;
    if new.amount < old.paid_amount then
      raise exception 'Bill amount cannot be less than amount already paid (%)', old.paid_amount;
    end if;
  end if;
  return new;
end $$;
create trigger bills_protect_paid before insert or update on public.bills
  for each row execute function public.protect_bill_paid();

-- Payments
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid not null references public.bills(id) on delete restrict,
  shop_id uuid not null references public.shops(id) on delete restrict,
  employee_id uuid not null default auth.uid(),
  employee_name text not null default '',
  employee_role text not null default '',
  amount numeric(12,2) not null check (amount > 0),
  mode public.payment_mode not null,
  reference text,
  paid_at timestamptz not null default now(),
  is_void boolean not null default false,
  created_at timestamptz not null default now()
);
grant select, insert on public.payments to authenticated;
grant all on public.payments to service_role;
alter table public.payments enable row level security;
create policy "owner reads all payments, staff own" on public.payments for select to authenticated
  using (public.has_role(auth.uid(),'owner') or employee_id = auth.uid());
create policy "staff insert own payments" on public.payments for insert to authenticated
  with check (public.is_staff(auth.uid()) and employee_id = auth.uid());
-- no update/delete policies: payment records are immutable through the API

create or replace function public.prepare_payment()
returns trigger language plpgsql security definer set search_path = public as $$
declare b public.bills; r text;
begin
  new.employee_id := auth.uid();
  new.paid_at := now();
  new.created_at := now();
  new.is_void := false;
  select * into b from public.bills where id = new.bill_id for update;
  if b.id is null then raise exception 'Bill not found'; end if;
  new.shop_id := b.shop_id;
  if new.amount > b.balance then
    raise exception 'Amount exceeds remaining balance (%)', b.balance;
  end if;
  select full_name into new.employee_name from public.profiles where id = auth.uid();
  select role::text into r from public.user_roles where user_id = auth.uid() limit 1;
  new.employee_role := coalesce(r,'');
  return new;
end $$;
create trigger payments_prepare before insert on public.payments
  for each row execute function public.prepare_payment();

create or replace function public.recalc_bill(_bill_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform set_config('app.recalc','on',true);
  update public.bills set paid_amount = coalesce((
    select sum(amount) from public.payments where bill_id = _bill_id and not is_void), 0)
  where id = _bill_id;
  perform set_config('app.recalc','off',true);
end $$;
revoke execute on function public.recalc_bill(uuid) from public, anon, authenticated;

create or replace function public.after_payment()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.recalc_bill(new.bill_id);
  return new;
end $$;
create trigger payments_after after insert or update on public.payments
  for each row execute function public.after_payment();

-- Payment corrections
create table public.payment_corrections (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id) on delete restrict,
  requested_by uuid not null default auth.uid(),
  requested_by_name text not null default '',
  reason text not null,
  new_amount numeric(12,2) check (new_amount is null or new_amount > 0),
  new_mode public.payment_mode,
  void_payment boolean not null default false,
  status public.correction_status not null default 'pending',
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
grant select, insert, update on public.payment_corrections to authenticated;
grant all on public.payment_corrections to service_role;
alter table public.payment_corrections enable row level security;
create policy "owner reads all corrections, staff own" on public.payment_corrections for select to authenticated
  using (public.has_role(auth.uid(),'owner') or requested_by = auth.uid());
create policy "staff request corrections on own payments" on public.payment_corrections for insert to authenticated
  with check (requested_by = auth.uid() and (
    public.has_role(auth.uid(),'owner') or exists (select 1 from public.payments p where p.id = payment_id and p.employee_id = auth.uid())));
create policy "owner reviews corrections" on public.payment_corrections for update to authenticated
  using (public.has_role(auth.uid(),'owner')) with check (public.has_role(auth.uid(),'owner'));

create or replace function public.prepare_correction()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.requested_by := auth.uid();
    new.status := 'pending';
    new.reviewed_by := null; new.reviewed_at := null;
    select full_name into new.requested_by_name from public.profiles where id = auth.uid();
  else
    if old.status <> 'pending' then raise exception 'Correction already reviewed'; end if;
    -- only status may change on review
    new.payment_id := old.payment_id; new.new_amount := old.new_amount; new.new_mode := old.new_mode;
    new.void_payment := old.void_payment; new.reason := old.reason; new.requested_by := old.requested_by;
    new.reviewed_by := auth.uid(); new.reviewed_at := now();
  end if;
  return new;
end $$;
create trigger corrections_prepare before insert or update on public.payment_corrections
  for each row execute function public.prepare_correction();

create or replace function public.apply_correction()
returns trigger language plpgsql security definer set search_path = public as $$
declare p public.payments; other numeric; b public.bills;
begin
  if new.status = 'approved' and old.status = 'pending' then
    select * into p from public.payments where id = new.payment_id for update;
    if new.void_payment then
      update public.payments set is_void = true where id = p.id;
    else
      if new.new_amount is not null then
        select * into b from public.bills where id = p.bill_id;
        select coalesce(sum(amount),0) into other from public.payments where bill_id = p.bill_id and not is_void and id <> p.id;
        if other + new.new_amount > b.amount then raise exception 'Corrected amount exceeds bill amount'; end if;
      end if;
      update public.payments set amount = coalesce(new.new_amount, amount), mode = coalesce(new.new_mode, mode) where id = p.id;
    end if;
  end if;
  return new;
end $$;
create trigger corrections_apply after update on public.payment_corrections
  for each row execute function public.apply_correction();

create index on public.bills(shop_id);
create index on public.payments(bill_id);
create index on public.payments(employee_id);
