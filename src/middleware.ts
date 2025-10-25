import { clerkMiddleware } from "@clerk/nextjs/server";

export default clerkMiddleware();

export const config = {
  matcher: [
    "/items(.*)",
    "/api/items(.*)",
    "/api/scrape",
    "/api/items/from-url",
    "/api/ai-parse",
  ],
};
