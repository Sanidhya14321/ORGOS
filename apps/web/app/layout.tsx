import type { Metadata } from "next";
import { AppProviders } from "@/components/providers/app-providers";
import { ServiceWorkerRegistration } from "../components/pwa/service-worker-registration";
import { THEME_BOOTSTRAP_SCRIPT } from "@/lib/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: "ORGOS",
  description: "AI Organizational Operating System"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-bg-base text-text-primary antialiased selection:bg-accent/20 selection:text-text-primary">
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }} />
        <AppProviders>{children}</AppProviders>
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
