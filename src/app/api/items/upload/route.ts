import { Buffer } from "node:buffer";
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseServer } from "@/lib/supabaseServer";


export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await req.formData();
  const file = form.get("file") as File | null;
  const path = form.get("path") as string | null;
  if (!file || !path) return NextResponse.json({ error: "file and path required" }, { status: 400 });

  const fileBuffer = Buffer.from(await file.arrayBuffer());

  const { error } = await supabaseServer.storage.from("items").upload(path, fileBuffer, {
    upsert: true,
    contentType: file.type || "application/octet-stream",
  });

  if (error) {
    console.error("[api/items/upload] storage upload failed", { path, message: error.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data } = supabaseServer.storage.from("items").getPublicUrl(path);
  if (!data?.publicUrl) {
    console.error("[api/items/upload] missing public URL", { path });
    return NextResponse.json({ error: "Unable to generate public URL" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, publicUrl: data.publicUrl });
}
