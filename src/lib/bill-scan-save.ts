import { supabase } from "@/integrations/supabase/client";
import { validateScannedBill, type ScannedBillDraft } from "@/lib/bill-scan";

export async function findScannedBillDuplicates(draft: ScannedBillDraft) {
  const row = validateScannedBill(draft);
  let query = supabase.from("bills").select("id, bill_number, bill_date, amount").eq("shop_id", row.shop_id);
  if (row.bill_number) {
    const literal = row.bill_number.replace(/[\\%_]/g, character => `\\${character}`);
    query = query.ilike("bill_number", literal);
  } else query = query.eq("bill_date", row.bill_date).eq("amount", row.amount);
  const { data, error } = await query.limit(5);
  if (error) throw new Error("Could not check existing bills. Try again before saving.");
  return data ?? [];
}

export async function saveConfirmedScannedBill(draft: ScannedBillDraft) {
  const row = validateScannedBill(draft);
  const { data: session, error: sessionError } = await supabase.auth.getUser();
  if (sessionError || !session.user) throw new Error("Sign in again before saving this bill.");
  const { data: isOwner, error: roleError } = await supabase.rpc("has_role", { _user_id: session.user.id, _role: "owner" });
  if (roleError || !isOwner) throw new Error("Only the owner can save a photo bill.");
  // Check again on confirmation, not just against a stale preview/cache.
  if ((await findScannedBillDuplicates(draft)).length) throw new Error("Possible duplicate bill. Review the existing bill or correct these details before saving.");
  // The exact existing owner insert path. Defaults, RLS and paid-amount protection remain in charge.
  const { data, error } = await supabase.from("bills").insert(row).select("id, bill_number, bill_date, amount, paid_amount, balance, status").single();
  if (error) {
    if (error.code === "23505") throw new Error("This bill number already exists. Review it or leave the number blank for automatic numbering.");
    throw new Error("Could not confirm this bill was saved. Check Bills before trying again.");
  }
  if (!data) throw new Error("Could not confirm this bill was saved. Check Bills before trying again.");
  return data;
}