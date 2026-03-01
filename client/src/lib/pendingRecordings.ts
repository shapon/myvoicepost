const DB_NAME = "mvp_pending_recordings";
const DB_VERSION = 1;
const STORE_NAME = "recordings";

export interface PendingRecording {
  id: string;
  type: "polish" | "translate" | "transcribe";
  audioBlob: Blob;
  mimeType: string;
  createdAt: string;
  attempts: number;
  lastError?: string;
  settings: {
    language?: string;
    sourceLanguage?: string;
    targetLanguage?: string;
    outputFormat?: string;
    outputType?: string;
  };
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function savePendingRecording(
  recording: PendingRecording
): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(recording);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getPendingRecordings(): Promise<PendingRecording[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function removePendingRecording(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 2,
  delayMs = 3000
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      console.error(`[Retry] Attempt ${attempt}/${maxRetries + 1} failed:`, err);
      if (attempt <= maxRetries) {
        console.log(`[Retry] Waiting ${delayMs / 1000}s before retry...`);
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }
  throw lastError;
}
