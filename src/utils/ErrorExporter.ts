import { requestSegments } from "./Segments"

const errorSegment = 10
/** Newest N kept. See addErrorToSegment. */
const MAX_ERRORS = 200
// NOT requested at module load. setActiveSegments REPLACES the active set, and
// this line ran on every global reset — clobbering adoption (88), the animator
// (89-99) and AutoExpand's pack segments (80-86) before any of them got a turn.
// The request now happens where it is actually needed: when an error is being
// written. See utils/Segments.

interface ErrorData {
    errors: string[];
    version?: number
}

export default class ErrorExporter {
    public static getSegmentData(): ErrorData {
        const segment = RawMemory.segments[errorSegment]
        if (segment === undefined || segment.length === 0) return { errors: [] }
        else return JSON.parse(RawMemory.segments[errorSegment])
    }

    public static setSegmentData(data: ErrorData): void {
        RawMemory.segments[errorSegment] = JSON.stringify(data)
    }

    public static addErrorToSegment(stack: string, version?: number): void {
        // Lazy activation: an error is the first moment this segment is worth a
        // slot. The write itself only lands once the segment is active (next
        // tick), which is the pre-existing behaviour for the first error after
        // a reset — errors after that one are recorded normally.
        requestSegments([errorSegment])
        const data = this.getSegmentData()
        if (JSON.stringify(data).length > 90000) {
            Game.notify(`Error segment (${errorSegment}) is full`)
            return
        }

        /*
         * STAMP THE TICK, AND CAP THE LOG.
         *
         * This segment is append-only and carried no timestamp of any kind, so
         * a crash from a build shipped days ago is indistinguishable from one
         * happening right now. Live shard3 2026-09-11 held 275 entries: 137 of
         * them pointed at rooms.ts:334 and 124 at installPathStats, and BOTH
         * had already been fixed — installPathStats is a no-op in this very
         * tree, and the rooms.ts line number belongs to a build whose main.ts
         * had different contents. Twenty minutes went into reading stack traces
         * for bugs that no longer existed.
         *
         * A tick makes the log answerable: anything older than the last deploy
         * is history, anything newer is a live bug. The cap keeps the newest
         * 200, because a log that only ever grows eventually stops accepting
         * the entry you actually needed — the 90,000-byte guard above simply
         * dropped every error after the segment filled, silently preferring the
         * oldest evidence to the newest.
         */
        data.errors.push(`t${Game.time} ${stack}`)
        if (data.errors.length > MAX_ERRORS) {
            data.errors = data.errors.slice(-MAX_ERRORS);
        }
        if (version) data.version = version;
        this.setSegmentData(data)
    }
}
