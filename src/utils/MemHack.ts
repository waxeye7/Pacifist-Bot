class MemHack {
    memory: Memory | undefined

    constructor() {
         this.memory = Memory
         this.memory = RawMemory._parsed
    }

    run() {
         delete global.Memory
         global.Memory = this.memory
         RawMemory._parsed = this.memory
    }
}

export const memHack = new MemHack()
