"use client";

import { useState } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { createQueryClient } from "@/lib/queryClient";
import { PageTransitionIndicator } from "@/components/providers/page-transition-indicator";

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => createQueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <PageTransitionIndicator />
      {children}
      <Toaster theme="dark" richColors position="bottom-right" duration={4000} />
    </QueryClientProvider>
  );
}
