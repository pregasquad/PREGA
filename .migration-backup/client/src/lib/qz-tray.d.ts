declare module "qz-tray" {
  const qz: {
    websocket: {
      connect: () => Promise<void>;
      disconnect: () => Promise<void>;
      isActive: () => boolean;
    };
    security: {
      setCertificatePromise: (
        callback: (resolve: (cert: string) => void) => void
      ) => void;
      setSignatureAlgorithm: (algorithm: string) => void;
    };
    printers: {
      find: (query?: string) => Promise<string | string[]>;
      getDefault: () => Promise<string>;
    };
    configs: {
      create: (
        printer: string,
        options?: Record<string, unknown>
      ) => unknown;
    };
    print: (
      config: unknown,
      data: Array<{ type: string; format: string; data: string }>
    ) => Promise<void>;
  };
  export default qz;
}
