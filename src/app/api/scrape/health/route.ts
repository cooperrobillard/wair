import { NextResponse } from "next/server";

export async function GET() {
  const key = process.env.BROWSERLESS_API_KEY;
  if (!key) {
    return NextResponse.json({ ok: false, reason: "no_key" }, { status: 200 });
  }

  try {
    const res = await fetch(`https://chrome.browserless.io/versions?token=${key}`, {
      cache: "no-store",
    });
    return NextResponse.json({ ok: res.ok, status: res.status }, { status: 200 });
  } catch {
    return NextResponse.json({ ok: false, reason: "network" }, { status: 200 });
  }
}
