import { ClerkProvider } from "@clerk/nextjs";
import "~/styles/globals.css";

import { type Metadata } from "next";
import { Geist } from "next/font/google";
import { Toaster } from "~/components/ui/sonner";

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
      <html
        lang="en"
        data-theme="dark"
        className={`${geist.variable} dark`}
        suppressHydrationWarning
      >
        <head>
          <script
            id="theme-init"
            dangerouslySetInnerHTML={{
              __html: `(function(){try{var s=localStorage.getItem("theme");var t=s==="light"?"light":"dark";document.documentElement.setAttribute("data-theme",t);if(t==="dark"){document.documentElement.classList.add("dark");document.documentElement.classList.remove("light");}else{document.documentElement.classList.remove("dark");document.documentElement.classList.add("light");}}catch(e){}})();`,
            }}
          />
        </head>
        <body className="bg-[var(--tinta)] text-[var(--marfim)] selection:bg-[var(--ouro)]/20 selection:text-[var(--ouro)] min-h-screen">
          {children}
          <Toaster />
        </body>
      </html>
    </ClerkProvider>
  );
}
