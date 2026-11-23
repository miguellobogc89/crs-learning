import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { headers } from "next/headers";
import { moduleHref } from "@/lib/app/module-domains";
import { BUSINESS_HOME, TRADING_HOME, hasBusinessAccess } from "@/lib/auth/business-access";

export default async function AppEntryPage() {
  const userId = (await auth())?.user?.id;
  if (!userId) redirect("/");

  const home = await hasBusinessAccess(userId) ? BUSINESS_HOME : TRADING_HOME;
  redirect(moduleHref(home, (await headers()).get("host")));
}
