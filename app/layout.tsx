import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Geist, Geist_Mono } from "next/font/google";

import { PointerProbe } from "@/components/app/pointer-probe";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "GPBM Retail",
    template: "%s | GPBM Retail",
  },
  description:
    "Mobile-first retail command center for GPBM sales, stock, attendance, tasks, reviews, and AI secretary workflows.",
  applicationName: "GPBM Retail",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-48.png", sizes: "48x48", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "GPBM Retail",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: "#F4F4F8",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

const installScript = `window.addEventListener("beforeinstallprompt",function(e){e.preventDefault();window.__gpbmInstall=e;window.dispatchEvent(new Event("gpbm-install"))});window.addEventListener("appinstalled",function(){try{localStorage.setItem("gpbm-installed","1")}catch(e){}window.__gpbmInstall=null;window.dispatchEvent(new Event("gpbm-install"))});if("serviceWorker" in navigator){window.addEventListener("load",function(){navigator.serviceWorker.register("/sw.js").catch(function(){})})}`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      className={`${geistSans.variable} ${geistMono.variable} ${bricolage.variable} h-full antialiased`}
      lang="en"
    >
      <head>
        {/* Keep Chrome's install offer for the Install banner (it can fire before the page is ready). */}
        <script dangerouslySetInnerHTML={{ __html: installScript }} />
      </head>
      <body className="min-h-full bg-background font-sans text-foreground">
        {children}
        <PointerProbe />
      </body>
    </html>
  );
}
