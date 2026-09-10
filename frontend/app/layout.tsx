import type { Metadata } from "next";
import GlobalSidebar from "./GlobalSidebar";
import "./globals.css";

export const metadata: Metadata = {
  title: "Calvis Backtest Console",
  description: "Compare original and candidate Copilot replay behavior.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>
        <div className="root-layout-shell">
          <GlobalSidebar />
          <div className="root-layout-content">{children}</div>
        </div>
      </body>
    </html>
  );
}
