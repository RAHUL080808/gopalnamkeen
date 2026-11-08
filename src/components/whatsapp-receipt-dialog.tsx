import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { inr, modeLabel } from "@/lib/format";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  phone: string | null | undefined;
  shopName: string;
  amount: number;
  mode: string;
  paidAt: string;
  outstanding: number;
};

export function WhatsAppReceiptDialog({ open, onOpenChange, phone, shopName, amount, mode, paidAt, outstanding }: Props) {
  const digits = (phone ?? "").replace(/\D/g, "");
  const number = digits.length === 10 ? `91${digits}` : digits;
  const valid = digits.length === 10 || (digits.length === 12 && digits.startsWith("91"));
  const date = new Date(paidAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
  const message = [
    "Payment Received – Gopal Namkeen",
    "",
    `Dear ${shopName},`,
    "",
    `We have received your payment of ${inr(amount)}.`,
    `Payment Mode: ${modeLabel(mode as any)}`,
    `Date: ${date}`,
    `Remaining Outstanding: ${inr(outstanding)}`,
    "",
    "Thank you for your payment.",
    "– Gopal Namkeen",
  ].join("\n");
  const url = valid ? `https://wa.me/${number}?text=${encodeURIComponent(message)}` : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Payment saved successfully</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">{valid ? `Send a payment confirmation to ${shopName} on WhatsApp?` : "This shop does not have a valid 10-digit Indian mobile number saved. Update the shop contact details to send a WhatsApp receipt."}</p>
        <div className="flex gap-2">
          <Button className="flex-1" disabled={!valid} onClick={() => { window.open(url, "_blank", "noopener,noreferrer"); onOpenChange(false); }}>Open WhatsApp</Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Skip</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
