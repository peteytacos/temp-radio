import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL || "https://temp-radio-production.up.railway.app"
  ),
  title: "Temp Radio — Looks like you're needed on the radio...",
  openGraph: {
    title: "Temp Radio - Looks like you're needed on the radio...",
    type: "website",
    images: ["/og.jpg"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
