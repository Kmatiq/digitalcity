/**
 * Priority download queue: highest priority (nearest the camera) first, bounded
 * concurrency, per-request timeout and AbortSignal so a hanging request never
 * blocks what is visible.
 */
export interface QueueJob<T> {
  priority: () => number; // lower = sooner; re-evaluated each time a slot frees
  run: (signal: AbortSignal) => Promise<T>;
  signal?: AbortSignal;
}

interface Entry {
  job: QueueJob<unknown>;
  resolve: (v: unknown) => void;
  reject: (e: unknown) => void;
}

export class FetchQueue {
  private pending: Entry[] = [];
  private active = 0;

  constructor(
    private concurrency = 6,
    private timeoutMs = 20000,
  ) {}

  add<T>(job: QueueJob<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.pending.push({ job, resolve: resolve as (v: unknown) => void, reject });
      this.pump();
    });
  }

  get size(): number {
    return this.pending.length + this.active;
  }

  private pump(): void {
    while (this.active < this.concurrency && this.pending.length) {
      this.pending.sort((a, b) => a.job.priority() - b.job.priority());
      const e = this.pending.shift()!;
      if (e.job.signal?.aborted) {
        e.reject(new DOMException('Aborted', 'AbortError'));
        continue;
      }
      this.active++;
      const ctl = new AbortController();
      const timer = setTimeout(
        () => ctl.abort(new DOMException('Timeout', 'TimeoutError')),
        this.timeoutMs,
      );
      const onAbort = (): void => ctl.abort(e.job.signal?.reason);
      e.job.signal?.addEventListener('abort', onAbort, { once: true });
      e.job
        .run(ctl.signal)
        .then(e.resolve, e.reject)
        .finally(() => {
          clearTimeout(timer);
          e.job.signal?.removeEventListener('abort', onAbort);
          this.active--;
          this.pump();
        });
    }
  }
}

export function isAbort(e: unknown): boolean {
  return e instanceof DOMException && (e.name === 'AbortError' || e.name === 'TimeoutError');
}
