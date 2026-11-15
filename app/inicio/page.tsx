import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { BUSINESS_HOME, TRADING_HOME, hasBusinessAccess } from "@/lib/auth/business-access";

export default async function AppEntryPage() {
  const userId = (await auth())?.user?.id;
  if (!userId) redirect("/");

  redirect(await hasBusinessAccess(userId) ? BUSINESS_HOME : TRADING_HOME);
}
