import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database";
import type { UserRole } from "@/types/database";

const ROLE_HOME: Record<UserRole, string> = {
  worker: "/worker/dashboard",
  recruiter: "/company/dashboard",
  company_owner: "/company/dashboard",
  support: "/admin/dashboard",
  admin: "/admin/dashboard",
};

function sectionRolesFor(pathname: string): UserRole[] | null {
  if (pathname.startsWith("/worker")) return ["worker"];
  if (pathname.startsWith("/company")) return ["recruiter", "company_owner"];
  if (pathname.startsWith("/admin")) return ["admin", "support"];
  return null;
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const requiredRoles = sectionRolesFor(request.nextUrl.pathname);

  if (requiredRoles) {
    if (!user) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("redirect", request.nextUrl.pathname);
      return NextResponse.redirect(loginUrl);
    }

    const { data: profile } = await supabase
      .from("users")
      .select("role,status")
      .eq("id", user.id)
      .single();

    if (!profile || !requiredRoles.includes(profile.role)) {
      const home = profile ? ROLE_HOME[profile.role] : "/login";
      return NextResponse.redirect(new URL(home, request.url));
    }

    if (profile.status === "suspended" || profile.status === "blocked") {
      return NextResponse.redirect(new URL("/account-suspended", request.url));
    }
  }

  return response;
}
