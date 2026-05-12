"use client";

import { useState } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { createQueryClient } from "@/lib/queryClient";
import { PageTransitionIndicator } from "@/components/providers/page-transition-indicator";
import { ThemeProvider, useTheme } from "@/components/providers/theme-provider";

function AppChrome({ children }: { children: React.ReactNode }) {
  const { resolvedTheme } = useTheme();

  return (
    <>
      <PageTransitionIndicator />
      {children}
      <Toaster theme={resolvedTheme} richColors position="bottom-right" duration={4000} />
    </>
  );
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => createQueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AppChrome>{children}</AppChrome>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
