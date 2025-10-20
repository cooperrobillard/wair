import type { Metadata } from "next";
import "./globals.css";
import { ClerkProvider } from "@clerk/nextjs";
import { Toaster } from "sonner";

export const metadata: Metadata = {
  title: "Wair",
  description: "AI-powered outfit generator and wardrobe manager",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en" suppressHydrationWarning>
        <body className="min-h-dvh bg-background antialiased">
          <div className="mx-auto max-w-6xl px-4 py-6">{children}</div>
          <Toaster />
        </body>
      </html>
    </ClerkProvider>
  );
}
