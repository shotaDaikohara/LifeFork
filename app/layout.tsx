import type { Metadata } from "next";
import { Noto_Sans_JP } from "next/font/google";
import { Header } from "@/components/Header";
import "./globals.css";

const notoSansJp = Noto_Sans_JP({
  variable: "--font-noto-sans-jp",
  subsets: ["latin"],
  weight: ["400", "500", "700", "900"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "LifeFork | 人生分岐AI",
  description:
    "転職や独立、ふと思いついたその道に進んだ未来と、今のままの未来をAIが調べて並べます。",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" className={`${notoSansJp.variable}`}>
      <body>
        <Header />
        {children}
      </body>
    </html>
  );
}
