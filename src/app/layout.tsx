import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Temp Radio — Ephemeral Live Audio",
  description:
    "Broadcast your voice. Share a link. Gone when you're done. No accounts, no installs — just a link and a mic.",
  openGraph: {
    title: "Temp Radio",
    description: "Broadcast your voice. Share a link. Gone when you're done.",
    type: "website",
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
