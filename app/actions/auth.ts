//app/actions/auth.ts
"use server";

import { signIn, signOut } from "@/auth";

export async function loginWithGoogle() {
  await signIn("google", {
    redirectTo: "/knowledge",
  });
}

export async function logout() {
  await signOut({
    redirectTo: "/",
  });
}
