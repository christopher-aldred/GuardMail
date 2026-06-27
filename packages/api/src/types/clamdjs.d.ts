declare module 'clamdjs' {
  export interface Scanner {
    host: string;
    port: number;
    scanFile(filePath: string): Promise<string>;
  }
  export function createScanner(host: string, port: number): Scanner;
  export function scanBuffer(
    scanner: Scanner,
    buffer: Buffer,
    name?: string,
    timeout?: number,
  ): Promise<string>;
  export function ping(scanner: Scanner): Promise<boolean>;
  const _default: { createScanner: typeof createScanner; scanBuffer: typeof scanBuffer; ping: typeof ping };
  export default _default;
}