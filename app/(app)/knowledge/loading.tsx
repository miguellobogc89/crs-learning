// app/(app)/knowledge/loading.tsx

import { Skeleton } from "@/components/ui/skeleton";

export default function KnowledgeLoading() {
  return (
    <div className="min-h-full bg-background">
      <div className="mx-auto max-w-7xl px-8 py-6">
        <div className="space-y-6">
          <KnowledgeToolbarSkeleton />
          <KnowledgeExplorerSkeleton />
        </div>
      </div>
    </div>
  );
}

function KnowledgeToolbarSkeleton() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-4 w-56" />

      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-10 w-10" />
          <Skeleton className="h-10 w-10" />
          <Skeleton className="h-10 w-36" />
        </div>
      </div>
    </div>
  );
}

function KnowledgeExplorerSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      <KnowledgeFolderSkeleton />
      <KnowledgeFolderSkeleton />

      <KnowledgeCardSkeleton />
      <KnowledgeCardSkeleton />
      <KnowledgeCardSkeleton />
      <KnowledgeCardSkeleton />
      <KnowledgeCardSkeleton />
      <KnowledgeCardSkeleton />
    </div>
  );
}

function KnowledgeFolderSkeleton() {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-4">
        <Skeleton className="h-11 w-11 rounded-xl" />
        <Skeleton className="h-6 w-16 rounded-full" />
      </div>

      <div className="mt-5 space-y-3">
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-4 w-full" />
      </div>

      <div className="mt-6 flex items-center gap-2">
        <Skeleton className="h-5 w-12 rounded-full" />
        <Skeleton className="h-5 w-12 rounded-full" />
        <Skeleton className="h-5 w-12 rounded-full" />
      </div>
    </div>
  );
}

function KnowledgeCardSkeleton() {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-4">
        <Skeleton className="h-11 w-11 rounded-xl" />
        <Skeleton className="h-8 w-8 rounded-md" />
      </div>

      <div className="mt-5 space-y-3">
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
      </div>

      <div className="mt-6 flex items-center justify-between gap-4">
        <Skeleton className="h-6 w-24 rounded-full" />
        <Skeleton className="h-4 w-20" />
      </div>
    </div>
  );
}
