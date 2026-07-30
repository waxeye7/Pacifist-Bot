/**
 * Logging gate for shard3 CPU.
 * Default: silent. Enable with Memory.verbose = true or global.setVerbose(true)
 */

let installed = false;
let rawLog: typeof console.log = console.log.bind(console);

export function installLogger(): void {
  if (installed) return;
  installed = true;
  rawLog = console.log.bind(console);

  console.log = function (...args: any[]) {
    if (Memory.verbose) {
      rawLog(...args);
    }
  } as typeof console.log;
}

/** Always prints (errors / rare alerts). */
export function logAlways(...args: any[]): void {
  rawLog(...args);
}

/** Only when Memory.verbose */
export function logVerbose(...args: any[]): void {
  if (Memory.verbose) rawLog(...args);
}

export function setVerbose(on: boolean): string {
  Memory.verbose = !!on;
  return Memory.verbose ? "verbose ON (console spam enabled)" : "verbose OFF (silent)";
}
