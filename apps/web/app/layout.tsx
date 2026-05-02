import type { Metadata } from "next";
import { Manrope, IBM_Plex_Mono } from "next/font/google";
import { AppProviders } from "@/components/providers/app-providers";
import { ServiceWorkerRegistration } from "../components/pwa/service-worker-registration";
import "./globals.css";

export const metadata: Metadata = {
  title: "ORGOS",
  description: "AI Organizational Operating System"
};

const manrope = Manrope({ subsets: ["latin"], variable: "--font-sans" });
const ibmPlexMono = IBM_Plex_Mono({ subsets: ["latin"], variable: "--font-mono", weight: ["400", "500", "600"] });

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${manrope.variable} ${ibmPlexMono.variable}`}>
      <body className="min-h-screen bg-bg-base text-text-primary antialiased selection:bg-accent/20 selection:text-text-primary">
        <AppProviders>{children}</AppProviders>
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
