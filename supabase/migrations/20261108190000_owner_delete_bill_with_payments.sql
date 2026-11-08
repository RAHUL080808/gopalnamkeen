-- Owner-only testing cleanup: delete a bill and its directly linked payment history.
-- Allocations from separate advance payments are removed for this bill, but the
-- original advance payment record is preserved.
create or replace function public.owner_delete_bill_with_payments(_bill_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _payment_ids uuid[];
begin
  if auth.uid() is null or not public.has_role(auth.uid(), 'owner'::public.app_role) then
    raise exception 'Only owners can delete a bill and its payment history';
  end if;

  if not exists (select 1 from public.bills where id = _bill_id) then
    raise exception 'Bill not found';
  end if;

  select coalesce(array_agg(id), array[]::uuid[])
    into _payment_ids
  from public.payments
  where bill_id = _bill_id;

  -- Remove allocations belonging to this bill and allocations attached to
  -- direct payments that are about to be deleted.
  delete from public.payment_allocations
  where bill_id = _bill_id
     or payment_id = any(_payment_ids);

  -- Corrections reference payments and must be removed before those payments.
  delete from public.payment_corrections
  where payment_id = any(_payment_ids);

  delete from public.payments
  where id = any(_payment_ids);

  delete from public.bills
  where id = _bill_id;
end;
$$;

revoke all on function public.owner_delete_bill_with_payments(uuid) from public;
grant execute on function public.owner_delete_bill_with_payments(uuid) to authenticated;
