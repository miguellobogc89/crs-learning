"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";

import { adminUpdateUser } from "@/app/actions/admin-user.actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

type UserAdminEditDialogProps = {
  user: {
    id: string;
    email: string;
    name: string | null;
    status: string;
    systemRole: string;
  };
  editableSystemRoles: string[];
};

const statusOptions = [
  {
    value: "active",
    label: "Activo",
  },
  {
    value: "inactive",
    label: "Inactivo",
  },
  {
    value: "suspended",
    label: "Suspendido",
  },
] as const;

const systemRoleLabels: Record<string, string> = {
  user: "Usuario",
  system_admin: "System Admin",
  system_super_admin: "System Super Admin",
};

export function UserAdminEditDialog({
  user,
  editableSystemRoles,
}: UserAdminEditDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: user.name ?? "",
    status: user.status,
    systemRole: user.systemRole,
  });

  const canChangeSystemRole =
    editableSystemRoles.length > 1;

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    setIsSaving(true);
    setError(null);

    try {
      await adminUpdateUser(user.id, {
        name: formData.name.trim() || undefined,
        status: formData.status,
        system_role: formData.systemRole,
      });

      setOpen(false);
      router.refresh();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "No se pudo actualizar el usuario",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Pencil className="h-4 w-4" />
          Editar usuario
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar usuario</DialogTitle>
          <DialogDescription>
            Actualiza solo los campos administrativos disponibles en el modelo actual.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          {error ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="user-email">
              Email corporativo
            </Label>
            <Input
              id="user-email"
              type="email"
              value={user.email}
              disabled
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="user-name">
              Nombre visible
            </Label>
            <Input
              id="user-name"
              value={formData.name}
              onChange={(event) =>
                setFormData((current) => ({
                  ...current,
                  name: event.target.value,
                }))
              }
              placeholder="Nombre del usuario"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="user-status">
              Estado
            </Label>
            <Select
              id="user-status"
              value={formData.status}
              onChange={(event) =>
                setFormData((current) => ({
                  ...current,
                  status: event.target.value,
                }))
              }
            >
              {statusOptions.map((option) => (
                <option
                  key={option.value}
                  value={option.value}
                >
                  {option.label}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="user-system-role">
              Rol del sistema
            </Label>
            <Select
              id="user-system-role"
              value={formData.systemRole}
              disabled={!canChangeSystemRole}
              onChange={(event) =>
                setFormData((current) => ({
                  ...current,
                  systemRole: event.target.value,
                }))
              }
            >
              {(editableSystemRoles.length > 0
                ? editableSystemRoles
                : [user.systemRole]
              ).map((role) => (
                <option key={role} value={role}>
                  {systemRoleLabels[role] ?? role}
                </option>
              ))}
            </Select>
          </div>

          <DialogFooter className="mt-6">
            <Button
              type="button"
              variant="outline"
              disabled={isSaving}
              onClick={() => setOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              variant="brand"
              disabled={isSaving}
            >
              {isSaving ? "Guardando..." : "Guardar cambios"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
