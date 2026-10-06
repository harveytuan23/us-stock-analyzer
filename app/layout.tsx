import "./globals.css";

export const metadata = {
  title: "美股老手分析台",
  description: "美股技術分析、基本面分析與策略建議",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}
