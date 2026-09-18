import { NextResponse } from "next/server";
import type { ZodError } from "zod";

// Safe, non-leaking error envelope: a stable machine-readable `code`, a message
// that's specific enough to be useful without leaking internal state, and never
// a stack trace or infra detail.
export function apiError(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export function apiValidationError(error: ZodError) {
  return apiError(400, "validation_failed", error.issues.map((i) => i.message).join("; "));
}

export function apiUnauthorized(message = "Sign in required") {
  return apiError(401, "unauthorized", message);
}

export function apiForbidden(message = "Not allowed") {
  return apiError(403, "forbidden", message);
}

export function apiNotFound(message = "Not found") {
  return apiError(404, "not_found", message);
}

export function apiOk<T>(data: T, status = 200) {
  return NextResponse.json({ data }, { status });
}
