"use client";

import { createClient } from "@/lib/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Phase 3: shared browser Supabase client for the data layer. All six
 * `src/lib/data/*.ts` modules route their real reads/writes through this —
 * it carries the signed-in user's session (via cookies, set up by
 * @supabase/ssr's createBrowserClient), so every query is subject to RLS
 * exactly as the real user, not a privileged bypass.
 *
 * Memoized (not re-created per call) so the same client instance — and the
 * auth listener registered on it by SessionContext — is reused everywhere.
 */
let client: SupabaseClient | null = null;

export function db(): SupabaseClient {
  if (!client) client = createClient();
  return client;
}

/** Small helper for calling Phase 1's Next.js API routes (the ones that need
 * privileged/server-side logic — register, admin-add, uploads, tracking,
 * status/stage/mark-paid/active) with the browser's session cookies attached. */
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const message = body?.error?.message || `Request to ${path} failed (${res.status})`;
    const { ApiError } = await import("./store");
    throw new ApiError(body?.error?.code || "request_failed", message);
  }
  return body?.data as T;
}
