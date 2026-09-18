declare module "s3rver" {
  interface S3rverOptions {
    address?: string;
    port?: number;
    silent?: boolean;
    directory?: string;
    resetOnClose?: boolean;
    vhostBuckets?: boolean;
    configureBuckets?: Array<{ name: string; configs?: string[] }>;
  }

  export default class S3rver {
    constructor(options: S3rverOptions);
    run(): Promise<{ address: string; port: number }>;
    close(callback: (err?: Error) => void): void;
  }
}
