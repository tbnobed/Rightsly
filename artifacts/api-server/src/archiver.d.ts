declare module "archiver" {
  import type { Writable } from "node:stream";

  interface Archive {
    append(source: string | Buffer, data: { name: string; date?: Date }): Archive;
    pipe(destination: Writable): Writable;
    on(event: "error", callback: (error: Error) => void): Archive;
    finalize(): Promise<void>;
  }

  function archiver(format: "zip", options?: { zlib?: { level?: number } }): Archive;
  export default archiver;
}