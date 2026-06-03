/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_COMMIT_HASH: string;
}

declare module '*.svg?react' {
  import type { ComponentType, SVGProps } from 'react';

  const ReactComponent: ComponentType<SVGProps<SVGSVGElement>>;
  export default ReactComponent;
}

declare module 'monaco-editor/esm/vs/editor/edcore.main.js' {
  export * from 'monaco-editor';
}
