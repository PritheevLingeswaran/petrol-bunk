/**
 * The row a table shows when it has nothing to show.
 *
 * A table that simply renders no rows reads as broken — the user cannot tell
 * whether it is loading, filtered to nothing, or genuinely empty. This says
 * which, and where relevant what to do next.
 */
export function EmptyRow({ colSpan, message, hint }: { colSpan: number; message: string; hint?: string }) {
  return (
    <tr className="empty-row">
      <td colSpan={colSpan}>
        <span className="empty-title">{message}</span>
        {hint ? <span className="muted">{hint}</span> : null}
      </td>
    </tr>
  );
}
