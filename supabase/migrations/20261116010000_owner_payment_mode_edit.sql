-- Owner-only payment mode changes with an immutable before/after history record.
create table if not exists public.payment_mode_edit_history (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id) on delete cascade,
  old_mode public.payment_mode not null,
  new_mode public.payment_mode not null,
  edited_by uuid not null,
  edited_at timestamptz not null default now()
);

alter table public.payment_mode_edit_history enable row level security;

drop policy if exists "Owners read payment mode edit history" on public.payment_mode_edit_history;
create policy "Owners read payment mode edit history"
  on public.payment_mode_edit_history
  for select
  to authenticated
  using (public.has_role(auth.uid(), 'owner'::public.app_role));

create or replace function public.owner_update_payment_mode(
  _payment_id uuid,
  _new_mode public.payment_mode
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _old_mode public.payment_mode;
begin
  if auth.uid() is null or not public.has_role(auth.uid(), 'owner'::public.app_role) then
    raise exception 'Only an owner can change payment type';
  end if;

  select mode
    into _old_mode
    from public.payments
   where id = _payment_id
     and is_void = false
   for update;

  if not found then
    raise exception 'Payment not found or already voided';
  end if;

  if _old_mode = _new_mode then
    return;
  end if;

  insert into public.payment_mode_edit_history (
    payment_id, old_mode, new_mode, edited_by
  ) values (
    _payment_id, _old_mode, _new_mode, auth.uid()
  );

  update public.payments
     set mode = _new_mode
   where id = _payment_id;
end;
$$;

revoke all on function public.owner_update_payment_mode(uuid, public.payment_mode) from public;
grant execute on function public.owner_update_payment_mode(uuid, public.payment_mode) to authenticated;
