/**
 * Ripped from https://github.com/AlinaNova21/ZeSwarm/
 * Organized by Carson Burke and xTwisteDx
 *
 * Usage:
 * Before the loop, import memHack
 * At start of loop(), run memHack.run()
 *
 * Private-server safe: never assign undefined Memory (causes
 * SyntaxError: "undefined" is not valid JSON on next tick).
 */

class MemHack {
    memory: Memory

    constructor() {
        // Prefer engine-parsed Memory; fall back to RawMemory JSON; never undefined.
        const parsed = (RawMemory as any)._parsed as Memory | undefined
        if (parsed && typeof parsed === "object") {
            this.memory = parsed
        } else {
            try {
                const raw = RawMemory.get()
                this.memory = (raw ? JSON.parse(raw) : {}) as Memory
            } catch {
                this.memory = {} as Memory
            }
        }
    }

    run() {
        if (!this.memory || typeof this.memory !== "object") {
            this.memory = {} as Memory
        }
        delete global.Memory
        global.Memory = this.memory
        ;(RawMemory as any)._parsed = this.memory
    }
}

export const memHack = new MemHack()
