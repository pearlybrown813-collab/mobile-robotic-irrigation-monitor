// client/src/api.ts -- small wrapper around fetch that adds the login token.
const TOKEN_KEY = "irrigation_token";

export const session = {
  get token(): string | null {
    try { return sessionStorage.getItem(TOKEN_KEY); } catch { return null; }
  },
  set(token: string) {
    try { sessionStorage.setItem(TOKEN_KEY, token); } catch { /* storage blocked */ }
  },
  clear() {
    try { sessionStorage.removeItem(TOKEN_KEY); } catch { /* storage blocked */ }
  },
};

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

let onUnauthorized: () => void = () => {};
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

export async function api<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (session.token) headers.Authorization = `Bearer ${session.token}`;
  const res = await fetch(path, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  if (res.status === 401 && path !== "/api/auth/login") {
    session.clear();
    onUnauthorized();
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? `Request failed (${res.status})`);
  return data as T;
}

/** Formats a UTC timestamp from the server in the viewer's local time. */
export function formatTime(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
