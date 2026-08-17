import type { Metadata,Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Store Manager",
  description: "Sales, inventory and store operations for independent store owners.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
  appleWebApp:{capable:true,title:"Store Manager",statusBarStyle:"black-translucent"},
};

export const viewport:Viewport={width:"device-width",initialScale:1,viewportFit:"cover",themeColor:"#145c3c"};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
