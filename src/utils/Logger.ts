/**
 * Logging gate for shard3 CPU.
 * Default: silent. Enable with Memory.verbose = true or global.setVerbose(true)
 */

let rawLog: typeof console.log = console.log.bind(console);
/** The wrapper we installed, so we can tell ours from the host's. */
let patched: typeof console.log | null = null;

/**
 * Install the verbosity gate over console.log.
 *
 * This used to latch on an `installed` flag and patch once per global. It does
 * not hold: the Screeps runtime installs a FRESH `console.log` at the start of
 * every tick — the host's version closes over that tick's message buffer, which
 * is how output gets attributed to the right tick — so from tick 2 until the
 * next global reset the gate was simply gone.
 *
 * The symptom was that `Memory.verbose = false` did nothing. Live shard3 read
 * `verbose: false` while printing "Rooms Ran in ...", "Creeps Ran in ...",
 * "NN ms on this tick optimized" and one JSON.stringify per pending command on
 * every single tick, in a room running 19-22 CPU against a limit of 20.
 *
 * So: compare against the wrapper we installed rather than a boolean. When the
 * host has replaced it, re-wrap and re-bind `rawLog` to the host's CURRENT
 * function — binding it once would send logAlways output to a stale buffer.
 */
export function installLogger(): void {
  if (patched && console.log === patched) return;
  rawLog = console.log.bind(console);
  patched = function (...args: any[]) {
    if (Memory.verbose) {
      rawLog(...args);
    }
  } as typeof console.log;
  console.log = patched;
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
