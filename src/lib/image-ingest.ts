import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function copyRemoteImageToSupabase(opts: {
  remoteUrl: string;
  bucket: string; // e.g., "items"
  targetPath: string; // e.g., `original/<clerkId>/<itemId>.png`
}): Promise<{ publicUrl: string }> {
  const res = await fetch(opts.remoteUrl, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Failed to download remote image: ${res.status}`);
  }

  const contentType =
    res.headers.get("content-type")?.split(";")[0].trim() || "image/png";

  const buf = new Uint8Array(await res.arrayBuffer());

  const { error } = await supabaseAdmin.storage
    .from(opts.bucket)
    .upload(opts.targetPath, buf, {
      contentType,
      upsert: true,
    });

  if (error) throw error;

  const publicBase = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${opts.bucket}`;
  return { publicUrl: `${publicBase}/${opts.targetPath}` };
}
