import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Temp Radio — Looks like you're needed on the radio...",
  description:
    "Hold to talk. Share the link. Gone when you leave. No accounts, no installs — just a link and a mic.",
  openGraph: {
    title: "Temp Radio - Looks like you're needed on the radio...",
    description:
      "Hold to talk. Share the link. Gone when you leave.",
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
