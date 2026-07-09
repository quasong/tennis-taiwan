import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Taiwan Tennis Match",
  description: "Find tennis partners and organize matches around Taiwan.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}
