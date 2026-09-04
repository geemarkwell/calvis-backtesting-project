import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Calvis Backtest Console",
  description: "Compare original and candidate Copilot replay behavior.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
