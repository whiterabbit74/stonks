/** Read a JSON value from localStorage, returning `fallback` on any error or missing key. */
export function lsGet<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v !== null ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}

/** Write a JSON value to localStorage, silently swallowing errors. */
export function lsSet(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch { /* quota exceeded or private mode */ }
}
