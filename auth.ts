// auth.ts
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { prisma } from "@/lib/prisma";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID!,
      clientSecret: process.env.AUTH_GOOGLE_SECRET!,
    }),
  ],

  callbacks: {
    async signIn({ user, account }) {
      if (!user.email) {
        return false;
      }

      await prisma.users.upsert({
        where: {
          email: user.email,
        },
        update: {
          name: user.name,
          image: user.image,
          provider: account?.provider ?? "google",
          updated_at: new Date(),
        },
        create: {
          email: user.email,
          name: user.name,
          image: user.image,
          provider: account?.provider ?? "google",
        },
      });

      return true;
    },

    async jwt({ token }) {
      if (!token.email) {
        return token;
      }

      const dbUser = await prisma.users.findUnique({
        where: {
          email: token.email,
        },
        select: {
          id: true,
          xp: true,
          level: true,
          status: true,
        },
      });

      if (dbUser) {
        token.userId = dbUser.id;
        token.xp = dbUser.xp;
        token.level = dbUser.level;
        token.status = dbUser.status;
      }

      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.userId as string;
        session.user.xp = token.xp as number;
        session.user.level = token.level as number;
        session.user.status = token.status as string;
      }

      return session;
    },
  },
});