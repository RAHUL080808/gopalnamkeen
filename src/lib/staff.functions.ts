import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const schema = z.object({
  full_name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(255),
  phone: z.string().trim().max(20).optional(),
  password: z.string().min(8).max(72),
  role: z.enum(["driver", "salesman"]),
});

export const createEmployee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => schema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: isOwner } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "owner",
    });
    if (!isOwner) throw new Error("Only the owner can add employees");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.full_name, phone: data.phone ?? null },
    });
    if (error || !created.user) throw new Error(error?.message ?? "Could not create user");
    const { error: rErr } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: created.user.id, role: data.role });
    if (rErr) {
      // Avoid leaving an orphan login if the role could not be assigned.
      await supabaseAdmin.auth.admin.deleteUser(created.user.id);
      throw new Error(rErr.message);
    }
    return { id: created.user.id };
  });


const updateSchema = z.object({
  user_id: z.string().uuid(),
  full_name: z.string().trim().min(2).max(80),
  phone: z.string().trim().max(20).optional(),
  role: z.enum(["driver", "salesman"]),
  email: z.string().trim().email().max(255).optional().or(z.literal("")),
  password: z.string().min(8).max(72).optional().or(z.literal("")),
});

export const updateEmployee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => updateSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: isOwner } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "owner",
    });
    if (!isOwner) throw new Error("Only the owner can edit employees");
    if (data.user_id === context.userId) throw new Error("You cannot edit your own account here");

    const { data: targetRoles, error: targetRoleError } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", data.user_id);
    if (targetRoleError) throw new Error("Could not verify the team member's role");
    if (!targetRoles?.some((entry) => entry.role === "driver" || entry.role === "salesman") ||
        targetRoles.some((entry) => entry.role === "owner")) {
      throw new Error("Only an existing driver or salesman can be edited");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const attributes: { email?: string; password?: string; email_confirm?: boolean } = {};
    if (data.email) { attributes.email = data.email; attributes.email_confirm = true; }
    if (data.password) attributes.password = data.password;
    if (Object.keys(attributes).length) {
      const { error } = await supabaseAdmin.auth.admin.updateUserById(data.user_id, attributes);
      if (error) throw new Error(error.message);
    }

    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .update({ full_name: data.full_name, phone: data.phone || null })
      .eq("id", data.user_id);
    if (profileError) throw new Error(profileError.message);

    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .update({ role: data.role })
      .eq("user_id", data.user_id);
    if (roleError) throw new Error(roleError.message);
    return { success: true };
  });

export const deleteEmployee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ user_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: isOwner } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "owner",
    });
    if (!isOwner) throw new Error("Only the owner can remove employees");
    if (data.user_id === context.userId) throw new Error("You cannot remove your own account");

    const { data: targetRoles, error: targetRoleError } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", data.user_id);
    if (targetRoleError) throw new Error("Could not verify the team member's role");
    if (!targetRoles?.some((entry) => entry.role === "driver" || entry.role === "salesman") ||
        targetRoles.some((entry) => entry.role === "owner")) {
      throw new Error("Only an existing driver or salesman can be removed");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", data.user_id)
      .neq("role", "owner");
    if (roleError) throw new Error(roleError.message);

    const { error: banError } = await supabaseAdmin.auth.admin.updateUserById(data.user_id, {
      ban_duration: "876000h",
    });
    if (banError) throw new Error(banError.message);
    return { success: true };
  });
