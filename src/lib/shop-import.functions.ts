import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertImportOwner, previewShopRows, shopImportRowSchema, type ImportResult } from "@/lib/shop-import";

// Allow invalid rows through the envelope so each gets a visible failed result.
const rowEnvelope = shopImportRowSchema.omit({ shop_name: true, mobile_number: true }).extend({
  shop_name: z.string().max(10000), mobile_number: z.string().max(10000),
  contact_person: z.string().max(10000), area: z.string().max(10000), address: z.string().max(10000), incharge: z.string().max(10000),
});
const requestSchema = z.object({ rows: z.array(rowEnvelope).min(1).max(5000) });

export const previewShopImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => requestSchema.parse(input))
  .handler(async ({ data, context }) => {
    const owner = await context.supabase.rpc("has_role", { _role: "owner", _user_id: context.userId });
    assertImportOwner(!owner.error && owner.data === true);
    const mobiles: string[] = [];
    for (let start = 0; ; start += 1000) {
      const { data: shops, error } = await context.supabase.from("shops").select("mobile_number, phone").order("id").range(start, start + 999);
      if (error) throw new Error("Could not check existing shops. Please try again.");
      mobiles.push(...(shops ?? []).map((s) => s.mobile_number ?? s.phone ?? ""));
      if ((shops?.length ?? 0) < 1000) break;
    }
    return previewShopRows(data.rows, mobiles);
  });

export const saveShopImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => requestSchema.parse(input))
  .handler(async ({ data, context }) => {
    const owner = await context.supabase.rpc("has_role", { _role: "owner", _user_id: context.userId });
    assertImportOwner(!owner.error && owner.data === true);
    const resultSchema = z.array(z.object({ row_number: z.number(), status: z.enum(["successful", "duplicate", "failed"]), message: z.string() }));
    const results: ImportResult[] = [];
    const valid = data.rows.filter((row) => {
      const parsed = shopImportRowSchema.safeParse(row);
      if (parsed.success) return true;
      results.push({ row_number: row.row_number, status: "failed", message: parsed.error.issues[0]?.message ?? "Invalid record" });
      return false;
    });
    if (valid.length) {
      const { data: saved, error } = await context.supabase.rpc("import_shops", { _rows: valid });
      if (error) throw new Error("Import could not complete. Preview again before retrying; existing shops will not be overwritten.");
      results.push(...resultSchema.parse(saved));
    }
    return results.sort((a, b) => a.row_number - b.row_number);
  });