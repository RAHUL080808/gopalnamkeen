-- One-time historical backfill from records that already retain timestamps or edit history.
-- This does NOT invent missing before/after values. Current-row snapshots are clearly labelled.
-- Run after 20261115040000_complete_audit_logs.sql.

-- Existing bills: creation time and creator where recorded.
INSERT INTO public.audit_logs (
  event_at, actor_id, actor_name, actor_email, action, entity_type, entity_id,
  entity_label, old_data, new_data, changed_fields
)
SELECT
  b.created_at,
  b.created_by,
  COALESCE(p.full_name, u.email, 'Creator not recorded'),
  u.email,
  'INSERT',
  'bills',
  b.id,
  concat_ws(' · ', COALESCE(NULLIF(s.shop_name, ''), s.name), b.bill_number),
  NULL,
  to_jsonb(b) || jsonb_build_object(
    '_historical_note',
    'Backfilled from the current bill row. created_at/created_by are stored values; fields may reflect later edits, not necessarily their original values.'
  ),
  jsonb_build_object(
    '_historical_note',
    jsonb_build_object('old', NULL, 'new', 'Backfilled current bill snapshot; not an original before/after snapshot.')
  )
FROM public.bills b
LEFT JOIN public.shops s ON s.id = b.shop_id
LEFT JOIN public.profiles p ON p.id = b.created_by
LEFT JOIN auth.users u ON u.id = b.created_by
WHERE NOT EXISTS (
  SELECT 1 FROM public.audit_logs a
  WHERE a.entity_type = 'bills'
    AND a.action = 'INSERT'
    AND a.entity_id = b.id
    AND a.event_at = b.created_at
);

-- Existing payments: payment creation/recording time and collector identity.
INSERT INTO public.audit_logs (
  event_at, actor_id, actor_name, actor_email, action, entity_type, entity_id,
  entity_label, old_data, new_data, changed_fields
)
SELECT
  p.created_at,
  p.employee_id,
  COALESCE(NULLIF(p.employee_name, ''), pr.full_name, u.email, 'Collector not recorded'),
  u.email,
  'INSERT',
  'payments',
  p.id,
  concat_ws(' · ', COALESCE(NULLIF(s.shop_name, ''), s.name), COALESCE(b.bill_number, 'Advance payment')),
  NULL,
  to_jsonb(p) || jsonb_build_object(
    '_historical_note',
    'Backfilled from the current payment row. created_at is the recorded-entry time; paid_at is the payment date. Amount/mode may reflect later corrections.'
  ),
  jsonb_build_object(
    '_historical_note',
    jsonb_build_object('old', NULL, 'new', 'Backfilled current payment snapshot; not an original before/after snapshot.')
  )
FROM public.payments p
LEFT JOIN public.shops s ON s.id = p.shop_id
LEFT JOIN public.bills b ON b.id = p.bill_id
LEFT JOIN public.profiles pr ON pr.id = p.employee_id
LEFT JOIN auth.users u ON u.id = p.employee_id
WHERE NOT EXISTS (
  SELECT 1 FROM public.audit_logs a
  WHERE a.entity_type = 'payments'
    AND a.action = 'INSERT'
    AND a.entity_id = p.id
    AND a.event_at = p.created_at
);

-- Exact historical bill amount edits retained by the existing dedicated history table.
INSERT INTO public.audit_logs (
  event_at, actor_id, actor_name, actor_email, action, entity_type, entity_id,
  entity_label, old_data, new_data, changed_fields
)
SELECT
  h.edited_at,
  h.edited_by,
  COALESCE(pr.full_name, u.email, 'Unknown user'),
  u.email,
  'UPDATE',
  'bills',
  COALESCE(h.bill_id, h.id),
  COALESCE(
    concat_ws(' · ', COALESCE(NULLIF(s.shop_name, ''), s.name), b.bill_number),
    'Deleted bill · edit history'
  ),
  jsonb_build_object('amount', h.old_amount),
  jsonb_build_object('amount', h.new_amount),
  jsonb_build_object('amount', jsonb_build_object('old', h.old_amount, 'new', h.new_amount))
FROM public.bill_amount_edit_history h
LEFT JOIN public.bills b ON b.id = h.bill_id
LEFT JOIN public.shops s ON s.id = b.shop_id
LEFT JOIN public.profiles pr ON pr.id = h.edited_by
LEFT JOIN auth.users u ON u.id = h.edited_by
WHERE NOT EXISTS (
  SELECT 1 FROM public.audit_logs a
  WHERE a.entity_type = 'bills'
    AND a.action = 'UPDATE'
    AND a.entity_id = COALESCE(h.bill_id, h.id)
    AND a.event_at = h.edited_at
    AND a.changed_fields -> 'amount' ->> 'old' = h.old_amount::text
    AND a.changed_fields -> 'amount' ->> 'new' = h.new_amount::text
);

-- Exact historical payment-date edits retained by the existing dedicated history table.
INSERT INTO public.audit_logs (
  event_at, actor_id, actor_name, actor_email, action, entity_type, entity_id,
  entity_label, old_data, new_data, changed_fields
)
SELECT
  h.edited_at,
  h.edited_by,
  COALESCE(pr.full_name, u.email, 'Unknown user'),
  u.email,
  'UPDATE',
  'payments',
  COALESCE(h.payment_id, h.id),
  COALESCE(concat_ws(' · ', COALESCE(NULLIF(s.shop_name, ''), s.name), COALESCE(b.bill_number, 'Payment')), 'Deleted payment · date edit history'),
  jsonb_build_object('paid_at', h.old_paid_at),
  jsonb_build_object('paid_at', h.new_paid_at),
  jsonb_build_object('paid_at', jsonb_build_object('old', h.old_paid_at, 'new', h.new_paid_at))
FROM public.payment_date_edit_history h
LEFT JOIN public.payments p ON p.id = h.payment_id
LEFT JOIN public.shops s ON s.id = p.shop_id
LEFT JOIN public.bills b ON b.id = p.bill_id
LEFT JOIN public.profiles pr ON pr.id = h.edited_by
LEFT JOIN auth.users u ON u.id = h.edited_by
WHERE NOT EXISTS (
  SELECT 1 FROM public.audit_logs a
  WHERE a.entity_type = 'payments'
    AND a.action = 'UPDATE'
    AND a.entity_id = COALESCE(h.payment_id, h.id)
    AND a.event_at = h.edited_at
    AND a.changed_fields -> 'paid_at' ->> 'old' = h.old_paid_at::text
    AND a.changed_fields -> 'paid_at' ->> 'new' = h.new_paid_at::text
);

-- Historical payment allocations: who allocated an advance to which bill.
INSERT INTO public.audit_logs (
  event_at, actor_id, actor_name, actor_email, action, entity_type, entity_id,
  entity_label, old_data, new_data, changed_fields
)
SELECT
  a.created_at,
  a.allocated_by,
  COALESCE(pr.full_name, u.email, 'Allocator not recorded'),
  u.email,
  'INSERT',
  'payment_allocations',
  a.id,
  concat_ws(' · ', COALESCE(NULLIF(s.shop_name, ''), s.name), b.bill_number),
  NULL,
  to_jsonb(a),
  jsonb_build_object('amount', jsonb_build_object('old', NULL, 'new', a.amount))
FROM public.payment_allocations a
LEFT JOIN public.bills b ON b.id = a.bill_id
LEFT JOIN public.shops s ON s.id = b.shop_id
LEFT JOIN public.profiles pr ON pr.id = a.allocated_by
LEFT JOIN auth.users u ON u.id = a.allocated_by
WHERE NOT EXISTS (
  SELECT 1 FROM public.audit_logs l
  WHERE l.entity_type = 'payment_allocations'
    AND l.action = 'INSERT'
    AND l.entity_id = a.id
    AND l.event_at = a.created_at
);

-- Historical transfers between bills.
INSERT INTO public.audit_logs (
  event_at, actor_id, actor_name, actor_email, action, entity_type, entity_id,
  entity_label, old_data, new_data, changed_fields
)
SELECT
  h.transferred_at,
  h.transferred_by,
  COALESCE(pr.full_name, u.email, 'Unknown user'),
  u.email,
  'UPDATE',
  'payment_allocation_transfer_history',
  h.id,
  concat_ws(' → ', sb.bill_number, tb.bill_number),
  NULL,
  to_jsonb(h),
  jsonb_build_object('amount', jsonb_build_object('old', NULL, 'new', h.amount))
FROM public.payment_allocation_transfer_history h
LEFT JOIN public.bills sb ON sb.id = h.source_bill_id
LEFT JOIN public.bills tb ON tb.id = h.target_bill_id
LEFT JOIN public.profiles pr ON pr.id = h.transferred_by
LEFT JOIN auth.users u ON u.id = h.transferred_by
WHERE NOT EXISTS (
  SELECT 1 FROM public.audit_logs l
  WHERE l.entity_type = 'payment_allocation_transfer_history'
    AND l.action = 'UPDATE'
    AND l.entity_id = h.id
    AND l.event_at = h.transferred_at
);

-- Historical correction requests and their final review events.
INSERT INTO public.audit_logs (
  event_at, actor_id, actor_name, actor_email, action, entity_type, entity_id,
  entity_label, old_data, new_data, changed_fields
)
SELECT
  c.created_at,
  c.requested_by,
  c.requested_by_name,
  u.email,
  'INSERT',
  'payment_corrections',
  c.id,
  concat_ws(' · ', COALESCE(NULLIF(s.shop_name, ''), s.name), COALESCE(b.bill_number, 'Payment correction')),
  NULL,
  to_jsonb(c),
  jsonb_build_object('status', jsonb_build_object('old', NULL, 'new', c.status))
FROM public.payment_corrections c
LEFT JOIN public.payments p ON p.id = c.payment_id
LEFT JOIN public.shops s ON s.id = p.shop_id
LEFT JOIN public.bills b ON b.id = p.bill_id
LEFT JOIN auth.users u ON u.id = c.requested_by
WHERE NOT EXISTS (
  SELECT 1 FROM public.audit_logs l
  WHERE l.entity_type = 'payment_corrections'
    AND l.action = 'INSERT'
    AND l.entity_id = c.id
    AND l.event_at = c.created_at
);

INSERT INTO public.audit_logs (
  event_at, actor_id, actor_name, actor_email, action, entity_type, entity_id,
  entity_label, old_data, new_data, changed_fields
)
SELECT
  c.reviewed_at,
  c.reviewed_by,
  COALESCE(pr.full_name, u.email, 'Reviewer not recorded'),
  u.email,
  'UPDATE',
  'payment_corrections',
  c.id,
  concat_ws(' · ', COALESCE(NULLIF(s.shop_name, ''), s.name), COALESCE(b.bill_number, 'Payment correction')),
  jsonb_build_object('status', 'pending'),
  jsonb_build_object('status', c.status, 'reviewed_at', c.reviewed_at, 'reviewed_by', c.reviewed_by),
  jsonb_build_object('status', jsonb_build_object('old', 'pending', 'new', c.status))
FROM public.payment_corrections c
LEFT JOIN public.payments p ON p.id = c.payment_id
LEFT JOIN public.shops s ON s.id = p.shop_id
LEFT JOIN public.bills b ON b.id = p.bill_id
LEFT JOIN public.profiles pr ON pr.id = c.reviewed_by
LEFT JOIN auth.users u ON u.id = c.reviewed_by
WHERE c.reviewed_at IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.audit_logs l
    WHERE l.entity_type = 'payment_corrections'
      AND l.action = 'UPDATE'
      AND l.entity_id = c.id
      AND l.event_at = c.reviewed_at
  );

-- Existing shops: creation time is known, but creator identity was not stored.
INSERT INTO public.audit_logs (
  event_at, actor_name, action, entity_type, entity_id, entity_label,
  old_data, new_data, changed_fields
)
SELECT
  s.created_at,
  'Creator not recorded in original shop data',
  'INSERT',
  'shops',
  s.id,
  COALESCE(NULLIF(s.shop_name, ''), s.name),
  NULL,
  to_jsonb(s) || jsonb_build_object(
    '_historical_note',
    'Backfilled current shop snapshot. Original creator was not stored.'
  ),
  jsonb_build_object(
    '_historical_note',
    jsonb_build_object('old', NULL, 'new', 'Current shop snapshot; original creator not recorded.')
  )
FROM public.shops s
WHERE NOT EXISTS (
  SELECT 1 FROM public.audit_logs l
  WHERE l.entity_type = 'shops'
    AND l.action = 'INSERT'
    AND l.entity_id = s.id
    AND l.event_at = s.created_at
);

-- Existing visit schedules.
INSERT INTO public.audit_logs (
  event_at, actor_id, actor_name, actor_email, action, entity_type, entity_id,
  entity_label, old_data, new_data, changed_fields
)
SELECT
  d.created_at,
  d.created_by,
  COALESCE(pr.full_name, u.email, 'Unknown user'),
  u.email,
  'INSERT',
  'daily_order_bills',
  d.id,
  b.bill_number,
  NULL,
  to_jsonb(d),
  jsonb_build_object('visit_date', jsonb_build_object('old', NULL, 'new', d.visit_date))
FROM public.daily_order_bills d
LEFT JOIN public.bills b ON b.id = d.bill_id
LEFT JOIN public.profiles pr ON pr.id = d.created_by
LEFT JOIN auth.users u ON u.id = d.created_by
WHERE NOT EXISTS (
  SELECT 1 FROM public.audit_logs l
  WHERE l.entity_type = 'daily_order_bills'
    AND l.action = 'INSERT'
    AND l.entity_id = d.id
    AND l.event_at = d.created_at
);
