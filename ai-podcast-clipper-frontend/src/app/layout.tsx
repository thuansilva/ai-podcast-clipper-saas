import { ClerkProvider } from "@clerk/nextjs";
import "~/styles/globals.css";

import { type Metadata } from "next";
import { Geist } from "next/font/google";

export const metadata: Metadata = {
  title: "Podcast Clipper",
  description: "Podcast Clipper",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
};

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <ClerkProvider dynamic>
      <html lang="en" className={`${geist.variable} dark`}>
        <body className="bg-[#0b0a08] text-[#f5f1e8] selection:bg-[#e8ba52]/20 selection:text-[#e8ba52] min-h-screen">
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
