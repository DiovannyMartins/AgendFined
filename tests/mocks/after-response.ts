// Test double for next/server's after() (#217): the callbacks wait in a queue
// until the test flushes it, so a test can tell what the response awaited from
// what only runs after it.
type AfterTask = Promise<unknown> | (() => unknown);

const queued: AfterTask[] = [];

export function queueAfterResponse(task: AfterTask): void {
  queued.push(task);
}

export function pendingAfterResponse(): number {
  return queued.length;
}

export async function flushAfterResponse(): Promise<void> {
  while (queued.length > 0) {
    const task = queued.shift()!;
    await (typeof task === "function" ? task() : task);
  }
}

export function resetAfterResponse(): void {
  queued.length = 0;
}
