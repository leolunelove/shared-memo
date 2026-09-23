import type { Metadata, Viewport } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Shared memo",
  description: "A private memo between two people.",
  robots: { index: false, follow: false },
  icons: { icon: "/icon.svg" },
  appleWebApp: {
    capable: true,
    title: "Shared memo",
    statusBarStyle: "default",
  },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f7f7f5",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
