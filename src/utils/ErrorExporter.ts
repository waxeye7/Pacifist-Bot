import { requestSegments } from "./Segments"

const errorSegment = 10
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

        data.errors.push(stack)
        if (version) data.version = version;
        this.setSegmentData(data)
    }
}
