-- Preserve bill amount edit audit records when an owner deletes a bill.
-- The deleted bill link becomes NULL; the audit amounts and editor remain.
ALTER TABLE public.bill_amount_edit_history
  ALTER COLUMN bill_id DROP NOT NULL;

ALTER TABLE public.bill_amount_edit_history
  DROP CONSTRAINT IF EXISTS bill_amount_edit_history_bill_id_fkey;

ALTER TABLE public.bill_amount_edit_history
  ADD CONSTRAINT bill_amount_edit_history_bill_id_fkey
  FOREIGN KEY (bill_id)
  REFERENCES public.bills(id)
  ON DELETE SET NULL;
