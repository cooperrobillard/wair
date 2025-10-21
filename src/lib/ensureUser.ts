import { auth } from "@clerk/nextjs/server";
import { prisma } from "./db";

export async function ensureDbUser(passedClerkId?: string) {
  const clerkId = passedClerkId ?? (await auth()).userId;
  if (!clerkId) return null;

  return prisma.user.upsert({
    where: { clerkId },
    update: {},
    create: { clerkId },
  });
}
