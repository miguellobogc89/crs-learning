// types/next-auth.d.ts
import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      xp: number;
      level: number;
      status: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }

  interface User {
    id: string;
    xp: number;
    level: number;
    status: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string;
    xp?: number;
    level?: number;
    status?: string;
  }
}