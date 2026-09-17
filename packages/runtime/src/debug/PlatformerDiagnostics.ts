export interface PlatformerPhysicsSnapshot {
    x: number; y: number; vx: number; vy: number;
    blocked: { up: boolean; down: boolean; left: boolean; right: boolean };
    touching: { up: boolean; down: boolean; left: boolean; right: boolean };
}
export interface PlatformerPhysicsFrame {
    frame: number; renderFrame: number; time: number; dt: number;
    input: { left: boolean; right: boolean };
    before: PlatformerPhysicsSnapshot;
    integrated?: PlatformerPhysicsSnapshot;
    after?: PlatformerPhysicsSnapshot;
    bounds?: { before: PlatformerPhysicsSnapshot; after: PlatformerPhysicsSnapshot };
    contacts: { kind: "platform" | "hazard" | "enemy" | "other"; index: number; x: number; y: number }[];
}
export interface PlatformerDiagnosticTrial {
    sourceIndex: number; launchX: number;
    direction: -1 | 0 | 1;
    initialDirection?: -1 | 0 | 1;
    delayFrames?: number; releaseFrame?: number; maxFrames?: number;
    releaseX?: number;
    stepsPerRender?: 1 | 2 | 3;
}
export interface PlatformerDiagnosticResult {
    trial: PlatformerDiagnosticTrial; fps: number; frames: PlatformerPhysicsFrame[];
    fixedStep: boolean;
    supportedStart: boolean; jumped: boolean; alive: boolean; landingIndex: number | null;
    scope: string;
}
export interface PlatformerDiagnostics {
    startCapture(): void;
    stopCapture(): PlatformerPhysicsFrame[];
    trial(input: PlatformerDiagnosticTrial): PlatformerDiagnosticResult;
}
