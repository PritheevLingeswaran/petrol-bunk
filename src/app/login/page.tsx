import { signIn } from "@/server/auth";

export default function LoginPage() {
  return (
    <main className="login">
      <form
        action={async (formData) => {
          "use server";
          await signIn("credentials", {
            username: formData.get("username"),
            password: formData.get("password"),
            redirectTo: "/",
          });
        }}
        className="login-card"
      >
        <p className="eyebrow">FUEL LEDGER</p>
        <h1>Sign in</h1>
        <p>Use your assigned outlet-management account.</p>
        <label className="field">
          <span>Username</span>
          <input name="username" required autoFocus />
        </label>
        <label className="field">
          <span>Password</span>
          <input name="password" type="password" required />
        </label>
        <button className="button">Sign in</button>
      </form>
    </main>
  );
}
