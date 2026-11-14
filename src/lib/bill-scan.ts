export type ScannedBillDraft = { shopId: string; billDate: string; amount: string; billNumber: string };
export type ScanShop = { id: string; name: string; area?: string | null; contact_name?: string | null };
export type ExtractedBill = { shopName: string; billDate: string; amount: string; billNumber: string };

export function normalizeShopName(value: string) {
  return value.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}

export function suggestShops(name: string, shops: ScanShop[]) {
  const needle = normalizeShopName(name);
  if (!needle) return [];
  const tokens = needle.split(" ").filter(token => token.length > 1);
  return shops.map(shop => {
    const haystack = normalizeShopName(shop.name);
    const overlap = tokens.filter(token => haystack.split(" ").includes(token)).length;
    const score = haystack === needle ? 100 : haystack.includes(needle) || needle.includes(haystack) ? 80 : tokens.length ? overlap / tokens.length * 60 : 0;
    return { shop, score };
  }).filter(item => item.score >= 30).sort((a, b) => b.score - a.score || a.shop.name.localeCompare(b.shop.name)).slice(0, 5).map(item => item.shop);
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

export function extractBillFields(text: string): ExtractedBill {
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const shopLabel = /^(?:shop(?:\s*name)?|customer(?:\s*name)?|party(?:\s*name)?|bill\s*to|sold\s*to|buyer|m\/s)\s*[:.\-]?\s*/i;
  const shopIndex = lines.findIndex(line => shopLabel.test(line));
  const shopLine = shopIndex >= 0 ? lines[shopIndex] ?? "" : "";
  let shopName = shopLine.replace(shopLabel, "").trim();
  if (shopIndex >= 0 && !shopName) shopName = lines[shopIndex + 1] ?? "";
  // Never mistake the supplier's unlabelled heading for the customer's shop.
  shopName = shopName.split(/\s+(?:date|bill\s*(?:no|number)|invoice\s*(?:no|number))\b/i)[0]?.trim() ?? "";
  const dateLine = lines.find(line => /(?:bill\s*date|invoice\s*date|date)\b/i.test(line)) ?? text;
  const billDate = parseDate(dateLine);
  const numberMatch = text.match(/\b(?:bill|invoice)\s*(?:no\.?|number|#)\s*[:#.-]?\s*([A-Z0-9][A-Z0-9/_.-]*)/i);
  const billNumber = numberMatch?.[1] ?? "";
  const candidates = lines.map((line, index) => {
    const label = line.match(/\b(grand\s*total|net\s*(?:amount|total|payable)|total\s*(?:bill\s*)?amount|amount\s*(?:payable|due)|bill\s*amount|total)\b\s*[:=-]?/i);
    if (!label || /\b(?:sub\s*total|subtotal|total\s*(?:qty|quantity|items)|tax\s*total)\b/i.test(line)) return null;
    const tail = line.slice((label.index ?? 0) + label[0].length).trim() || lines[index + 1] || "";
    const numeric = tail.match(/(?:₹|rs\.?|inr)?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i)?.[1];
    if (!numeric || !(Number(numeric.replace(/,/g, "")) > 0)) return null;
    const score = /grand|net|payable/i.test(label[1] ?? "") ? 3 : /amount/i.test(label[1] ?? "") ? 2 : 1;
    return { value: numeric.replace(/,/g, ""), score, index };
  }).filter((item): item is { value: string; score: number; index: number } => item !== null).sort((a, b) => b.score - a.score || b.index - a.index);
  return { shopName, billDate, amount: candidates[0]?.value ?? "", billNumber };
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