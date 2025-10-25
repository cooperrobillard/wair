import { prisma } from "@/lib/db";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type CleanResult =
  | {
      ok: true;
      cleanedUrl: string;
      originalUrl: string | null;
    }
  | {
      ok: false;
      reason: "NO_CREDITS" | "NO_IMAGE";
      originalUrl: string | null;
    };

export async function cleanItemBackground(opts: {
  itemId: string;
  clerkId: string;
  apiKey: string;
  publicBase: string;
}): Promise<CleanResult> {
  const { itemId, clerkId, apiKey, publicBase } = opts;

  const user = await prisma.user.findUnique({
    where: { clerkId },
    select: { id: true },
  });
  if (!user) throw new Error("User not found");

  const item = await prisma.item.findFirst({
    where: { id: itemId, userId: user.id },
    select: { id: true, imageUrl: true, originalUrl: true },
  });
  if (!item) throw new Error("Item not found");

  const sourceImageUrl = item.originalUrl ?? item.imageUrl;
  if (!sourceImageUrl) {
    return { ok: false, reason: "NO_IMAGE", originalUrl: item.originalUrl ?? item.imageUrl ?? null };
  }

  const form = new FormData();
  form.append("image_url", sourceImageUrl);
  form.append("size", "auto");
  form.append("format", "png");

  const resp = await fetch("https://api.remove.bg/v1.0/removebg", {
    method: "POST",
    headers: { "X-Api-Key": apiKey },
    body: form,
    cache: "no-store",
  });
  if (resp.status === 402) {
    console.warn("[cleanItemBackground] remove.bg credits exhausted");
    return { ok: false, reason: "NO_CREDITS", originalUrl: sourceImageUrl };
  }
  if (!resp.ok) throw new Error(`remove.bg failed: ${resp.status}`);

  const bytes = new Uint8Array(await resp.arrayBuffer());
  const cleanPath = `clean/${clerkId}/${item.id}.png`;

  const { error } = await supabaseAdmin.storage
    .from("items")
    .upload(cleanPath, bytes, { contentType: "image/png", upsert: true });
  if (error) throw error;

  const cleanPublicUrl = `${publicBase}/${cleanPath}`;

  await prisma.item.update({
    where: { id: item.id },
    data: {
      imageUrl: cleanPublicUrl,
      ...(item.originalUrl
        ? {}
        : item.imageUrl
        ? { originalUrl: item.imageUrl }
        : {}),
    },
  });

  return { ok: true, cleanedUrl: cleanPublicUrl, originalUrl: item.originalUrl ?? null };
}
