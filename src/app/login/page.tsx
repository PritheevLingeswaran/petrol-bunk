import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { signIn } from "@/server/auth";
import { SubmitButton } from "./submit-button";

export default function LoginPage({ searchParams }: { searchParams: { error?: string } }) {
  return (
    <main className="login">
      <form
        action={async (formData) => {
          "use server";
          try {
            await signIn("credentials", {
              username: formData.get("username"),
              password: formData.get("password"),
              redirectTo: "/",
            });
          } catch (error) {
            // A wrong password is an AuthError; anything else (the success redirect included) must propagate.
            if (error instanceof AuthError) redirect("/login?error=1");
            throw error;
          }
        }}
        className="login-card"
      >
        <p className="eyebrow">FUEL LEDGER</p>
        <h1>Sign in</h1>
        <p>Use your assigned outlet-management account.</p>
        {searchParams.error && <div className="info-bar" role="alert">Wrong username or password.</div>}
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
