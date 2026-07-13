import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Refresca la sesión de Supabase y protege /app. Doble modo:
 *  - Sin claves de Supabase → pasa de largo (modo local, sin login).
 *  - Con claves → exige sesión para /app; si ya hay sesión, saca de /login|/signup.
 */
export async function middleware(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return NextResponse.next();

  let res = NextResponse.next({ request: req });
  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
        cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value));
        res = NextResponse.next({ request: req });
        cookiesToSet.forEach(({ name, value, options }) =>
          res.cookies.set(name, value, options as Parameters<typeof res.cookies.set>[2]),
        );
      },
    },
  });

  const { data: { user } } = await supabase.auth.getUser();
  const path = req.nextUrl.pathname;

  if (!user && path.startsWith("/app")) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  if (user && (path === "/login" || path === "/signup")) {
    return NextResponse.redirect(new URL("/app", req.url));
  }
  return res;
}

export const config = {
  matcher: ["/app/:path*", "/login", "/signup"],
};
