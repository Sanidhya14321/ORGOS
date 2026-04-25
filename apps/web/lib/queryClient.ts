import { QueryClient } from "@tanstack/react-query";

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30000,
        gcTime: 5 * 60 * 1000,
        refetchOnWindowFocus: true,
        retry: 1
      },
      mutations: {
        retry: 1
      }
    }
  });
}
