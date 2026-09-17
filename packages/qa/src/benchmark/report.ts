import type { GameDebugState } from "@game-factory/runtime";
import type { PlatformerGameSpec } from "@game-factory/game-spec";
import type { PlatformerActionObservation } from "../PlatformerDriver.js";
import { PLATFORMER_BODIES } from "@game-factory/runtime";

export type Phase = "spec_validation" | "semantic_review" | "level_generation" | "runtime_preparation" | "browser_boot" | "qa_execution" | "game_completion";
export type FailureCode = "spec_invalid" | "review_rejected" | "generation_failed" | "runtime_failed" | "qa_timeout" | "goal_unreachable" | "movement_failure" | "jump_failure" | "hazard_failure" | "enemy_failure" | "restart_failure" | "completion_failure" | "qa_driver_failure" | "qa_overshoot" | "qa_target_selection_failure" | "qa_ceiling_transition_failure" | "unknown";
export type Probe = "boot" | "movement" | "jump" | "navigation" | "completion" | "restart";
export interface PhaseResult { phase: Phase; status: "passed" | "failed"; durationMs: number }
export interface BrowserOutcome {
    phase: Phase;
    status: "passed" | "failed";
    failureCode: FailureCode | null;
    message: string;
    probe: Probe;
    booted: boolean;
    qaStarted: boolean;
    completed: boolean;
    runtimeErrors: string[];
    phases: PhaseResult[];
    debug?: GameDebugState;
    actions?: PlatformerActionObservation[];
}
export interface BenchmarkCase {
    id: string;
    seed: number;
    spec: PlatformerGameSpec;
    phase: Phase;
    status: "passed" | "failed";
    failureCode: FailureCode | null;
    message: string;
    phases: PhaseResult[];
    accepted: boolean;
    generated: boolean;
    built: boolean;
    browser?: BrowserOutcome;
    casePath: string;
    layoutPath?: string;
    buildPath?: string;
    qaReportPath?: string;
    reproduction: string;
}

export function classifyBrowserFailure(probe: Probe, message: string, runtimeErrors: string[], action?: PlatformerActionObservation): FailureCode {
    if (runtimeErrors.length) return "runtime_failed";
    if (/timeout|timed out/i.test(message)) return "qa_timeout";
    if (probe === "navigation") {
        const ceilingLimited = action?.candidates?.some(c => c.ceiling && action.target >= c.landing.min && action.target <= c.landing.max
            && Math.abs(action.target - action.before.playerBody.x) > c.ceiling.horizontalReach
            && Math.abs(action.target - action.before.playerBody.x) <= c.horizontalReach);
        const observedCancellation = action?.samples?.some(s => Math.abs(s.y - PLATFORMER_BODIES.player.height / 2) < 1 && s.vy === 0);
        if (ceilingLimited && observedCancellation && action?.after && action.after.playerBody.y > action.before.playerBody.y + PLATFORMER_BODIES.player.height) return "qa_ceiling_transition_failure";
        const safe = action?.candidates?.filter(c => c.verdict === "reachable" && c.clearsDangers && (!("usable" in c) || c.usable === true));
        const selected = safe?.find(c => action && action.target >= c.landing.min && action.target <= c.landing.max);
        if (selected && action?.after && action.direction === "right" && action.after.playerBody.x > selected.landing.max) return "qa_overshoot";
        if (safe?.length && !selected) return "qa_target_selection_failure";
        return "qa_driver_failure";
    }
    if (probe === "boot") return "runtime_failed";
    if (probe === "movement") return "movement_failure";
    if (probe === "jump") return "jump_failure";
    if (probe === "restart") return "restart_failure";
    return "completion_failure";
}

export function summarize(cases: BenchmarkCase[]) {
    const failures: Partial<Record<FailureCode, number>> = {};
    for (const result of cases) if (result.failureCode) failures[result.failureCode] = (failures[result.failureCode] ?? 0) + 1;
    const completed = cases.filter(result => result.browser?.completed).length;
    const bySpec = [...new Set(cases.map(result => result.id))].map(id => {
        const selected = cases.filter(result => result.id === id);
        return { id, attempted: selected.length, accepted: selected.filter(result => result.accepted).length, completed: selected.filter(result => result.browser?.completed).length, passed: selected.filter(result => result.status === "passed").length, failures: selected.filter(result => result.failureCode).map(result => ({ seed: result.seed, code: result.failureCode, phase: result.phase })) };
    });
    return {
        casesAttempted: cases.length,
        specsAttempted: new Set(cases.map(result => result.id)).size,
        seedsAttempted: new Set(cases.map(result => result.seed)).size,
        casesAccepted: cases.filter(result => result.accepted).length,
        specsAccepted: new Set(cases.filter(result => result.accepted).map(result => result.id)).size,
        levelsGenerated: cases.filter(result => result.generated).length,
        buildsPrepared: cases.filter(result => result.built).length,
        browserBoots: cases.filter(result => result.browser?.booted).length,
        qaStarts: cases.filter(result => result.browser?.qaStarted).length,
        gamesCompleted: completed,
        casesPassed: cases.filter(result => result.status === "passed").length,
        observedCompletionRate: cases.length ? completed / cases.length : 0,
        failures,
        bySpec,
        interpretation: "Observed QA completion, not proof of arbitrary-seed playability. Navigation deaths/timeouts do not establish unreachable goals."
    };
}
