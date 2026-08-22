import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { requireAdmin } from "@/lib/auth/admin";
import { PageTitle } from "@/components/app/page-title";
import { StorageStats } from "@/components/admin/storage-stats";
import { StorageTable } from "@/components/admin/storage-table";
import {
  adminGetStorageFiles,
  adminGetStorageStats,
  adminGetStorageFilterOptions,
} from "@/app/actions/admin-storage.actions";

export default async function AdminStoragePage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/");
  }

  try {
    await requireAdmin(session.user.id);
  } catch {
    redirect("/dashboard");
  }

  const [files, stats, filterOptions] = await Promise.all([
    adminGetStorageFiles(),
    adminGetStorageStats(),
    adminGetStorageFilterOptions(),
  ]);

  return (
    <div className="space-y-6">
      <PageTitle
        title="Almacenamiento"
        description="Administra y monitorea el uso de almacenamiento de Knowledge. Visualiza archivos, tamaños y estado de procesamiento."
      />

      <StorageStats stats={stats} />

      <StorageTable
        initialFiles={files}
        users={filterOptions.users}
        fileTypes={filterOptions.fileTypes}
        statuses={filterOptions.statuses}
        workspaces={filterOptions.workspaces}
      />
    </div>
  );
}
