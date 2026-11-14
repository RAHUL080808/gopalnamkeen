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
  const lines = text.split(/\r?\n/).map(line => line.replace(/[|]/g, "I").replace(/\s+/g, " ").trim()).filter(Boolean);
  const shopLabel = /^(?:shop(?:\s*name)?|customer(?:\s*name)?|party(?:\s*name)?|bill\s*to|sold\s*to|ship\s*to|buyer|retailer|consignee|m\s*[/\.]?\s*s\.?|name)\s*[:.\-]?\s*/i;
  const shopIndex = lines.findIndex(line => shopLabel.test(line));
  const shopLine = shopIndex >= 0 ? lines[shopIndex] ?? "" : "";
  let shopName = shopLine.replace(shopLabel, "").trim();
  if (shopIndex >= 0 && !shopName) shopName = lines[shopIndex + 1] ?? "";
  shopName = shopName.split(/\s+(?:date|bill\s*(?:no|number)|invoice\s*(?:no|number))\b/i)[0]?.trim() ?? "";

  const labelledDate = lines.find(line => /(?:bill\s*date|invoice\s*date|dated|date)\b/i.test(line) && !/due\s*date/i.test(line));
  const billDate = parseDate(labelledDate ?? text);

  const numberMatch = text.match(/\b(?:bill|invoice|inv)\s*(?:no\.?|number|#)\s*[:#.\-]?\s*([A-Z0-9][A-Z0-9/_.-]*)/i);
  const billNumber = numberMatch?.[1] ?? "";

  const candidates = lines.map((line, index) => {
    const label = line.match(/\b(grand\s*total|net\s*(?:amount|total|payable)|total\s*(?:bill\s*)?(?:amount|payable)?|amount\s*(?:payable|due)|bill\s*amount|invoice\s*value)\b\s*[:=\-]?/i);
    if (!label || /\b(?:sub\s*total|subtotal|total\s*(?:qty|quantity|items|tax)|tax\s*total|paid|received|balance|change|discount)\b/i.test(line)) return null;
    const tail = line.slice((label.index ?? 0) + label[0].length).trim() || lines[index + 1] || "";
    const value = amountFromLine(tail);
    if (!value) return null;
    const key = (label[1] ?? "").toLowerCase();
    const score = /grand|net|payable/i.test(key) ? 6 : /invoice\s*value|bill\s*amount|total\s*amount/i.test(key) ? 5 : /total/i.test(key) ? 4 : 3;
    return { value, score, index };
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
