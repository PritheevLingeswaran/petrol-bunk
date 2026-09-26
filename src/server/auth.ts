import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import type { RoleCode } from "@prisma/client";
import { db } from "@/server/db";
import { describeDevice } from "@/lib/access";
import { loadSettings } from "@/server/settings";

const credentialsSchema = z.object({ username: z.string().min(1), password: z.string().min(1) });
class AccountLocked extends CredentialsSignin { code = "locked"; }

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
      const now = new Date();
      const locked = Boolean(user?.lockedUntil && user.lockedUntil > now);
      const valid = user && user.status === "ACTIVE" && !locked && await bcrypt.compare(parsed.data.password, user.passwordHash);
      const userAgent = request.headers.get("user-agent"); const ipAddress = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? request.headers.get("x-real-ip");
      await db.loginLog.create({
        data: { username: parsed.data.username, userId: valid ? user.id : undefined, outletId: valid ? user.defaultOutletId : undefined, success: Boolean(valid), failureReason: valid ? undefined : locked ? "Account locked" : "Invalid credentials", ipAddress, userAgent, device: describeDevice(userAgent) },
      });
      if (user && valid) await db.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: now } });
      if (user && !valid && !locked) {
        // Global settings only (no outlet row matches ""): lockout is per user, not per outlet.
        const settings = await loadSettings(user.defaultOutletId ?? "");
        const failed = user.failedLoginCount + 1;
        const lockNow = failed >= settings.number("security.maxFailedLogins");
        await db.user.update({ where: { id: user.id }, data: lockNow ? { failedLoginCount: 0, lockedUntil: new Date(now.getTime() + settings.number("security.lockoutMinutes") * 60_000) } : { failedLoginCount: failed } });
        if (lockNow) throw new AccountLocked();
      }
      if (locked) throw new AccountLocked();
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
