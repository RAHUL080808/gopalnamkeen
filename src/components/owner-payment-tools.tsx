import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, ArrowRightLeft, Check, ArrowRight, Pencil, Trash2, ShieldCheck, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { inr, fmtDateTime, MODES, type PaymentMode } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { WhatsAppReceiptDialog } from "@/components/whatsapp-receipt-dialog";
import { PaymentToolPicker, type PaymentToolOption } from "@/components/payment-tool-picker";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

type Shop = { id: string; name: string; phone: string | null };
type Bill = { id: string; bill_number: string; amount: number; balance: number; shop_id: string };
type ToolPayment = { id: string; shop_id: string; bill_id: string | null; amount: number; paid_at: string; remarks: string | null; reference: string | null; shops: { name: string } | null; bills: { bill_number: string } | null; payment_allocations: { id: string; amount: number; bill_id: string; bills: { bill_number: string } | null }[] };
type Feedback = { error: boolean; message: string } | null;
type Confirmation = { kind: "allocate" | "transfer" | "update" | "remove"; title: string; description: string; id?: string } | null;

function paymentOptions(payments: ToolPayment[]): PaymentToolOption[] {
  return payments.map(payment => ({
    value: payment.id,
    label: payment.shops?.name ?? "Shop",
    detail: `${inr(payment.amount)} · ${payment.bill_id ? payment.bills?.bill_number ?? "Bill payment" : "Without Bill Payment"} · ${fmtDateTime(payment.paid_at)}`,
    searchText: `${payment.reference ?? ""} ${payment.payment_allocations.map(a => a.bills?.bill_number ?? "").join(" ")}`,
  }));
}

function ToolFeedback({ feedback }: { feedback: Feedback }) {
  if (!feedback) return null;
  return <p role={feedback.error ? "alert" : "status"} className={`rounded-md border p-3 text-sm ${feedback.error ? "border-destructive/30 bg-destructive/5 text-destructive" : "border-success/30 bg-accent text-accent-foreground"}`}>{feedback.message}</p>;
}

export function OwnerPaymentTools() {
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [allocateOpen, setAllocateOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [confirmation, setConfirmation] = useState<Confirmation>(null);
  const [adjustFeedback, setAdjustFeedback] = useState<Feedback>(null);
  const [transferFeedback, setTransferFeedback] = useState<Feedback>(null);
  const [shopId, setShopId] = useState("");
  const [shopSearch, setShopSearch] = useState("");
  const [shopDropdownOpen, setShopDropdownOpen] = useState(false);
  const [billId, setBillId] = useState("advance");
  const [amount, setAmount] = useState("");
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 16));
  const [mode, setMode] = useState<PaymentMode>("cash");
  const [reference, setReference] = useState("");
  const [remarks, setRemarks] = useState("");
  const [sendWhatsApp, setSendWhatsApp] = useState(false);
  const [receipt, setReceipt] = useState<null | { phone: string | null; shopName: string; amount: number; mode: string; paidAt: string; outstanding: number }>(null);

  const { data: shops = [] } = useQuery({
    queryKey: ["owner-payment-shops"],
    queryFn: async () => {
      const { data, error } = await supabase.from("shops").select("id,name,phone").order("name");
      if (error) throw error;
      return (data ?? []) as Shop[];
    },
  });
  const { data: bills = [], isPending: billsLoading, error: billsError } = useQuery({
    queryKey: ["owner-payment-bills"],
    queryFn: async () => {
      const { data, error } = await supabase.from("bills").select("id,bill_number,amount,balance,shop_id").order("bill_date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Bill[];
    },
  });
  const { data: paymentsToAdjust = [], isPending: paymentsLoading, error: paymentsError } = useQuery({
    queryKey: ["owner-paymentsToAdjust"],
    queryFn: async () => {
      const { data, error } = await (supabase.from("payments") as any)
        .select("id,shop_id,bill_id,amount,paid_at,remarks,reference,shops(name),bills(bill_number),payment_allocations(id,amount,bill_id,bills(bill_number))")
        .eq("is_void", false).order("paid_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ToolPayment[];
    },
  });
  const selectedShopBills = useMemo(() => bills.filter(b => b.shop_id === shopId && Number(b.balance) > 0), [bills, shopId]);
  const filteredShops = useMemo(() => shops.filter(s => s.name.toLowerCase().includes(shopSearch.trim().toLowerCase())), [shops, shopSearch]);

  const addPayment = useMutation({
    mutationFn: async () => {
      const value = Number(amount);
      if (!shopId) throw new Error("Select a shop");
      if (!(value > 0)) throw new Error("Enter a valid amount");
      if (!paidAt) throw new Error("Select payment date and time");
      const chosenBill = billId !== "advance" ? bills.find(b => b.id === billId) : null;
      if (billId !== "advance" && !chosenBill) throw new Error("Select a valid bill");
      if (chosenBill && value > Number(chosenBill.balance)) throw new Error("Amount cannot exceed bill balance");
      const paidAtIso = new Date(paidAt).toISOString();
      const { error } = await (supabase.from("payments") as any).insert({
        shop_id: shopId, bill_id: chosenBill?.id ?? null, amount: value, mode,
        paid_at: paidAtIso, reference: reference.trim() || null,
        remarks: remarks.trim() || null,
      });
      if (error) throw error;
      const selectedShop = shops.find(s => s.id === shopId);
      const [{ data: updatedBills, error: balanceError }, { data: advances, error: advanceError }] = await Promise.all([
        supabase.from("bills").select("balance").eq("shop_id", shopId),
        (supabase.from("payments") as any).select("amount,payment_allocations(amount)").eq("shop_id", shopId).is("bill_id", null).eq("is_void", false),
      ]);
      if (balanceError) throw balanceError;
      if (advanceError) throw advanceError;
      const billDue = (updatedBills ?? []).reduce((sum, b) => sum + Number(b.balance), 0);
      const unallocatedAdvance = (advances ?? []).reduce((sum: number, p: any) => sum + Math.max(0, Number(p.amount) - (p.payment_allocations ?? []).reduce((allocated: number, a: any) => allocated + Number(a.amount), 0)), 0);
      return { phone: selectedShop?.phone ?? null, shopName: selectedShop?.name ?? "Customer", amount: value, mode, paidAt: paidAtIso, outstanding: Math.max(0, billDue - unallocatedAdvance) };
    },
    onSuccess: (savedReceipt) => {
      toast.success("Payment recorded");
      if (sendWhatsApp) setReceipt(savedReceipt);
      setAddOpen(false); setShopId(""); setShopSearch(""); setBillId("advance"); setAmount("");
      setReference(""); setRemarks(""); setMode("cash"); setPaidAt(new Date().toISOString().slice(0, 16)); setSendWhatsApp(false);
      qc.invalidateQueries();
    },
    onError: e => toast.error((e as Error).message),
  });

  const [allocPayment, setAllocPayment] = useState("");
  const [allocBill, setAllocBill] = useState("");
  const [allocAmount, setAllocAmount] = useState("");
  const [editingAllocation, setEditingAllocation] = useState<string | null>(null);
  const [editBillId, setEditBillId] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [transferPaymentId, setTransferPaymentId] = useState("");
  const [transferSourceBillId, setTransferSourceBillId] = useState("");
  const [transferTargetBillId, setTransferTargetBillId] = useState("");
  const [transferAmount, setTransferAmount] = useState("");
  const chosenPayment = paymentsToAdjust.find(a => a.id === allocPayment);
  const allocated = chosenPayment?.payment_allocations.reduce((s, x) => s + Number(x.amount), 0) ?? 0;
  const unallocated = chosenPayment && !chosenPayment.bill_id ? Number(chosenPayment.amount) - allocated : 0;
  const shopBills = chosenPayment ? bills.filter(b => b.shop_id === chosenPayment.shop_id) : [];
  const transferChosenPayment = paymentsToAdjust.find(a => a.id === transferPaymentId);
  const transferShopBills = transferChosenPayment ? bills.filter(b => b.shop_id === transferChosenPayment.shop_id) : [];
  const transferSourceId = transferSourceBillId || transferChosenPayment?.bill_id || "";
  const sourceAmount = transferChosenPayment?.bill_id === transferSourceId
    ? Number(transferChosenPayment?.amount ?? 0)
    : Number(transferChosenPayment?.payment_allocations.find(a => a.bill_id === transferSourceId)?.amount ?? 0);
  const targetBills = transferShopBills.filter(b => b.id !== transferSourceId && Number(b.balance) > 0);
  const sourceOptions: PaymentToolOption[] = transferChosenPayment?.bill_id
    ? [{ value: transferChosenPayment.bill_id, label: transferChosenPayment.bills?.bill_number ?? "Current bill", detail: `Paid ${inr(transferChosenPayment.amount)}` }]
    : (transferChosenPayment?.payment_allocations ?? []).map(a => ({ value: a.bill_id, label: a.bills?.bill_number ?? "Bill", detail: `Paid ${inr(a.amount)}` }));
  const billOptions = (list: Bill[]): PaymentToolOption[] => list.map(b => ({ value: b.id, label: b.bill_number, detail: `Baaki ${inr(b.balance)}` }));
  const loading = billsLoading || paymentsLoading;
  const loadError = billsError || paymentsError;

  const allocate = useMutation({
    mutationFn: async () => {
      const value = Number(allocAmount);
      if (!allocPayment || !allocBill) throw new Error("Select payment and bill");
      if (!(value > 0) || value > unallocated) throw new Error("Enter an amount within the unallocated payment");
      const target = shopBills.find(b => b.id === allocBill);
      if (!target || value > Number(target.balance)) throw new Error("Amount cannot exceed this bill's balance");
      const { error } = await (supabase.from("payment_allocations") as any).insert({ payment_id: allocPayment, bill_id: allocBill, amount: value });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Payment adjusted"); setAdjustFeedback({ error: false, message: "Payment adjust ho gaya. Total collection nahi badla." }); setAllocAmount(""); setAllocBill(""); qc.invalidateQueries(); },
    onError: e => { toast.error((e as Error).message); setAdjustFeedback({ error: true, message: (e as Error).message }); },
  });

  const updateAllocation = useMutation({
    mutationFn: async () => {
      const current = chosenPayment?.payment_allocations.find(a => a.id === editingAllocation);
      const value = Number(editAmount);
      const target = shopBills.find(b => b.id === editBillId);
      if (!current || !target || !(value > 0)) throw new Error("Select a valid bill and amount");
      const availablePayment = unallocated + Number(current.amount);
      const availableBill = Number(target.balance) + (target.id === current.bill_id ? Number(current.amount) : 0);
      if (value > availablePayment) throw new Error("Amount exceeds the payment's available balance");
      if (value > availableBill) throw new Error("Amount exceeds the bill's outstanding balance");
      const { error } = await (supabase.from("payment_allocations") as any)
        .update({ bill_id: editBillId, amount: value }).eq("id", editingAllocation);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Allocation updated"); setAdjustFeedback({ error: false, message: "Adjustment update ho gaya. Payment record nahi badla." }); setEditingAllocation(null); setEditBillId(""); setEditAmount(""); qc.invalidateQueries(); },
    onError: e => { toast.error((e as Error).message); setAdjustFeedback({ error: true, message: (e as Error).message }); },
  });

  const transferPayment = useMutation({
    mutationFn: async () => {
      const value = Number(transferAmount);
      const sourceId = transferSourceBillId || transferChosenPayment?.bill_id || "";
      if (!transferChosenPayment || !sourceId || !transferTargetBillId || !(value > 0)) {
        throw new Error("Choose source bill, target bill and a valid amount");
      }
      const sourceAmount = transferChosenPayment.bill_id === sourceId
        ? Number(transferChosenPayment.amount)
        : Number(transferChosenPayment.payment_allocations.find(a => a.bill_id === sourceId)?.amount ?? 0);
      if (value > sourceAmount) throw new Error("Transfer amount exceeds the source bill payment");
      const target = transferShopBills.find(b => b.id === transferTargetBillId);
      if (!target || value > Number(target.balance)) throw new Error("Amount cannot exceed the target bill balance");
      const { error } = await (supabase.rpc as any)("owner_transfer_bill_payment", {
        _payment_id: transferChosenPayment.id,
        _source_bill_id: sourceId,
        _target_bill_id: transferTargetBillId,
        _amount: value,
        _reason: "Owner transferred payment between bills",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Payment transferred; total collection is unchanged");
      setTransferFeedback({ error: false, message: "Payment transfer ho gaya. Total collection nahi badla." });
      setTransferAmount(""); setTransferSourceBillId(""); setTransferTargetBillId("");
      qc.invalidateQueries();
    },
    onError: e => { toast.error((e as Error).message); setTransferFeedback({ error: true, message: (e as Error).message }); },
  });

  const deleteAllocation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.from("payment_allocations") as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Allocation removed; amount is available again"); setAdjustFeedback({ error: false, message: "Adjustment hata diya. Yeh amount phir se available hai; payment record nahi badla." }); setEditingAllocation(null); qc.invalidateQueries(); },
    onError: e => { toast.error((e as Error).message); setAdjustFeedback({ error: true, message: (e as Error).message }); },
  });

  const adjustBusy = allocate.isPending || updateAllocation.isPending || deleteAllocation.isPending;
  const busy = adjustBusy || transferPayment.isPending;

  return (
    <div className="space-y-4">
      <Button onClick={() => setAddOpen(true)}><Plus className="h-4 w-4" /> Add payment</Button>
      <div className="grid gap-3 sm:grid-cols-2">
        <section className="flex min-w-0 flex-col rounded-lg border border-border bg-card p-5">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-md bg-accent text-accent-foreground"><Check className="h-5 w-5" /></div>
          <h2 className="text-base font-extrabold">ADJUST PAYMENT</h2>
          <p className="mt-1 text-sm text-muted-foreground">Payment ko kisi bill ke against adjust karein.</p>
          <Button variant="outline" className="mt-auto h-11 w-full border-success/30 text-accent-foreground hover:bg-accent" onClick={() => setAllocateOpen(true)}><Check /> Adjust Payment <ArrowRight className="ml-auto" /></Button>
        </section>
        <section className="flex min-w-0 flex-col rounded-lg border border-border bg-card p-5">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-md bg-secondary text-secondary-foreground"><ArrowRightLeft className="h-5 w-5" /></div>
          <h2 className="text-base font-extrabold">TRANSFER PAYMENT</h2>
          <p className="mt-1 text-sm text-muted-foreground">Ek bill se payment doosre bill mein shift karein.</p>
          <Button variant="outline" className="mt-auto h-11 w-full" onClick={() => setTransferOpen(true)}><ArrowRightLeft /> Transfer Payment <ArrowRight className="ml-auto" /></Button>
        </section>
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Record shop payment</DialogTitle></DialogHeader>
          <form className="space-y-3" onSubmit={e => { e.preventDefault(); addPayment.mutate(); }}>
            <div className="relative space-y-1.5"><Label>Shop</Label>
              <Input
                value={shopSearch}
                onFocus={() => setShopDropdownOpen(true)}
                onChange={e => {
                  const value = e.target.value;
                  setShopSearch(value);
                  setShopId("");
                  setBillId("advance");
                  setShopDropdownOpen(true);
                }}
                onKeyDown={e => { if (e.key === "Escape") setShopDropdownOpen(false); }}
                placeholder="Search or select shop…"
                autoComplete="off"
              />
              {shopDropdownOpen && (
                <div className="absolute z-50 mt-1 max-h-52 w-full overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md">
                  {(shopId ? shops : filteredShops).length > 0 ? (shopId ? shops : filteredShops).map(s => (
                    <Button variant="ghost"
                      key={s.id}
                      type="button"
                      className="h-auto w-full justify-start whitespace-normal rounded-sm px-3 py-2 text-left text-sm"
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => {
                        setShopId(s.id);
                        setShopSearch(s.name);
                        setBillId("advance");
                        setShopDropdownOpen(false);
                      }}
                    >
                      {s.name}
                    </Button>
                  )) : <p className="px-3 py-2 text-sm text-muted-foreground">No matching shop found</p>}
                </div>
              )}
            </div>
            <div className="space-y-1.5"><Label>Payment for</Label>
              <Select value={billId} onValueChange={setBillId}>
                <SelectTrigger><SelectValue placeholder="Choose bill or Without Bill Payment" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="advance">Without Bill Payment</SelectItem>
                  {selectedShopBills.map(b => <SelectItem key={b.id} value={b.id}>{b.bill_number} · Due {inr(b.balance)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Amount (₹)</Label><Input type="number" min="0.01" step="0.01" required value={amount} onChange={e => setAmount(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Date and time</Label><Input type="datetime-local" required value={paidAt} onChange={e => setPaidAt(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Payment mode</Label>
              <Select value={mode} onValueChange={v => setMode(v as PaymentMode)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{MODES.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent></Select>
            </div>
            <div className="space-y-1.5"><Label>Reference (optional)</Label><Input value={reference} maxLength={100} onChange={e => setReference(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Remarks (optional)</Label><Textarea value={remarks} maxLength={500} onChange={e => setRemarks(e.target.value)} /></div>
            <label className="flex items-center gap-2 rounded-lg border p-3 text-sm"><input type="checkbox" checked={sendWhatsApp} onChange={e => setSendWhatsApp(e.target.checked)} className="h-4 w-4 accent-primary" /> Ask me to send WhatsApp receipt after saving</label>
            <Button className="w-full" type="submit" disabled={addPayment.isPending}>{addPayment.isPending ? "Saving…" : "Save payment"}</Button>
          </form>
        </DialogContent>
      </Dialog>

      {receipt && <WhatsAppReceiptDialog open={!!receipt} onOpenChange={open => !open && setReceipt(null)} {...receipt} />}
      <Dialog open={allocateOpen} onOpenChange={open => { if (!busy) setAllocateOpen(open); }}>
        <DialogContent className="max-h-[90dvh] w-[calc(100%-1.5rem)] overflow-y-auto rounded-lg p-5 sm:p-6">
          <DialogHeader className="text-left"><DialogTitle className="pr-6">Adjust Payment</DialogTitle><DialogDescription>Payment ko kisi bill ke against adjust karein.</DialogDescription></DialogHeader>
          <ToolFeedback feedback={adjustFeedback} />
          {loadError && <p role="alert" className="text-sm text-destructive">Payments load nahi hue. Page refresh karke phir try karein.</p>}
          <form className="space-y-5" onSubmit={e => { e.preventDefault(); setConfirmation({ kind: "allocate", title: "Adjust Payment confirm karein?", description: `${chosenPayment?.shops?.name ?? "Shop"}: ${inr(Number(allocAmount))} ko ${shopBills.find(b => b.id === allocBill)?.bill_number ?? "bill"} mein adjust karein.` }); }}>
            <div className="space-y-2"><Label htmlFor="adjust-payment">1. Select Payment</Label>
              <PaymentToolPicker id="adjust-payment" label="Select Payment" value={allocPayment} onChange={v => { setAllocPayment(v); setAllocBill(""); setAllocAmount(""); setEditingAllocation(null); setEditBillId(""); setEditAmount(""); setAdjustFeedback(null); }} options={paymentOptions(paymentsToAdjust.filter(p => p.bill_id === null))} placeholder={loading ? "Loading payments…" : "Payment chunein"} searchPlaceholder="Shop ya amount search karein" disabled={loading || !!loadError || adjustBusy} emptyText="Koi Without Bill Payment nahi hai." />
              {chosenPayment && <div className="flex flex-wrap items-center justify-between gap-2 border-l-2 border-success pl-3 text-sm"><span className="text-muted-foreground">Received {inr(chosenPayment.amount)} · Adjusted {inr(allocated)}</span><strong className="text-accent-foreground">Available {inr(unallocated)}</strong></div>}
            </div>
            <div className="space-y-2"><Label htmlFor="adjust-bill">2. Select Bill</Label>
              <PaymentToolPicker id="adjust-bill" label="Select Bill" value={allocBill} onChange={v => { setAllocBill(v); setAllocAmount(""); setAdjustFeedback(null); }} options={billOptions(shopBills.filter(b => Number(b.balance) > 0))} placeholder="Bill chunein" searchPlaceholder="Bill number search karein" disabled={!chosenPayment || loading || adjustBusy} emptyText="Is shop ka koi pending bill nahi hai." />
            </div>
            <div className="space-y-2"><Label htmlFor="adjust-amount">3. Enter Amount (₹)</Label><Input id="adjust-amount" type="number" inputMode="decimal" min="0.01" max={Math.min(unallocated, Number(shopBills.find(b => b.id === allocBill)?.balance ?? 0))} step="0.01" placeholder="0.00" required disabled={!allocBill || adjustBusy} value={allocAmount} onChange={e => { setAllocAmount(e.target.value); setAdjustFeedback(null); }} className="h-12 text-base" /></div>
            <Button type="submit" className="h-12 w-full bg-success text-success-foreground hover:bg-success/90" disabled={!chosenPayment || !allocBill || !allocAmount || unallocated <= 0 || loading || !!loadError || busy}>{allocate.isPending ? <><Loader2 className="animate-spin" /> Adjusting…</> : <><Check /> Adjust Payment</>}</Button>
          </form>
          {chosenPayment && chosenPayment.payment_allocations.length > 0 && <details className="border-t pt-4">
            <summary className="cursor-pointer text-sm font-semibold">Previous adjustments ({chosenPayment.payment_allocations.length})</summary>
            <div className="mt-3 divide-y">
              {chosenPayment.payment_allocations.map(a => <div key={a.id} className="flex items-center justify-between gap-2 py-2.5 text-sm"><span className="min-w-0 break-words">{a.bills?.bill_number ?? "Bill"} · <b>{inr(a.amount)}</b></span><div className="flex shrink-0 gap-1"><Button type="button" variant="ghost" size="icon" aria-label={`Edit ${a.bills?.bill_number ?? "adjustment"}`} title="Edit adjustment" disabled={busy} onClick={() => { setEditingAllocation(a.id); setEditBillId(a.bill_id); setEditAmount(String(a.amount)); }}><Pencil /></Button><Button type="button" variant="ghost" size="icon" aria-label={`Remove ${a.bills?.bill_number ?? "adjustment"}`} title="Remove adjustment" className="text-destructive hover:bg-destructive/10 hover:text-destructive" disabled={busy} onClick={() => setConfirmation({ kind: "remove", id: a.id, title: "Adjustment hatayein?", description: `${a.bills?.bill_number ?? "Bill"} se ${inr(a.amount)} ka adjustment hat jayega. Amount phir se available hoga.` })}><Trash2 /></Button></div></div>)}
            </div>
            {editingAllocation && <form className="mt-4 space-y-3 border-t pt-4" onSubmit={e => { e.preventDefault(); setConfirmation({ kind: "update", title: "Adjustment update karein?", description: `${shopBills.find(b => b.id === editBillId)?.bill_number ?? "Bill"} mein adjustment ${inr(Number(editAmount))} ho jayega.` }); }}>
              <h3 className="text-sm font-bold">Edit adjustment</h3>
              <div className="space-y-2"><Label htmlFor="edit-adjustment-bill">Select Bill</Label><PaymentToolPicker id="edit-adjustment-bill" label="Edit adjustment bill" value={editBillId} onChange={setEditBillId} options={billOptions(shopBills)} placeholder="Bill chunein" searchPlaceholder="Bill number search karein" disabled={busy} emptyText="Koi bill nahi hai." /></div>
              <div className="space-y-2"><Label htmlFor="edit-adjustment-amount">Amount (₹)</Label><Input id="edit-adjustment-amount" type="number" inputMode="decimal" min="0.01" step="0.01" required value={editAmount} disabled={busy} onChange={e => setEditAmount(e.target.value)} className="h-11" /></div>
              <div className="flex gap-2"><Button type="submit" className="h-11 flex-1" disabled={busy}>{updateAllocation.isPending ? "Saving…" : "Save adjustment"}</Button><Button type="button" variant="outline" className="h-11" disabled={busy} onClick={() => setEditingAllocation(null)}>Cancel</Button></div>
            </form>}
          </details>}
        </DialogContent>
      </Dialog>

      <Dialog open={transferOpen} onOpenChange={open => { if (!busy) setTransferOpen(open); }}>
        <DialogContent className="max-h-[90dvh] w-[calc(100%-1.5rem)] overflow-y-auto rounded-lg p-5 sm:p-6">
          <DialogHeader className="text-left"><DialogTitle className="pr-6">Transfer Payment</DialogTitle><DialogDescription>Ek bill se payment doosre bill mein shift karein.</DialogDescription></DialogHeader>
          <ToolFeedback feedback={transferFeedback} />
          {loadError && <p role="alert" className="text-sm text-destructive">Payments load nahi hue. Page refresh karke phir try karein.</p>}
          <form className="space-y-5" onSubmit={e => { e.preventDefault(); setConfirmation({ kind: "transfer", title: "Transfer Payment confirm karein?", description: `${transferChosenPayment?.shops?.name ?? "Shop"}: ${inr(Number(transferAmount))} ko ${sourceOptions.find(b => b.value === transferSourceId)?.label ?? "From Bill"} se ${transferShopBills.find(b => b.id === transferTargetBillId)?.bill_number ?? "To Bill"} mein transfer karein.` }); }}>
            <div className="space-y-2"><Label htmlFor="transfer-payment">1. Select Payment</Label>
              <PaymentToolPicker id="transfer-payment" label="Select Payment" value={transferPaymentId} onChange={v => { setTransferPaymentId(v); setTransferSourceBillId(""); setTransferTargetBillId(""); setTransferAmount(""); setTransferFeedback(null); }} options={paymentOptions(paymentsToAdjust.filter(p => p.bill_id !== null || p.payment_allocations.length > 0))} placeholder={loading ? "Loading payments…" : "Payment chunein"} searchPlaceholder="Shop ya amount search karein" disabled={loading || !!loadError || busy} emptyText="Kisi bill mein payment assigned nahi hai." />
            </div>
            <div className="space-y-2"><Label htmlFor="transfer-from">2. Select From Bill</Label>
              <PaymentToolPicker id="transfer-from" label="Select From Bill" value={transferSourceId} onChange={v => { setTransferSourceBillId(v); setTransferTargetBillId(""); setTransferAmount(""); setTransferFeedback(null); }} options={sourceOptions} placeholder="Jis bill se payment hatana hai" searchPlaceholder="From bill number search karein" disabled={!transferChosenPayment || loading || busy} emptyText="Is payment ka koi paid bill nahi hai." />
              {transferSourceId && <p className="border-l-2 border-primary/40 pl-3 text-sm text-muted-foreground">Is bill mein paid: <b className="text-foreground">{inr(sourceAmount)}</b></p>}
            </div>
            <div className="space-y-2"><Label htmlFor="transfer-to">3. Select To Bill</Label>
              <PaymentToolPicker id="transfer-to" label="Select To Bill" value={transferTargetBillId} onChange={v => { setTransferTargetBillId(v); setTransferAmount(""); setTransferFeedback(null); }} options={billOptions(targetBills)} placeholder="Jis bill mein payment lagana hai" searchPlaceholder="To bill number search karein" disabled={!transferSourceId || loading || busy} emptyText="Is shop ka koi doosra pending bill nahi hai." />
            </div>
            <div className="space-y-2"><Label htmlFor="transfer-amount">4. Enter Amount (₹)</Label><Input id="transfer-amount" type="number" inputMode="decimal" min="0.01" step="0.01" required placeholder="0.00" value={transferAmount} disabled={!transferTargetBillId || busy} onChange={e => { setTransferAmount(e.target.value); setTransferFeedback(null); }} className="h-12 text-base" /></div>
            <Button type="submit" className="h-12 w-full" disabled={!transferChosenPayment || !transferSourceId || !transferTargetBillId || !transferAmount || loading || !!loadError || busy}>{transferPayment.isPending ? <><Loader2 className="animate-spin" /> Transferring…</> : <><ArrowRightLeft /> Transfer Payment</>}</Button>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmation !== null} onOpenChange={open => { if (!open) setConfirmation(null); }}>
        <AlertDialogContent className="max-h-[90dvh] w-[calc(100%-1.5rem)] overflow-y-auto rounded-lg p-5 sm:p-6">
          <AlertDialogHeader className="text-left"><AlertDialogTitle>{confirmation?.title}</AlertDialogTitle><AlertDialogDescription>{confirmation?.description}</AlertDialogDescription></AlertDialogHeader>
          <p className="flex items-start gap-2 border-t pt-3 text-xs leading-relaxed text-muted-foreground"><ShieldCheck className="h-4 w-4 shrink-0 text-accent-foreground" />Original payment aur history safe rahenge. Total collection nahi badlega.</p>
          <AlertDialogFooter className="gap-2"><AlertDialogCancel className="mt-0 h-11" disabled={busy}>Cancel</AlertDialogCancel><AlertDialogAction className="h-11" disabled={busy} onClick={() => {
            if (!confirmation || busy) return;
            if (confirmation.kind === "allocate") allocate.mutate();
            else if (confirmation.kind === "transfer") transferPayment.mutate();
            else if (confirmation.kind === "update") updateAllocation.mutate();
            else if (confirmation.id) deleteAllocation.mutate(confirmation.id);
          }}>Haan, confirm karein</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
