// File: frontend/middleware.ts
// This file provides a minimal valid Next.js middleware export.

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// This function lets requests continue without blocking the app.
export function middleware(_request: NextRequest) {
  return NextResponse.next();
}

// This config tells Next.js which routes should pass through middleware.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)"]
};
