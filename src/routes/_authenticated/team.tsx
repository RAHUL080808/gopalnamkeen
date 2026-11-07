import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { UserPlus, Pencil, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { createEmployee, updateEmployee, deleteEmployee } from "@/lib/staff.functions";
import { inr } from "@/lib/format";
import { Card, Empty, PageTitle } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { pageMeta } from "@/lib/page-meta";

export const Route = createFileRoute("/_authenticated/team")({
  head: () => pageMeta("Team — CreditBook", "Manage drivers and salesmen and view their payment collections."),
  component: TeamPage,
});

function TeamPage() {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const qc = useQueryClient();
  const remove = useMutation({
    mutationFn: (user_id: string) => deleteEmployee({ data: { user_id } }),
    onSuccess: () => { toast.success("Team member access removed. Payment history is preserved."); qc.invalidateQueries({ queryKey: ["team"] }); },
    onError: (e) => toast.error((e as Error).message),
  });
  const { data = [] } = useQuery({
    queryKey: ["team"],
    queryFn: async () => {
      const [{ data: roles }, { data: profiles }, { data: pays }] = await Promise.all([
        supabase.from("user_roles").select("user_id, role").neq("role", "owner"),
        supabase.from("profiles").select("id, full_name, phone"),
        supabase.from("payments").select("employee_id, amount, paid_at").eq("is_void", false),
      ]);
      const today = new Date().toDateString();
      return (roles ?? []).map((r) => {
        const p = profiles?.find((x) => x.id === r.user_id);
        const mine = (pays ?? []).filter((x) => x.employee_id === r.user_id);
        return {
          id: r.user_id, role: r.role, name: p?.full_name ?? "", phone: p?.phone,
          total: mine.reduce((s, x) => s + Number(x.amount), 0),
          today: mine.filter((x) => new Date(x.paid_at).toDateString() === today).reduce((s, x) => s + Number(x.amount), 0),
          count: mine.length,
        };
      });
    },
  });

  return (
    <div className="space-y-5">
      <div className="rounded-3xl border border-border/70 bg-gradient-to-br from-card to-muted/60 p-5 shadow-sm sm:p-6"><div className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">People & performance</div><PageTitle title="Team & collections" action={<Button className="rounded-xl shadow-md shadow-primary/15" onClick={() => setOpen(true)}><UserPlus className="h-4 w-4" /> Add</Button>} /></div>
      {data.length === 0 ? <Empty>No drivers or salesmen yet.</Empty> : (
        <Card className="divide-y divide-border/60 overflow-hidden">
          {data.map((e) => (
            <div key={e.id} className="flex items-center justify-between gap-3 p-4 transition-colors hover:bg-muted/40">
              <div className="min-w-0">
                <div className="truncate font-semibold">{e.name}</div>
                <div className="text-xs capitalize text-muted-foreground">{e.role}{e.phone ? ` · ${e.phone}` : ""} · {e.count} payments</div>
              </div>
              <div className="flex items-center gap-2">
                <div className="text-right">
                  <div className="tabular font-bold text-success">{inr(e.total)}</div>
                  <div className="tabular text-xs text-muted-foreground">Today {inr(e.today)}</div>
                </div>
                <Button type="button" size="icon" variant="outline" aria-label="Edit team member" onClick={() => setEditing(e)}><Pencil className="h-4 w-4" /></Button>
                <Button type="button" size="icon" variant="destructive" aria-label="Remove team member" disabled={remove.isPending} onClick={() => { if (window.confirm("Remove " + (e.name || "this team member") + "? They will lose app access, but payment history will remain.")) remove.mutate(e.id); }}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </div>
          ))}
        </Card>
      )}
      <AddEmployee open={open} onOpenChange={setOpen} />
      <EditEmployee employee={editing} onOpenChange={(v) => { if (!v) setEditing(null); }} />
    </div>
  );
}

function AddEmployee({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ full_name: "", email: "", phone: "", password: "", role: "driver" as "driver" | "salesman" });
  const m = useMutation({
    mutationFn: () => createEmployee({ data: { ...f, phone: f.phone || undefined } }),
    onSuccess: () => {
      toast.success("Employee added. Share the email and password with them.");
      setF({ full_name: "", email: "", phone: "", password: "", role: "driver" });
      qc.invalidateQueries();
      onOpenChange(false);
    },
    onError: (e) => toast.error((e as Error).message),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Add driver / salesman</DialogTitle></DialogHeader>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
          <div className="grid grid-cols-2 gap-2">
            {(["driver", "salesman"] as const).map((r) => (
              <button key={r} type="button" onClick={() => setF({ ...f, role: r })} className={`h-11 rounded-lg border text-sm font-semibold capitalize ${f.role === r ? "border-primary bg-primary text-primary-foreground" : "bg-card"}`}>{r}</button>
            ))}
          </div>
          <div className="space-y-1.5"><Label>Full name</Label><Input required minLength={2} maxLength={80} value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Login email</Label><Input type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Phone</Label><Input type="tel" maxLength={20} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Password (min 8)</Label><Input type="text" required minLength={8} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></div>
          <Button type="submit" className="w-full" disabled={m.isPending}>{m.isPending ? "Creating…" : "Create account"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}


function EditEmployee({ employee, onOpenChange }: { employee: any; onOpenChange: (open: boolean) => void }) {
  const qc = useQueryClient();
  const [full_name, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<"driver" | "salesman">("driver");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (employee) {
      setFullName(employee.name ?? "");
      setPhone(employee.phone ?? "");
      setRole(employee.role === "salesman" ? "salesman" : "driver");
      setEmail("");
      setPassword("");
    }
  }, [employee]);

  const mutation = useMutation({
    mutationFn: () => updateEmployee({ data: {
      user_id: employee.id, full_name, phone: phone || undefined, role,
      email: email.trim() || undefined, password: password || undefined,
    } }),
    onSuccess: () => {
      toast.success("Team member updated.");
      qc.invalidateQueries({ queryKey: ["team"] });
      onOpenChange(false);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <Dialog open={!!employee} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Edit team member</DialogTitle></DialogHeader>
        {employee && <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); mutation.mutate(); }}>
          <div className="grid grid-cols-2 gap-2">
            {(["driver", "salesman"] as const).map((r) => (
              <button key={r} type="button" onClick={() => setRole(r)} className={"h-11 rounded-lg border text-sm font-semibold capitalize " + (role === r ? "border-primary bg-primary text-primary-foreground" : "bg-card")}>{r}</button>
            ))}
          </div>
          <div className="space-y-1.5"><Label>Full name</Label><Input required minLength={2} maxLength={80} value={full_name} onChange={(e) => setFullName(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Phone</Label><Input type="tel" maxLength={20} value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>New login email (optional)</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Leave blank to keep current email" /></div>
          <div className="space-y-1.5"><Label>New password (optional)</Label><Input type="password" minLength={8} maxLength={72} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Leave blank to keep current password" /></div>
          <Button type="submit" className="w-full" disabled={mutation.isPending}>{mutation.isPending ? "Saving…" : "Save changes"}</Button>
        </form>}
      </DialogContent>
    </Dialog>
  );
}
