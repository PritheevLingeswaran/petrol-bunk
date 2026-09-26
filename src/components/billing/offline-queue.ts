export type OfflineBill = { clientRequestId: string; payload: Record<string, unknown>; queuedAt: string };
const DB_NAME = "fuel-ledger-billing";
const STORE = "pending-bills";

function openQueue(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "clientRequestId" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function queueBill(payload: Record<string, unknown>): Promise<string> {
  const db = await openQueue();
  const clientRequestId = String(payload.clientRequestId || crypto.randomUUID());
  await new Promise<void>((resolve, reject) => {
    const request = db.transaction(STORE, "readwrite").objectStore(STORE).put({ clientRequestId, payload: { ...payload, clientRequestId }, queuedAt: new Date().toISOString() } satisfies OfflineBill);
    request.onsuccess = () => resolve(); request.onerror = () => reject(request.error);
  });
  db.close(); return clientRequestId;
}

export async function pendingBills(): Promise<OfflineBill[]> {
  const db = await openQueue();
  const rows = await new Promise<OfflineBill[]>((resolve, reject) => { const request = db.transaction(STORE).objectStore(STORE).getAll(); request.onsuccess = () => resolve(request.result as OfflineBill[]); request.onerror = () => reject(request.error); });
  db.close(); return rows.sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));
}

export async function removePendingBill(clientRequestId: string): Promise<void> {
  const db = await openQueue();
  await new Promise<void>((resolve, reject) => { const request = db.transaction(STORE, "readwrite").objectStore(STORE).delete(clientRequestId); request.onsuccess = () => resolve(); request.onerror = () => reject(request.error); });
  db.close();
}
