-- Allow drivers to update only non-financial shop contact details.
create or replace function public.driver_update_shop_contact(
  _shop_id uuid,
  _name text,
  _contact_name text,
  _phone text,
  _address text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.has_role(auth.uid(), 'driver'::public.app_role) then
    raise exception 'Only drivers can update shop contact details';
  end if;

  if nullif(trim(_name), '') is null then
    raise exception 'Shop name is required';
  end if;

  update public.shops
  set name = trim(_name),
      contact_name = nullif(trim(_contact_name), ''),
      phone = nullif(trim(_phone), ''),
      address = nullif(trim(_address), '')
  where id = _shop_id;

  if not found then
    raise exception 'Shop not found';
  end if;
end;
$$;

revoke all on function public.driver_update_shop_contact(uuid, text, text, text, text) from public;
grant execute on function public.driver_update_shop_contact(uuid, text, text, text) to authenticated;
