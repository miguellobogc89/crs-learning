// auth.ts
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";

import { normalizeEmail, verifyPassword } from "@/lib/auth/password";
import { sendWelcomeEmail } from "@/lib/email/email.service";
import { prisma } from "@/lib/prisma";
import { ensureWorkspaceBootstrap } from "@/lib/services/workspace.service";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID!,
      clientSecret: process.env.AUTH_GOOGLE_SECRET!,
    }),

    Credentials({
      credentials: {
        email: {},
        password: {},
      },

      async authorize(credentials) {
        const email = credentials?.email;
        const password = credentials?.password;

        if (
          typeof email !== "string" ||
          typeof password !== "string"
        ) {
          return null;
        }

        const normalizedEmail = normalizeEmail(email);

        const dbUser = await prisma.users.findUnique({
          where: {
            email: normalizedEmail,
          },
          select: {
            id: true,
            email: true,
            name: true,
            image: true,
            password_hash: true,
            email_verified_at: true,
            xp: true,
            level: true,
            status: true,
          },
        });

        if (
          !dbUser ||
          !dbUser.password_hash ||
          !dbUser.email_verified_at ||
          dbUser.status !== "active"
        ) {
          return null;
        }

        const isValidPassword = await verifyPassword(
          password,
          dbUser.password_hash,
        );

        if (!isValidPassword) {
          return null;
        }

        return {
          id: dbUser.id,
          email: dbUser.email,
          name: dbUser.name,
          image: dbUser.image,
          xp: dbUser.xp,
          level: dbUser.level,
          status: dbUser.status,
        };
      },
    }),
  ],

  callbacks: {
    async signIn({ user, account }) {
      if (!user.email) {
        return false;
      }

      if (account?.provider === "credentials") {
        return true;
      }

      const email = normalizeEmail(user.email);
      const now = new Date();
      const existingUser = await prisma.users.findUnique({
        where: {
          email,
        },
        select: {
          id: true,
        },
      });

      const dbUser = existingUser
        ? await prisma.users.update({
            where: {
              id: existingUser.id,
            },
            data: {
              name: user.name,
              image: user.image,
              provider: "google",
              email_verified_at: now,
              last_login_at: now,
              updated_at: now,
            },
          })
        : await prisma.users.create({
            data: {
              email,
              name: user.name,
              image: user.image,
              provider: "google",
              email_verified_at: now,
              last_login_at: now,
            },
          });

      await ensureWorkspaceBootstrap(dbUser.id);

      if (!existingUser) {
        await sendWelcomeEmail({
          to: dbUser.email,
          name: dbUser.name,
        });
      }

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
