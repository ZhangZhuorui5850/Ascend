export type OfflineReviewOperation = {
  operationId: string;
  workspaceKey: string;
  day: string;
  knowledgePointId: string;
  score: number;
  note?: string;
  createdAt: string;
};

const DB_NAME = "ascend-learning";
const DB_VERSION = 2;

export async function cacheReviewSnapshot(workspaceKey: string, day: string, reviews: unknown[]): Promise<void> {
  const db = await openDb();
  await requestDone(db.transaction("snapshots", "readwrite").objectStore("snapshots").put({ key: `${workspaceKey}:${day}`, workspaceKey, day, reviews, updatedAt: new Date().toISOString() }));
  db.close();
}

export async function queueOfflineReview(operation: OfflineReviewOperation): Promise<void> {
  const db = await openDb();
  await requestDone(db.transaction("outbox", "readwrite").objectStore("outbox").put(operation));
  db.close();
}

export async function getOfflineReviewCount(workspaceKey: string): Promise<number> {
  const db = await openDb();
  const operations = await requestDone<OfflineReviewOperation[]>(db.transaction("outbox", "readonly").objectStore("outbox").getAll());
  db.close();
  return operations.filter((operation) => operation.workspaceKey === workspaceKey).length;
}

export async function flushOfflineReviews(workspaceKey: string): Promise<number> {
  const db = await openDb();
  const allOperations = await requestDone<OfflineReviewOperation[]>(db.transaction("outbox", "readonly").objectStore("outbox").getAll());
  const operations = allOperations.filter((operation) => operation.workspaceKey === workspaceKey);
  if (!operations.length) {
    db.close();
    return 0;
  }
  const response = await fetch("/api/reviews/sync", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ operations }),
  });
  if (!response.ok) {
    db.close();
    throw new Error("离线复习同步失败");
  }
  const transaction = db.transaction("outbox", "readwrite");
  const store = transaction.objectStore("outbox");
  for (const operation of operations) store.delete(operation.operationId);
  await transactionDone(transaction);
  db.close();
  return operations.length;
}

export async function clearOfflineLearningData(): Promise<void> {
  const db = await openDb();
  const transaction = db.transaction(["outbox", "snapshots"], "readwrite");
  transaction.objectStore("outbox").clear();
  transaction.objectStore("snapshots").clear();
  await transactionDone(transaction);
  db.close();
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("outbox")) db.createObjectStore("outbox", { keyPath: "operationId" });
      if (db.objectStoreNames.contains("snapshots")) {
        const store = request.transaction?.objectStore("snapshots");
        if (store?.keyPath !== "key") db.deleteObjectStore("snapshots");
      }
      if (!db.objectStoreNames.contains("snapshots")) db.createObjectStore("snapshots", { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function requestDone<T = undefined>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}
