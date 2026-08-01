import { SourceMapConsumer } from "source-map";
import ErrorExporter from "./ErrorExporter";
import { sourceMapsEnabled } from "./Features";
import { logAlways } from "./Logger";
export class ErrorMapper {
  // Cache consumer
  private static _consumer?: SourceMapConsumer;

  /**
   * Latch: set the moment source mapping is found to be impossible (require of
   * main.js.map fails, SourceMapConsumer construction throws, mapping throws...).
   * Once set we never touch the source map again for the life of this global, so
   * a broken/absent map cannot re-run the expensive attempt on every single tick.
   */
  private static sourceMapUnavailable = false;

  public static get consumer(): SourceMapConsumer {
    if (this._consumer == null) {
      this._consumer = new SourceMapConsumer(require("main.js.map"));
    }

    return this._consumer;
  }

  // Cache previously mapped traces to improve performance
  public static cache: { [key: string]: string } = {};

  /** Is a source-mapping attempt allowed right now? Never throws. */
  private static mappingAllowed(): boolean {
    if (this.sourceMapUnavailable) return false;
    try {
      return sourceMapsEnabled();
    } catch (e) {
      // Memory unreadable (cold start / corrupt) - assume off.
      return false;
    }
  }

  /**
   * Generates a stack trace using a source map generate original symbol names.
   *
   * DEFAULT ON A LIVE SERVER: does NOTHING but hand back the raw stack.
   * Building the consumer means pulling a ~1.5MB main.js.map into the heap in the
   * middle of a tick; the resulting memory spike was killing the isolate outright
   * ("isolate disposed", 19 kills / 35 min across 3 bots), i.e. the act of LOGGING
   * an error was taking the bot down. Mapping is now opt-in via the `sourceMaps`
   * feature flag (or `Memory.enableSourceMaps = true`) and any failure latches it
   * off for the rest of the global.
   *
   * WARNING - when enabled, EXTREMELY high CPU/memory cost for the first call after
   * a reset - >30 CPU! Use sparingly!
   * (Consecutive calls after a reset are more reasonable, ~0.1 CPU/ea)
   *
   * @param {Error | string} error The error or original stack trace
   * @returns {string} The source-mapped stack trace, or the raw stack when mapping
   *                   is disabled/unavailable.
   */
  public static sourceMappedStackTrace(error: Error | string): string {
    const stack: string = error instanceof Error ? (error.stack as string) || error.toString() : error;
    if (Object.prototype.hasOwnProperty.call(this.cache, stack)) {
      return this.cache[stack];
    }

    // Opted out (the default) or already known-broken: raw stack, zero allocation.
    // Deliberately NOT cached - there is no work to memoise, and caching raw
    // strings here would both grow the cache for nothing and shadow real mapped
    // output if the flag is flipped on later in the same global.
    if (!this.mappingAllowed()) {
      return stack;
    }

    try {
      // eslint-disable-next-line no-useless-escape
      const re = /^\s+at\s+(.+?\s+)?\(?([0-z._\-\\\/]+):(\d+):(\d+)\)?$/gm;
      let match: RegExpExecArray | null;
      let outStack = error.toString();

      while ((match = re.exec(stack))) {
        if (match[2] === "main") {
          const pos = this.consumer.originalPositionFor({
            column: parseInt(match[4], 10),
            line: parseInt(match[3], 10)
          });

          if (pos.line != null) {
            if (pos.name) {
              outStack += `\n    at ${pos.name} (${pos.source}:${pos.line}:${pos.column})`;
            } else {
              if (match[1]) {
                // no original source file name known - use file name from given trace
                outStack += `\n    at ${match[1]} (${pos.source}:${pos.line}:${pos.column})`;
              } else {
                // no original source file name known or in given trace - omit name
                outStack += `\n    at ${pos.source}:${pos.line}:${pos.column}`;
              }
            }
          } else {
            // no known position
            break;
          }
        } else {
          // no more parseable lines
          break;
        }
      }

      this.cache[stack] = outStack;
      return outStack;
    } catch (e) {
      // ANY failure (missing map, OOM while parsing, bad map) -> latch off so we
      // never pay for it again, drop the half-built consumer, return the raw stack.
      this.sourceMapUnavailable = true;
      this._consumer = undefined;
      return stack;
    }
  }

  public static wrapLoop(loop: () => void): () => void {
    return () => {
      try {
        loop();
      } catch (e) {
        if (e instanceof Error) {
          if ("sim" in Game.rooms) {
            const message = `Source maps don't work in the simulator - displaying original error`;
            logAlways(`<span style='color:red'>${message}<br>${_.escape(e.stack)}</span>`);
          } else {
            const stack = _.escape(this.sourceMappedStackTrace(e));

            logAlways(`<span style='color:red'>${stack}</span>`);
            // ErrorExporter JSON.parses RawMemory segment 10; a corrupt or
            // truncated segment throws straight back out of this catch block and
            // aborts the tick - the reporting path taking the bot down, which is
            // the exact failure this whole file was just hardened against. The
            // console line above has already landed, so losing the segment copy
            // costs nothing but the archive.
            try {
              ErrorExporter.addErrorToSegment(stack);
            } catch (segErr) {
              logAlways(`<span style='color:red'>error segment write failed: ${_.escape(String(segErr))}</span>`);
            }
          }
        } else {
          // can't handle it
          throw e;
        }
      }
    };
  }
}
