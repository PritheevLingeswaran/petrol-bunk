"use client";

import { useEffect } from "react";
import { RotateCcw } from "lucide-react";

/**
 * Every screen under the shell fails into this instead of a blank page.
 * The message is plain, the digest is shown so a report can be traced, and
 * the retry re-runs the server component rather than reloading the app.
 */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[screen]", error);
  }, [error]);

  return (
    <section className="panel error-state" role="alert">
      <p className="eyebrow">SOMETHING WENT WRONG</p>
      <h1>This screen could not be loaded</h1>
      <p className="muted">Nothing was saved. Try again — if it keeps happening, send the reference below to whoever supports your system.</p>
      <pre>
        {error.message}
        {error.digest ? `\nreference: ${error.digest}` : ""}
      </pre>
      <button className="button" type="button" onClick={reset}>
        <RotateCcw size={15} /> Try again
      </button>
    </section>
  );
}
