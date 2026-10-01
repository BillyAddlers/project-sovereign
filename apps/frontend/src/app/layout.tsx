import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { Providers } from "@/components/providers";
import { Toaster } from "@/components/ui/sonner";

import "./globals.css";

const geistSans = Geist({ variable: "--font-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: {
    default: "Project Sovereign",
    template: "%s · Project Sovereign",
  },
  description: "Project Sovereign — frontend workspace.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // next-themes writes the `dark` class onto <html> before hydration to avoid
    // a flash of the wrong theme; suppressHydrationWarning tells React the
    // mismatch is intentional rather than a defect.
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col">
        <Providers>{children}</Providers>
        <Toaster position="top-right" />
      </body>
    </html>
  );
}
