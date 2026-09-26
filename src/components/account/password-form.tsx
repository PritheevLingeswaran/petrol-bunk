"use client";
import { useState, useTransition } from "react";
import { changeOwnPassword } from "@/server/account/actions";

type Errors = Record<string, string[] | undefined>;

export function PasswordForm({ forced }: { forced: boolean }) {
  const [errors, setErrors] = useState<Errors>({});
  const [message, setMessage] = useState<string>();
  const [working, start] = useTransition();

  function submit(form: FormData) {
    start(async () => {
      const result = await changeOwnPassword({ current: form.get("current"), next: form.get("next"), confirm: form.get("confirm") });
      if (result.ok) {
        // Full reload: the layout only draws the menu again on a fresh server render.
        window.location.href = "/";
        return;
      }
      setErrors(result.fieldErrors ?? {});
      setMessage(result.error);
    });
  }

  const field = (name: string, label: string, autoComplete: string) => (
    <label className="field">
      <span>{label}</span>
      <input name={name} type="password" required autoComplete={autoComplete} aria-invalid={Boolean(errors[name])} />
      {errors[name]?.map((error) => <small key={error} className="field-error">{error}</small>)}
    </label>
  );

  return (
    <form action={submit} className="panel password-form">
      {forced && <div className="info-bar">You are signed in with a temporary password. Choose your own before you continue.</div>}
      {message && <div className="alert-bar" role="alert">{message}</div>}
      {field("current", forced ? "Temporary password" : "Current password", "current-password")}
      {field("next", "New password (at least 8 characters)", "new-password")}
      {field("confirm", "New password again", "new-password")}
      <button className="button" disabled={working}>{working ? "Saving…" : "Change password"}</button>
    </form>
  );
}
