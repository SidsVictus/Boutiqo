import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/supabase/env";

/**
 * Refreshes the Supabase session cookie on every request (the standard
 * @supabase/ssr pattern — without this, a session can silently expire
 * between server-rendered requests even though the browser client still
 * thinks it's valid) and does a coarse, server-side redirect for the
 * obviously-unauthenticated case on protected route groups.
 *
 * This is defense in depth, not the only guard: the real authorization
 * decision is still RLS at the database (every actual read/write is checked
 * there regardless of what this middleware does), and the client-side
 * layout guards in owner/(app)/layout.tsx and admin/(app)/layout.tsx handle
 * the finer-grained cases (disabled boutique, suspended admin, wrong role)
 * that need a Postgres round trip this middleware doesn't make.
 */
export async function proxy(request: NextRequest) {
  const response = NextResponse.next({ request });

  const supabase = createServerClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isProtectedOwner = path.startsWith("/owner/") && !path.startsWith("/owner/signup") && !path.startsWith("/owner/register") && !path.startsWith("/owner/terms") && !path.startsWith("/owner/login") && !path.startsWith("/owner/signout");
  const isProtectedAdmin = path.startsWith("/admin/") && !path.startsWith("/admin/login") && !path.startsWith("/admin/signout");

  if (!user && (isProtectedOwner || isProtectedAdmin)) {
    const loginPath = isProtectedAdmin ? "/admin/login" : "/owner/login";
    return NextResponse.redirect(new URL(loginPath, request.url));
  }

  return response;
}

export const config = {
  matcher: ["/owner/:path*", "/admin/:path*"],
};
