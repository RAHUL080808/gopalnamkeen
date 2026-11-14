import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const requestSchema = z.object({
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  imageBase64: z.string().min(100).max(8_000_000),
  shopNames: z.array(z.string().trim().min(1).max(160)).max(3000),
});

const resultSchema = z.object({
  shopName: z.string().max(200).default(""),
  billDate: z.string().max(10).default(""),
  amount: z.union([z.string(), z.number()]).transform(value => String(value)).default(""),
});

export const scanBillWithGemini = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => requestSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: isOwner, error: roleError } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "owner",
    });
    if (roleError || !isOwner) throw new Error("Only the owner can scan bill photos.");

    const apiKey = process.env["GEMINI_API_KEY"];
    if (!apiKey) throw new Error("Gemini API key is not configured in server secrets.");

    const prompt = [
      "Read this Indian FMCG sales invoice carefully. Return ONLY a JSON object with exactly these keys: shopName, billDate, amount.",
      "shopName: identify the CUSTOMER / BUYER / BILL TO / PARTY name, not the supplier or company printing the invoice. Use the closest exact spelling visible. If unclear, return an empty string.",
      "billDate: use the actual invoice/bill date, not order date, due date, dispatch date, or printed/generated timestamp. Return YYYY-MM-DD. If unclear, return an empty string.",
      "amount: use the final payable invoice total (Grand Total / Net Payable / Amount Payable). Do not use subtotal, taxable value, tax total, item total, quantity, or balance due. Return digits with optional decimal point, no currency symbol or commas. If unclear, return an empty string.",
      "Do NOT extract or return any bill number, invoice number, GST number, phone number, or address.",
      "The customer may be one of these existing shop names; use them as spelling hints only, and do not force a match if the printed customer is different:",
      data.shopNames.slice(0, 1500).join(" | "),
      "Never guess missing values. Empty string is better than an incorrect value.",
    ].join("\n");

    const requestModel = async (model: string) => fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: data.mimeType, data: data.imageBase64 } }] }],
          generationConfig: { temperature: 0, responseMimeType: "application/json" },
        }),
      },
    );

    // If the primary model is temporarily overloaded, automatically try a second
    // stable Flash model before falling back to on-device OCR in the UI.
    let response = await requestModel("gemini-3.8-flash");
    let usedFallbackModel = false;
    if (response.status === 503) {
      console.warn("[Gemini bill scan] Primary model is overloaded; trying gemini-3.6-flash.");
      response = await requestModel("gemini-3.6-flash");
      usedFallbackModel = true;
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error("[Gemini bill scan] Request failed:", response.status, detail.slice(0, 500));
      let apiMessage = "";
      try {
        const parsed = JSON.parse(detail) as { error?: { message?: string; status?: string } };
        apiMessage = parsed.error?.message?.slice(0, 220) ?? parsed.error?.status ?? "";
      } catch { /* Do not expose an unstructured provider response. */ }
      throw new Error(response.status === 429
        ? `Gemini ${usedFallbackModel ? "backup model" : "API"} quota or rate limit reached (HTTP 429). Please retry later.`
        : `Gemini ${usedFallbackModel ? "backup model" : "API"} request failed (HTTP ${response.status})${apiMessage ? `: ${apiMessage}` : ""}. Please retry or enter the details manually.`);
    }

    const payload = await response.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const raw = payload.candidates?.[0]?.content?.parts?.map(part => part.text ?? "").join("").trim() ?? "";
    if (!raw) throw new Error("Gemini returned no readable bill details.");
    let parsed: unknown;
    try { parsed = JSON.parse(raw); }
    catch { throw new Error("Gemini returned an unreadable result. Please retry."); }
    const result = resultSchema.parse(parsed);
    const date = /^\d{4}-\d{2}-\d{2}$/.test(result.billDate) &&
      Number.isFinite(Date.parse(result.billDate)) &&
      new Date(result.billDate + "T00:00:00Z").toISOString().slice(0, 10) === result.billDate
      ? result.billDate : "";
    const normalizedAmount = result.amount.trim().replace(/,/g, "");
    const amount = /^\d+(?:\.\d{1,2})?$/.test(normalizedAmount) && Number(normalizedAmount) > 0
      ? normalizedAmount : "";

    return { shopName: result.shopName.trim(), billDate: date, amount, billNumber: "" };
  });
