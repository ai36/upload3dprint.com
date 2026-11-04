// T026, P1 «Оформить» 4: model file and settings survive the trip to the payment page (IndexedDB, files up to 100 MB).
export interface Draft {
  file: File;
  model_id: string;
  fields: Record<string, string>; // element id → value
}

const open = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open('upload3dprint', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('draft');
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest) {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const r = fn(db.transaction('draft', mode).objectStore('draft'));
    r.onsuccess = () => resolve(r.result as T);
    r.onerror = () => reject(r.error);
  });
}

export const saveDraft = (d: Draft) => tx<void>('readwrite', (s) => s.put(d, 'current'));
export const loadDraft = () => tx<Draft | undefined>('readonly', (s) => s.get('current'));
export const clearDraft = () => tx<void>('readwrite', (s) => s.delete('current'));
