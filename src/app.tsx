import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createRouter } from '@tanstack/react-router';

import { RootKeyboardBindings } from './common/context/keyboard-bindings';
import { DetectKeyboardLayout } from './common/context/keyboard-layout';
import { ModalProvider } from './common/context/modal';
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
    <>
      <DetectKeyboardLayout />
      <RootKeyboardBindings>
        <ModalProvider>
          <QueryClientProvider client={queryClient}>
            <RouterProvider router={router} />
          </QueryClientProvider>
        </ModalProvider>
      </RootKeyboardBindings>
    </>
  );
}
