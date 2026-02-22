/// <reference types="vite/client" />

declare module '*.svg?react' {
  import type { ComponentType, SVGProps } from 'react';

  const ReactComponent: ComponentType<SVGProps<SVGSVGElement>>;
  export default ReactComponent;
}
