import type { MediaItem } from '@shared/contracts';

export type BrowserDraftItem = MediaItem & Pick<File, 'size' | 'lastModified'>;

interface BrowserDraft {
  revision: number;
  items: BrowserDraftItem[];
}

const STORE = 'drafts';
const KEY = 'current';

export function openBrowserDraft(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('media-location', 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function readBrowserDraft(db: IDBDatabase): Promise<BrowserDraft | undefined> {
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE).objectStore(STORE).get(KEY);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function writeBrowserDraft(db: IDBDatabase, draft: BrowserDraft): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, 'readwrite');
    const store = transaction.objectStore(STORE);
    const request = store.get(KEY);
    let conflict = false;

    request.onsuccess = () => {
      // Compare and write in the same transaction so an older tab cannot overwrite newer work.
      if ((request.result?.revision ?? 0) !== draft.revision) {
        conflict = true;
        transaction.abort();
        return;
      }
      store.put({ ...draft, revision: draft.revision + 1 }, KEY);
    };

    transaction.oncomplete = () => resolve(true);
    transaction.onabort = () => conflict ? resolve(false) : reject(transaction.error);
  });
}
