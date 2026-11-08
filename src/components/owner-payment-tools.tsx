import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, ArrowRightLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { inr, fmtDateTime, MODES, type PaymentMode } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { WhatsAppReceiptDialog } from "@/components/whatsapp-receipt-dialog";

type Shop = { id: string; name: string; phone: string | null };
type Bill = { id: string; bill_number: string; amount: number; balance: number; shop_id: string };
type Advance = { id: string; shop_id: string; amount: number; paid_at: string; remarks: string | null; reference: string | null; shops: { name: string } | null; payment_allocations: { id: string; amount: number; bill_id: string; bills: { bill_number: string } | null }[] };

export function OwnerPaymentTools() {
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [allocateOpen, setAllocateOpen] = useState(false);
  const [shopId, setShopId] = useState("");
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
  const { data: bills = [] } = useQuery({
    queryKey: ["owner-payment-bills"],
    queryFn: async () => {
      const { data, error } = await supabase.from("bills").select("id,bill_number,amount,balance,shop_id").order("bill_date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Bill[];
    },
  });
  const { data: paymentsToAdjust = [] } = useQuery({
    queryKey: ["owner-paymentsToAdjust"],
    queryFn: async () => {
      const { data, error } = await (supabase.from("payments") as any)
        .select("id,shop_id,amount,paid_at,remarks,reference,shops(name),payment_allocations(id,amount,bill_id,bills(bill_number))")
        .is("bill_id", null).eq("is_void", false).order("paid_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Advance[];
    },
  });
  const selectedShopBills = useMemo(() => bills.filter(b => b.shop_id === shopId && Number(b.balance) > 0), [bills, shopId]);

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
      const { data: updatedBills, error: balanceError } = await supabase.from("bills").select("balance").eq("shop_id", shopId);
      if (balanceError) throw balanceError;
      return { phone: selectedShop?.phone ?? null, shopName: selectedShop?.name ?? "Customer", amount: value, mode, paidAt: paidAtIso, outstanding: (updatedBills ?? []).reduce((sum, b) => sum + Number(b.balance), 0) };
    },
    onSuccess: (savedReceipt) => {
      toast.success("Payment recorded");
      if (sendWhatsApp) setReceipt(savedReceipt);
      setAddOpen(false); setShopId(""); setBillId("advance"); setAmount("");
      setReference(""); setRemarks(""); setMode("cash"); setPaidAt(new Date().toISOString().slice(0, 16)); setSendWhatsApp(false);
      qc.invalidateQueries();
    },
    onError: e => toast.error((e as Error).message),
  });

  const [allocPayment, setAllocPayment] = useState("");
  const [allocBill, setAllocBill] = useState("");
  const [allocAmount, setAllocAmount] = useState("");
  const chosenPayment = paymentsToAdjust.find(a => a.id === allocPayment);
  const allocated = chosenPayment?.payment_allocations.reduce((s, x) => s + Number(x.amount), 0) ?? 0;
  const unallocated = chosenPayment ? Number(chosenPayment.amount) - allocated : 0;
  const shopBills = chosenPayment ? bills.filter(b => b.shop_id === chosenPayment.shop_id) : [];
  const [editingAllocation, setEditingAllocation] = useState<string | null>(null);
  const [editBillId, setEditBillId] = useState("");
  const [editAmount, setEditAmount] = useState("");

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
    onSuccess: () => { toast.success("Payment adjusted"); setAllocAmount(""); setAllocBill(""); qc.invalidateQueries(); },
    onError: e => toast.error((e as Error).message),
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
    onSuccess: () => { toast.success("Allocation updated"); setEditingAllocation(null); setEditBillId(""); setEditAmount(""); qc.invalidateQueries(); },
    onError: e => toast.error((e as Error).message),
  });

  const deleteAllocation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.from("payment_allocations") as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Allocation removed; amount is available again"); setEditingAllocation(null); qc.invalidateQueries(); },
    onError: e => toast.error((e as Error).message),
  });

  return (
    <div className="flex flex-wrap gap-2">
      <Button onClick={() => setAddOpen(true)}><Plus className="h-4 w-4" /> Add payment</Button>
      <Button variant="outline" onClick={() => setAllocateOpen(true)}><ArrowRightLeft className="h-4 w-4" /> Adjust Payment</Button>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Record shop payment</DialogTitle></DialogHeader>
          <form className="space-y-3" onSubmit={e => { e.preventDefault(); addPayment.mutate(); }}>
            <div className="space-y-1.5"><Label>Shop</Label>
              <Select value={shopId} onValueChange={v => { setShopId(v); setBillId("advance"); }}>
                <SelectTrigger><SelectValue placeholder="Choose shop" /></SelectTrigger>
                <SelectContent>{shops.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
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
      <Dialog open={allocateOpen} onOpenChange={setAllocateOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Adjust Payment</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Without Bill Payment</Label>
              <Select value={allocPayment} onValueChange={v => { setAllocPayment(v); setAllocBill(""); setAllocAmount(""); }}>
                <SelectTrigger><SelectValue placeholder="Choose payment" /></SelectTrigger>
                <SelectContent>{paymentsToAdjust.map(a => {
                  const left = Number(a.amount) - a.payment_allocations.reduce((s,x) => s + Number(x.amount),0);
                  return left > 0 || a.payment_allocations.length > 0 ? <SelectItem key={a.id} value={a.id}>{a.shops?.name ?? "Shop"} · {inr(left)} unassigned · {fmtDateTime(a.paid_at)}</SelectItem> : null;
                })}</SelectContent>
              </Select>
            </div>
            {chosenPayment && <>
              <p className="rounded-lg bg-muted p-3 text-sm">Received {inr(chosenPayment.amount)} · Allocated {inr(allocated)} · <b>Available {inr(unallocated)}</b></p>
              {chosenPayment.payment_allocations.length > 0 && <div className="space-y-2 rounded-lg border p-3">
                <Label>Existing bill allocations</Label>
                {chosenPayment.payment_allocations.map(a => <div key={a.id} className="flex items-center justify-between gap-2 text-sm">
                  <span>{a.bills?.bill_number ?? "Bill"} · {inr(a.amount)}</span>
                  <div className="flex gap-1">
                    <Button type="button" size="sm" variant="outline" onClick={() => { setEditingAllocation(a.id); setEditBillId(a.bill_id); setEditAmount(String(a.amount)); }}>Edit</Button>
                    <Button type="button" size="sm" variant="destructive" disabled={deleteAllocation.isPending} onClick={() => { if (window.confirm("Remove this allocation? The payment will remain unchanged.")) deleteAllocation.mutate(a.id); }}>Remove</Button>
                  </div>
                </div>)}
              </div>}
              {editingAllocation && <div className="space-y-2 rounded-lg border p-3">
                <Label>Edit allocation</Label>
                <Select value={editBillId} onValueChange={setEditBillId}><SelectTrigger><SelectValue placeholder="Choose bill" /></SelectTrigger><SelectContent>{shopBills.map(b => <SelectItem key={b.id} value={b.id}>{b.bill_number} · Due {inr(b.balance)}</SelectItem>)}</SelectContent></Select>
                <Input type="number" min="0.01" step="0.01" value={editAmount} onChange={e => setEditAmount(e.target.value)} />
                <div className="flex gap-2"><Button type="button" className="flex-1" disabled={updateAllocation.isPending} onClick={() => updateAllocation.mutate()}>{updateAllocation.isPending ? "Saving…" : "Save adjustment"}</Button><Button type="button" variant="outline" onClick={() => setEditingAllocation(null)}>Cancel</Button></div>
              </div>}
              <div className="space-y-1.5"><Label>Bill (same shop only)</Label>
                <Select value={allocBill} onValueChange={setAllocBill}><SelectTrigger><SelectValue placeholder="Choose bill" /></SelectTrigger><SelectContent>{shopBills.map(b => <SelectItem key={b.id} value={b.id}>{b.bill_number} · Due {inr(b.balance)}</SelectItem>)}</SelectContent></Select>
              </div>
              <div className="space-y-1.5"><Label>Amount to allocate (₹)</Label><Input type="number" min="0.01" max={Math.min(unallocated, Number(shopBills.find(b=>b.id===allocBill)?.balance ?? 0))} step="0.01" value={allocAmount} onChange={e=>setAllocAmount(e.target.value)} /></div>
              <Button className="w-full" disabled={allocate.isPending} onClick={() => allocate.mutate()}>{allocate.isPending ? "Allocating…" : "Adjust against bill"}</Button>
            </>}
            {paymentsToAdjust.length === 0 && <p className="text-sm text-muted-foreground">No Without Bill Payments available to adjust.</p>}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
