import { useState } from "react";
import { Camera, PenLine } from "lucide-react";
import { useMe } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BillDialog } from "@/components/bill-dialog";
import { BillPhotoDialog } from "@/components/bill-photo-dialog";

// Wrap new-entry entry points only. BillDialog, its props and edit paths stay untouched.
export function BillEntryDialog({ open, onOpenChange, shopId, driverMode = false }: {
  open: boolean; onOpenChange: (open: boolean) => void; shopId?: string; driverMode?: boolean;
}) {
  const { data: me, isLoading } = useMe();
  const [mode, setMode] = useState<"choose" | "photo" | "manual">("choose");
  function changeOpen(next: boolean) {
    if (!next) setMode("choose");
    onOpenChange(next);
  }
  // Wait for role resolution before choosing the entry flow; otherwise an owner can briefly fall through to manual mode.
  if (isLoading) return null;
  // Every non-owner keeps the exact pre-existing manual behavior and permissions.
  if (me?.role !== "owner" || mode === "manual") return <BillDialog open={open} onOpenChange={changeOpen} {...(shopId ? { shopId } : {})} driverMode={driverMode} />;
  if (!open) return null;
  if (mode === "photo") return <BillPhotoDialog {...(shopId ? { shopId } : {})} onClose={() => changeOpen(false)} />;
  return <Dialog open={open} onOpenChange={changeOpen}>
    <DialogContent className="max-w-sm" aria-describedby={undefined}>
      <DialogHeader><DialogTitle>Add bill</DialogTitle></DialogHeader>
      <div className="grid grid-cols-2 gap-3">
        <Button type="button" variant="outline" className="h-28 flex-col gap-3 text-base" onClick={() => setMode("photo")}><Camera className="h-7 w-7 text-accent-foreground" /> Photo</Button>
        <Button type="button" variant="outline" className="h-28 flex-col gap-3 text-base" onClick={() => setMode("manual")}><PenLine className="h-7 w-7 text-primary" /> Manual</Button>
      </div>
    </DialogContent>
  </Dialog>;
}