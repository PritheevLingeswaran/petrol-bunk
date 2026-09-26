"use client";
import { useFormStatus } from "react-dom";

// Sign-in can take a few seconds; without feedback people click again.
export function SubmitButton() {
  const { pending } = useFormStatus();
  return <button className="button" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button>;
}
