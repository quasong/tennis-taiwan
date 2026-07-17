import type { Metadata } from "next";
import "./globals.css";
import { I18nProvider } from "./i18n/I18nProvider";

export const metadata: Metadata = {
  title: "Taiwan Tennis Match | 台灣網球約球",
  description: "在台灣尋找網球球友、建立球局。Find tennis partners and organize matches around Taiwan.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <I18nProvider>{children}</I18nProvider>
      </body>
    </html>
  );
}
