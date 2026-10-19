import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 5 * 60 * 1000, // 5 minutes cache to protect egress
      refetchOnWindowFocus: false, // Prevents egress surge when switching tabs
    },
  },
});
