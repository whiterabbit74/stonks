import type { ComponentType, SVGProps } from 'react';

declare module 'lucide-react' {
  export type Icon = ComponentType<SVGProps<SVGSVGElement>>;

  export const Heart: Icon;
  export const RefreshCcw: Icon;
  export const AlertTriangle: Icon;
  export const Bug: Icon;
}

declare module 'react/jsx-runtime' {
  export const jsx: (type: unknown, props: Record<string, unknown>, key?: string) => unknown;
  export const jsxs: (type: unknown, props: Record<string, unknown>, key?: string) => unknown;
  export const Fragment: typeof import('react').Fragment;
}
