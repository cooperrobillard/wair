import { auth } from '@clerk/nextjs/server';
import { prisma } from './db';

export async function ensureDbUser() {
  const { userId } = await auth();
  if (!userId) return null;

  const existing = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (existing) return existing;

  return prisma.user.create({ data: { clerkId: userId } });
}
