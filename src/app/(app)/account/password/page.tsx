import { PasswordForm } from "@/components/account/password-form";
import { signOutAction } from "@/server/account/actions";
import { getAccountState, requireSession } from "@/server/guard";

export default async function Page() {
  const session = await requireSession();
  const account = await getAccountState(session.user.id);
  return (
    <div>
      <div className="section-head">
        <div>
          <p className="eyebrow">ACCOUNT</p>
          <h1>Change password</h1>
          <p className="page-lede muted">Signed in as {session.user.name}.</p>
        </div>
        {/* The forced view has no header, so it carries its own way out. */}
        {account?.mustChangePassword && <form action={signOutAction}><button className="button button-secondary">Sign out</button></form>}
      </div>
      <PasswordForm forced={Boolean(account?.mustChangePassword)} />
    </div>
  );
}
