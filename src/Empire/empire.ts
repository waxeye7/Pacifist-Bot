/**
 * The empire pass: ONE place per tick that looks at the whole empire and
 * publishes what each room should know, BEFORE rooms run.
 *
 * v1 publishes: the shared creep census, the spawn-rescue job, and a derived
 * posture per room. Postures are the hook for the next step (frozen /
 * cpu-lean / war-support) — in v1 they are published and logged, not yet
 * consumed. Rooms READ this; nothing here is written from room code.
 *
 * Off switch: Memory.features.empireBrain = false (rooms fall back to the
 * legacy per-room rescue path). See docs/EMPIRE-LAYER.md.
 */
import { getCensus, EmpireCensus } from "./census";
import { computeRescueJob, RescueJob } from "./rescue";
import { logAlways } from "utils/Logger";

export type Posture = "normal" | "danger" | "rescue-target" | "rescue-donor";

export interface EmpireState {
    tick: number;
    census: EmpireCensus;
    rescue: RescueJob | null;
    postures: { [room: string]: Posture };
}

let state: EmpireState | null = null;

function cpuUsed(): number {
    return Game.cpu && typeof Game.cpu.getUsed === "function" ? Game.cpu.getUsed() : 0;
}

export function runEmpire(): void {
    const t0 = cpuUsed();
    let rescue: RescueJob | null = null;
    try {
        rescue = computeRescueJob();
    } catch (e) {
        logAlways("[empire] rescue job threw:", (e && (e as any).stack) || e);
    }
    const t1 = cpuUsed();
    // After the rescue job: it may have retasked creeps, and it invalidates the
    // census when it does, so this is the count the rooms will read.
    const census = getCensus();
    const t2 = cpuUsed();
    const postures: { [room: string]: Posture } = {};
    for (const rn in Game.rooms) {
        const r: any = Game.rooms[rn];
        if (!r.controller || !r.controller.my) continue;
        let p: Posture = "normal";
        if (rescue && rescue.need === rn) p = "rescue-target";
        else if (r.memory && r.memory.danger) p = "danger";
        else if (rescue && rescue.mother === rn) p = "rescue-donor";
        postures[rn] = p;
    }
    state = { tick: Game.time, census, rescue, postures };
    (global as any)._empire = state;
    notePartCpu(t1 - t0, t2 - t1, cpuUsed() - t2);
    if (rescue && Game.time % 100 === 0) {
        logAlways("[empire] rescue " + rescue.need + " <- " + (rescue.mother || "no mother qualifies")
            + " builders " + rescue.builders + "/" + rescue.cap + (rescue.rescue ? " (spawnless)" : " (colony site)"));
    }
}

/** This tick's empire state, or null when the pass has not run this tick (flag off, or it threw). */
export function empire(): EmpireState | null {
    return state && state.tick === Game.time ? state : null;
}

export function rescueJob(): RescueJob | null {
    const e = empire();
    return e ? e.rescue : null;
}

export function postureOf(room: string): Posture {
    const e = empire();
    return (e && e.postures[room]) || "normal";
}

export function resetEmpireForTest(): void {
    state = null;
}

/**
 * Where the empire phase's CPU goes, as a slow EMA in Memory.CPU.empireParts
 * — {rescue, census, postures}. main.ts records the phase total; this is the
 * breakdown, so a 0.5-CPU tick can be blamed on the right walk.
 */
const PART_ALPHA = 0.05;
function notePartCpu(rescue: number, census: number, postures: number): void {
    const M: any = Memory as any;
    if (!M.CPU) return;
    const p = M.CPU.empireParts || (M.CPU.empireParts = { rescue: 0, census: 0, postures: 0 });
    p.rescue = Math.round((p.rescue + PART_ALPHA * (rescue - p.rescue)) * 1000) / 1000;
    p.census = Math.round((p.census + PART_ALPHA * (census - p.census)) * 1000) / 1000;
    p.postures = Math.round((p.postures + PART_ALPHA * (postures - p.postures)) * 1000) / 1000;
}
