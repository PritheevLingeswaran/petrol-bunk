import { AuthError, CredentialsSignin } from "next-auth";
import { redirect } from "next/navigation";
import { signIn } from "@/server/auth";
import { db } from "@/server/db";
import { SubmitButton } from "./submit-button";

export default function LoginPage({ searchParams }: { searchParams: { error?: string } }) {
  return (
    <main className="login">
      <form
        action={async (formData) => {
          "use server";
          try {
            await signIn("credentials", { username: formData.get("username"), password: formData.get("password"), redirect: false });
          } catch (error) {
            if (error instanceof AuthError) redirect(`/login?error=${error instanceof CredentialsSignin && error.code === "locked" ? "locked" : "1"}`);
            throw error;
          }
          // Go straight to the right screen: an action redirect followed by a
          // layout redirect renders a blank page in Next 14.
          const user = await db.user.findUnique({ where: { username: String(formData.get("username")) }, select: { mustChangePassword: true } });
          redirect(user?.mustChangePassword ? "/account/password" : "/");
        }}
        className="login-card"
      >
        <p className="eyebrow">FUEL LEDGER</p>
        <h1>Sign in</h1>
        <p>Use your assigned outlet-management account.</p>
        {searchParams.error && <div className="info-bar" role="alert">{searchParams.error === "locked" ? "Too many wrong attempts. This account is locked for a while — try later, or ask the owner to reset the password." : searchParams.error === "suspended" ? "This account is suspended. Ask the owner." : "Wrong username or password."}</div>}
        <label className="field">
          <span>Username</span>
          <input name="username" required autoFocus autoComplete="username" />
        </label>
        <label className="field">
          <span>Password</span>
          <input name="password" type="password" required autoComplete="current-password" />
        </label>
        <SubmitButton />
      </form>
    </main>
  );
}
