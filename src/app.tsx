import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  RouterProvider,
  createHashHistory,
  createRouter,
} from '@tanstack/react-router';

import { RootKeyboardBindings } from './common/context/keyboard-bindings';
import { DetectKeyboardLayout } from './common/context/keyboard-layout';
import { ModalProvider } from './common/context/modal';
import { routeTree } from './routeTree.gen';

const queryClient = new QueryClient();

// Use hash-based routing for Electron compatibility.
// Browser history (pushState) doesn't work with file:// protocol in production builds -
// reloading the page would try to load e.g. file:///projects/123 as an actual file path.
// Hash routing creates URLs like index.html#/projects/123 which reload correctly.
const hashHistory = createHashHistory();
const router = createRouter({ routeTree, history: hashHistory });

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
