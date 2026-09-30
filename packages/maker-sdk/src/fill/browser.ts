export class BrowserCursorStore {
  readonly key: string;

  constructor(genesis: string, maker: string) {
    this.key = `${genesis}:${maker}`;
  }

  private async database(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open("depth-fills", 1);
      request.onupgradeneeded = () =>
        request.result.createObjectStore("cursors");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async load(): Promise<string | undefined> {
    const database = await this.database();
    try {
      return await new Promise((resolve, reject) => {
        const request = database
          .transaction("cursors", "readonly")
          .objectStore("cursors")
          .get(this.key);
        request.onsuccess = () =>
          resolve(
            typeof request.result === "string" ? request.result : undefined,
          );
        request.onerror = () => reject(request.error);
      });
    } finally {
      database.close();
    }
  }

  async save(cursor: string): Promise<void> {
    if (!/^[1-9A-HJ-NP-Za-km-z]+$/.test(cursor)) {
      throw new RangeError("Fill cursor signature is invalid");
    }
    const database = await this.database();
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction("cursors", "readwrite");
        transaction.objectStore("cursors").put(cursor, this.key);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
    } finally {
      database.close();
    }
  }
}
