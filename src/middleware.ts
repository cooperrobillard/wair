// src/middleware.ts
import { NextResponse } from "next/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Public routes (no auth required)
const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/favicon.ico",
  "/_next(.*)",
  "/api/(.*)", // keep APIs public for now; remove if you want to protect them
]);

export default clerkMiddleware(async (auth, req) => {
  if (isPublicRoute(req)) return;

  const { userId } = await auth();
  if (!userId) {
    // Not signed in -> send to sign-in
    const url = new URL("/sign-in", req.url);
    return NextResponse.redirect(url);
  }
});

// Standard matcher that ignores static files
export const config = {
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api)(.*)"],
};
