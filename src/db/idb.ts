// 小型 IndexedDB 封装：Promise 化，表结构固定
import type { StoreName } from '../types'

const DB_NAME = 'bakery-tray-lab'
const DB_VERSION = 1
const STORES: StoreName[] = ['recipes', 'trays', 'layouts', 'settings']

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      for (const name of STORES) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

function tx<T>(store: StoreName, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode)
        const req = run(t.objectStore(store))
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      }),
  )
}

export async function dbPut<T>(store: StoreName, id: string, value: T): Promise<void> {
  await tx(store, 'readwrite', (s) => s.put(value, id))
}

export async function dbGet<T>(store: StoreName, id: string): Promise<T | undefined> {
  return tx(store, 'readonly', (s) => s.get(id) as IDBRequest<T | undefined>)
}

export async function dbGetAll<T>(store: StoreName): Promise<T[]> {
  return tx(store, 'readonly', (s) => s.getAll() as IDBRequest<T[]>)
}

export async function dbDelete(store: StoreName, id: string): Promise<void> {
  await tx(store, 'readwrite', (s) => s.delete(id))
}

export async function dbClear(store: StoreName): Promise<void> {
  await tx(store, 'readwrite', (s) => s.clear())
}

export function uid(prefix: string): string {
  const rnd = Math.random().toString(36).slice(2, 8)
  return `${prefix}_${Date.now().toString(36)}_${rnd}`
}
