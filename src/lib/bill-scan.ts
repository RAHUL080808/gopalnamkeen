export type ScannedBillDraft = { shopId: string; billDate: string; amount: string; billNumber: string };
export type ScanShop = { id: string; name: string; area?: string | null; contact_name?: string | null };
export type ExtractedBill = { shopName: string; billDate: string; amount: string; billNumber: string };

export function normalizeShopName(value: string) {
  return value.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}

function editSimilarity(a: string, b: string) {
  if (!a || !b) return 0;
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = previous[0] ?? 0;
    previous[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = previous[j] ?? 0;
      previous[j] = Math.min((previous[j - 1] ?? 0) + 1, above + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return 1 - (previous[b.length] ?? Math.max(a.length, b.length)) / Math.max(a.length, b.length);
}

export function suggestShops(name: string, shops: ScanShop[]) {
  const needle = normalizeShopName(name);
  if (!needle) return [];
  const tokens = needle.split(" ").filter(token => token.length > 1);
  return shops.map(shop => {
    const haystack = normalizeShopName(shop.name);
    const shopTokens = haystack.split(" ").filter(token => token.length > 1);
    const overlap = tokens.length ? tokens.filter(token => shopTokens.some(other => other === token || editSimilarity(token, other) >= 0.78)).length / tokens.length : 0;
    const score = haystack === needle ? 100
      : haystack.includes(needle) || needle.includes(haystack) ? 92
      : Math.max(editSimilarity(needle, haystack) * 85, overlap * 78);
    return { shop, score };
  }).filter(item => item.score >= 38).sort((a, b) => b.score - a.score || a.shop.name.localeCompare(b.shop.name)).slice(0, 5).map(item => item.shop);
}

export function validBillDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function parseDate(value: string) {
  const iso = value.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  const local = value.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|20\d{2})\b/);
  let result = "";
  if (iso) result = `${iso[1]}-${String(iso[2]).padStart(2, "0")}-${String(iso[3]).padStart(2, "0")}`;
  else if (local) result = `${local[3]?.length === 2 ? `20${local[3]}` : local[3]}-${String(local[2]).padStart(2, "0")}-${String(local[1]).padStart(2, "0")}`;
  else {
    const named = value.match(/\b(\d{1,2})[\s-]+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)[\s,-]+(20\d{2})\b/i);
    const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    if (named) result = `${named[3]}-${String(months.indexOf(named[2]?.slice(0, 3).toLowerCase() ?? "") + 1).padStart(2, "0")}-${String(named[1]).padStart(2, "0")}`;
  }
  return validBillDate(result) ? result : "";
}

function amountFromLine(line: string) {
  const matches = [...line.matchAll(/(?:₹|rs\.?|inr)?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/gi)];
  const value = matches.at(-1)?.[1]?.replace(/,/g, "") ?? "";
  return Number(value) > 0 ? value : "";
}

export function extractBillFields(text: string): ExtractedBill {
  const clean = text.replace(/\r/g, "\n").replace(/[|]/g, "I");
  const lines = clean.split(/\n/).map(line => line.replace(/\s+/g, " ").trim()).filter(Boolean);
  const normalized = clean.replace(/\s+/g, " ");

  // This business invoice prints the customer immediately below "Bill To/Ship To Party Details".
  const partyHeading = lines.findIndex(line => /bill\s*to\s*\/?\s*ship\s*to\s*party\s*details|bill\s*to\s*party\s*details|party\s*details/i.test(line));
  let shopName = "";
  if (partyHeading >= 0) {
    const sameLine = (lines[partyHeading] ?? "").replace(/.*?(?:bill\s*to\s*\/?\s*ship\s*to\s*party\s*details|bill\s*to\s*party\s*details|party\s*details)\s*/i, "").trim();
    const candidate = sameLine || lines.slice(partyHeading + 1, partyHeading + 4).find(line =>
      !/(?:order\s*no|invoice\s*(?:no|date)|date\s*&\s*time|gst\s*no|fssai|place\s*of\s*supply)/i.test(line)
    ) || "";
    shopName = candidate.replace(/\s+(?:order\s*no|invoice\s*(?:no|date)|date\s*&\s*time)\b.*$/i, "").trim();
  }
  if (!shopName) {
    const labelled = lines.find(line => /^(?:bill\s*to|sold\s*to|ship\s*to|customer|party)\b/i.test(line));
    shopName = labelled?.replace(/^(?:bill\s*to|sold\s*to|ship\s*to|customer|party)(?:\s*\/\s*ship\s*to)?(?:\s*party\s*details)?\s*[:.\-]?\s*/i, "").trim() ?? "";
  }
  // Remove address and metadata if OCR combines multiple printed rows.
  shopName = shopName.split(/\s+(?:rastipura|indira\s*colony|order\s*no|invoice\s*(?:no|date)|gst\s*no|fssai\s*no)\b/i)[0]?.trim() ?? "";

  // Prefer the explicit Invoice Date. Ignore Order Date/Time and the later "Invoice generated on" footer.
  const invoiceDateLine = lines.find(line => /invoice\s*date/i.test(line));
  const labelledDateLine = invoiceDateLine ?? lines.find(line => /\bbill\s*date\b|\bdated\b/i.test(line));
  const dateSource = labelledDateLine ?? "";
  const dateMatch = dateSource.match(/(?:invoice\s*date|bill\s*date|dated)\s*[:.]?\s*(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}|\d{4}[\/.-]\d{1,2}[\/.-]\d{1,2})/i);
  const billDate = parseDate(dateMatch?.[1] ?? dateSource);

  // This workflow intentionally does not read or save the invoice/bill number.
  const billNumber = "";

  // Prefer the printed Grand Total row, not item totals, taxable amount, GST, or Round Off.
  const grandLine = lines.find(line => /\bgrand\s*total\b/i.test(line));
  let amount = "";
  if (grandLine) {
    const tail = grandLine.slice((grandLine.match(/\bgrand\s*total\b/i)?.index ?? 0) + (grandLine.match(/\bgrand\s*total\b/i)?.[0].length ?? 0));
    amount = amountFromLine(tail);
    if (!amount) {
      const afterGrand = grandLine.match(/\bgrand\s*total\b\s*[:=]?\s*(?:rs\.?|inr|₹)?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i);
      amount = afterGrand?.[1]?.replace(/,/g, "") ?? "";
    }
  }
  if (!amount) {
    const totalLine = lines.find(line => /\b(?:net\s*amount|net\s*payable|total\s*invoice\s*amount)\b/i.test(line));
    if (totalLine) amount = amountFromLine(totalLine);
  }
  return { shopName, billDate, amount, billNumber };
}
export function validateScannedBill(draft: ScannedBillDraft) {
  if (!draft.shopId) throw new Error("Select an existing shop.");
  if (!validBillDate(draft.billDate)) throw new Error("Enter a valid bill date.");
  if (!/^\d+(?:\.\d{1,2})?$/.test(draft.amount.trim()) || !Number.isFinite(Number(draft.amount)) || Number(draft.amount) <= 0) throw new Error("Enter a total amount greater than zero, with up to two decimal places.");
  if (draft.billNumber.trim().length > 100) throw new Error("Bill number is too long.");
  return {
    shop_id: draft.shopId,
    bill_date: draft.billDate,
    amount: Number(draft.amount),
    ...(draft.billNumber.trim() ? { bill_number: draft.billNumber.trim() } : {}),
  };
}

export function validateBillImage(file: Pick<File, "type" | "size">) {
  if (!["image/jpeg", "image/png", "image/webp", "image/bmp"].includes(file.type)) throw new Error("Choose a JPG, PNG or WebP photo. Convert HEIC photos to JPG first.");
  if (file.size === 0) throw new Error("This photo is empty. Choose another image.");
  if (file.size > 20 * 1024 * 1024) throw new Error("This photo is too large. Choose an image smaller than 20 MB.");
}
