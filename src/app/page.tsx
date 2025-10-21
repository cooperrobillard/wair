import Link from "next/link";

export default function Home() {
  return (
    <main className="space-y-3 p-6">
      <h1 className="text-3xl font-semibold tracking-tight">Wair</h1>
      <p className="text-muted-foreground">
        Foundation is live. Next: auth & data wiring.
      </p>

      <div className="pt-2">
        <Link
          href="/items"
          className="inline-flex items-center rounded-lg bg-black px-4 py-2 text-white hover:opacity-90"
        >
          Go to Items
        </Link>
      </div>
    </main>
  );
}
