// components/admin/user-edit-form.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { adminUpdateUser } from "@/app/actions/admin-user.actions";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

interface UserEditFormProps {
  user: {
    id: string;
    email: string;
    name: string | null;
    status: string;
  };
}

export function UserEditForm({ user }: UserEditFormProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: user.name || "",
    status: user.status,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      await adminUpdateUser(user.id, {
        name: formData.name || undefined,
        status: formData.status,
      });

      router.refresh();
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Error al actualizar usuario",
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/30 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      <div>
        <Label htmlFor="email">Email (no editable)</Label>
        <Input
          id="email"
          type="email"
          value={user.email}
          disabled
          className="mt-2"
        />
        <p className="mt-2 text-xs text-muted-foreground">
          El email no puede ser modificado desde el panel de administración
        </p>
      </div>

      <div>
        <Label htmlFor="name">Nombre</Label>
        <Input
          id="name"
          type="text"
          value={formData.name}
          onChange={(e) =>
            setFormData({ ...formData, name: e.target.value })
          }
          placeholder="Nombre del usuario"
          className="mt-2"
        />
      </div>

      <div>
        <Label htmlFor="status">Estado</Label>
        <Select
          id="status"
          className="mt-2"
          value={formData.status}
          onChange={(e) =>
            setFormData({ ...formData, status: e.target.value })
          }
        >
          <option value="active">Activo</option>
          <option value="inactive">Inactivo</option>
          <option value="suspended">Suspendido</option>
        </Select>
        <p className="mt-2 text-xs text-muted-foreground">
          El estado activo permite que el usuario acceda al sistema. Inactivo o
          suspendido negará el acceso.
        </p>
      </div>

      <div className="flex gap-3 pt-6">
        <Button type="submit" disabled={isLoading}>
          {isLoading ? "Guardando..." : "Guardar cambios"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={isLoading}
        >
          Cancelar
        </Button>
      </div>
    </form>
  );
}
