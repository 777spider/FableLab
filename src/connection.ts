import { ApiError } from './api';

export const reconnectable = (error: unknown) => !(error instanceof ApiError) || error.status === 0 || error.status === 408 || error.status === 429 || error.status >= 500;

/** Retries reads only. It never resubmits a generation or changes a server job. */
export function watchRead<T>(read: () => Promise<T>, options: {
  receive: (value: T) => void;
  failed: (error: unknown) => boolean;
  interval?: (value: T) => number | null;
}): () => void {
  let disposed = false, stopped = false, reading = false, failures = 0;
  let timer: ReturnType<typeof setTimeout>;
  const schedule = (delay: number) => { clearTimeout(timer); if (!disposed && !stopped) timer = setTimeout(run, delay); };
  async function run() {
    if (disposed || stopped || reading) return;
    reading = true;
    try {
      const value = await read();
      if (disposed) return;
      options.receive(value); failures = 0;
      const delay = options.interval?.(value);
      if (delay != null) schedule(delay);
    } catch (error) {
      if (disposed) return;
      if (options.failed(error)) schedule(Math.min(30000, 2000 * 2 ** Math.min(failures++, 4)));
      else stopped = true;
    } finally { reading = false; }
  }
  const reconnect = () => { if (document.visibilityState === 'visible') schedule(0); };
  window.addEventListener('online', reconnect);
  document.addEventListener('visibilitychange', reconnect);
  void run();
  return () => { disposed = true; clearTimeout(timer); window.removeEventListener('online', reconnect); document.removeEventListener('visibilitychange', reconnect); };
}
