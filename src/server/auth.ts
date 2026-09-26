import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import type { RoleCode } from "@prisma/client";
import { db } from "@/server/db";
import { describeDevice } from "@/lib/access";

const credentialsSchema = z.object({ username: z.string().min(1), password: z.string().min(1) });

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: "jwt" },
  providers: [Credentials({
    credentials: { username: { label: "Username" }, password: { label: "Password", type: "password" } },
    async authorize(raw, request) {
      const parsed = credentialsSchema.safeParse(raw);
      if (!parsed.success) return null;
      const user = await db.user.findUnique({
        where: { username: parsed.data.username },
        include: { role: true, outlets: true },
      });
      const valid = user && user.status === "ACTIVE" && await bcrypt.compare(parsed.data.password, user.passwordHash);
      const userAgent = request.headers.get("user-agent"); const ipAddress = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? request.headers.get("x-real-ip");
      await db.loginLog.create({
        data: { username: parsed.data.username, userId: valid ? user.id : undefined, outletId: valid ? user.defaultOutletId : undefined, success: Boolean(valid), failureReason: valid ? undefined : "Invalid credentials", ipAddress, userAgent, device: describeDevice(userAgent) },
      });
      if (!valid || !user) return null;
      return { id: user.id, name: user.name, role: user.role.code, outletIds: user.outlets.map((entry) => entry.outletId), defaultOutletId: user.defaultOutletId };
    },
  })],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.outletIds = user.outletIds;
        token.defaultOutletId = user.defaultOutletId;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.sub ?? "";
      session.user.role = token.role as RoleCode;
      session.user.outletIds = Array.isArray(token.outletIds) ? token.outletIds.filter((id): id is string => typeof id === "string") : [];
      session.user.defaultOutletId = typeof token.defaultOutletId === "string" ? token.defaultOutletId : null;
      return session;
    },
  },
  pages: { signIn: "/login" },
});
