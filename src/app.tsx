import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createRouter } from '@tanstack/react-router';

import { RootCommandPalette } from '@/lib/command-palette';
import {
  KeyboardLayoutProvider,
  RootKeyboardBindings,
} from '@/lib/keyboard-bindings';

import { routeTree } from './routeTree.gen';

const queryClient = new QueryClient();
const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

export default function App() {
  return (
    <KeyboardLayoutProvider>
      <RootKeyboardBindings>
        <RootCommandPalette>
          <QueryClientProvider client={queryClient}>
            <RouterProvider router={router} />
          </QueryClientProvider>
        </RootCommandPalette>
      </RootKeyboardBindings>
    </KeyboardLayoutProvider>
  );
}
