// src/app/layout.tsx
import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

// If you ran: `npx shadcn@latest add sonner` use this:
// import { Toaster } from '@/components/ui/sonner';
// Otherwise, you can import directly from the library:
import { Toaster } from 'sonner';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Wair',
  description: 'AI-powered outfit generator and wardrobe manager',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} min-h-dvh bg-background antialiased`}>
        <div className="mx-auto max-w-6xl px-4 py-6">{children}</div>
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
