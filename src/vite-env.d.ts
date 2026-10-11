/// <reference types="vite/client" />

// Vite resolves CSS and static-asset imports at build time; declare them for tsc.
declare module '*.css';
declare module '*.svg' {
  const src: string;
  export default src;
}
