import type { RoleCode } from "@prisma/client";
import "next-auth";

declare module "next-auth" {
  interface User {
    role: RoleCode;
    outletIds: string[];
    defaultOutletId: string | null;
  }
  interface Session {
    user: {
      id: string;
      role: RoleCode;
      outletIds: string[];
      defaultOutletId: string | null;
      name: string;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role: RoleCode;
    outletIds: string[];
    defaultOutletId: string | null;
  }
}
