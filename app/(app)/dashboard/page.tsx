// app/(app)/dashboard/page.tsx

import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { AppPageLayout } from "@/components/app/layouts/app-page-layout";
import { AppSectionShell } from "@/components/app/section-sidebar";
import { AppPageHeader } from "@/components/app/layouts/app-page-header";
import { AdministrationView } from "@/components/home/administration/administration-view";
import { HomeNavigation } from "@/components/home/navigation/home-navigation";
import { OrganizationAside } from "@/components/home/organization/organization-aside";
import { OrganizationView } from "@/components/home/organization/organization-view";
import { HomeOverview } from "@/components/home/overview/home-overview";
import { HomeOverviewAside } from "@/components/home/overview/home-overview-aside";
import { PlanUsageView } from "@/components/home/plan/plan-usage-view";
import { APP_SECTIONS } from "@/lib/navigation/app-sections";
import {
  getHomeSection,
  type HomeView,
} from "@/lib/navigation/home-sections";
import {
  getDashboardOverview,
  getDashboardRecentActivity,
} from "@/lib/services/dashboard.service";
import { getActiveWorkspaceContext } from "@/lib/services/workspace.service";

type Props = {
  searchParams: Promise<{
    view?: string;
  }>;
};

export default async function HomePage({
  searchParams,
}: Props) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/");
  }

  const { view } = await searchParams;

  const section =
    getHomeSection(view);

  const { activeWorkspace } =
    await getActiveWorkspaceContext(
      session.user.id,
    );

  const isOverview =
    section.id === "overview";

  const [overview, recentActivity] =
    isOverview
      ? await Promise.all([
          getDashboardOverview({
            userId: session.user.id,
            workspaceId:
              activeWorkspace.id,
          }),
          getDashboardRecentActivity({
            userId: session.user.id,
            workspaceId:
              activeWorkspace.id,
            limit: 10,
          }),
        ])
      : [null, []];

const header = (
  <AppPageHeader
    section={APP_SECTIONS.dashboard}
    title={section.label}
    actions={
      isOverview ? (
        <Link
          href="/knowledge"
          className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl bg-[#0A58FF] px-4 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700"
        >
          <span className="text-lg leading-none">
            +
          </span>
          Añadir conocimiento
        </Link>
      ) : undefined
    }
  />
);

  const content = renderContent({
    view: section.id,
    userId: session.user.id,
    activeWorkspace,
    overview,
  });

  const aside = renderAside({
    view: section.id,
    activeWorkspace,
    overview,
    recentActivity,
  });

  return (
    <AppSectionShell
      sidebar={<HomeNavigation />}
    >
      <AppPageLayout
        header={header}
        aside={aside}
        reserveAside
        contentClassName="overflow-y-auto pb-6"
      >
        {content}
      </AppPageLayout>
    </AppSectionShell>
  );
}

function renderContent({
  view,
  userId,
  activeWorkspace,
  overview,
}: {
  view: HomeView;
  userId: string;
  activeWorkspace: {
    id: string;
    name: string;
    description: string | null;
    role: string;
  };
  overview:
    | Awaited<
        ReturnType<
          typeof getDashboardOverview
        >
      >
    | null;
}) {
  switch (view) {
    case "organization":
      return (
        <OrganizationView
          userId={userId}
          workspaceId={
            activeWorkspace.id
          }
          workspaceName={
            activeWorkspace.name
          }
        />
      );

    case "administration":
      return (
        <AdministrationView
          workspaceName={
            activeWorkspace.name
          }
          workspaceDescription={
            activeWorkspace.description
          }
          role={
            activeWorkspace.role
          }
        />
      );

    case "plan":
      return (
        <PlanUsageView
          userId={userId}
        />
      );

    case "overview":
    default:
      if (!overview) {
        return null;
      }

      return (
        <HomeOverview
          documentCount={
            overview.documentCount
          }
          storageBytes={
            overview.storageBytes
          }
          folderCount={
            overview.folderCount
          }
          analyzedCount={
            overview.analyzedCount
          }
          recentDocuments={
            overview.recentDocuments
          }
        />
      );
  }
}

function renderAside({
  view,
  activeWorkspace,
  overview,
  recentActivity,
}: {
  view: HomeView;
  activeWorkspace: {
    name: string;
    role: string;
  };
  overview:
    | Awaited<
        ReturnType<
          typeof getDashboardOverview
        >
      >
    | null;
  recentActivity: Awaited<
    ReturnType<
      typeof getDashboardRecentActivity
    >
  >;
}) {
  switch (view) {
    case "organization":
      return (
        <OrganizationAside
          workspaceName={
            activeWorkspace.name
          }
          role={
            activeWorkspace.role
          }
        />
      );

    case "overview":
      if (!overview) {
        return null;
      }

      return (
        <HomeOverviewAside
          healthyPercent={
            overview.healthyPercent
          }
          needsReviewPercent={
            overview.needsReviewPercent
          }
          pendingPercent={
            overview.pendingPercent
          }
          topDocuments={
            overview.topDocuments
          }
          recentActivity={
            recentActivity
          }
        />
      );

    case "administration":
    case "plan":
    default:
      return null;
  }
}