"use client";

import { useState } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { createQueryClient } from "@/lib/queryClient";
import { InitialVisitSplash } from "@/components/providers/initial-visit-splash";

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => createQueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <InitialVisitSplash />
      {children}
      <Toaster theme="dark" richColors position="bottom-right" duration={4000} />
    </QueryClientProvider>
  );
}
