import Phaser from "phaser";
import type { PlatformerGameSpec } from "@game-factory/game-spec";
import type { GameContext, PlatformerDiagnostics, PlatformerDiagnosticTrial, PlatformerDiagnosticResult, PlatformerPhysicsFrame, PlatformerPhysicsSnapshot } from "@game-factory/runtime";

// Opt-in observer around the real Arcade methods. No integration/collision math
// is replaced. Normal games never install these wrappers or retain frames.
export class PlatformerPhysicsDiagnostics implements PlatformerDiagnostics {
    private frames: PlatformerPhysicsFrame[] = [];
    private restore?: () => void;
    private frame = 0;
    private time = 0;
    private trialRenderFrame?: number;
    constructor(private scene: Phaser.Scene, private player: Phaser.Physics.Arcade.Image, private ctx: GameContext,
        private spec: PlatformerGameSpec, private updateScene: () => void, private jump: () => void) {}

    private get body() { return this.player.body as Phaser.Physics.Arcade.Body; }
    private snapshot(): PlatformerPhysicsSnapshot {
        const b = this.body;
        return { x: b.center.x, y: b.center.y, vx: b.velocity.x, vy: b.velocity.y,
            blocked: { up: b.blocked.up, down: b.blocked.down, left: b.blocked.left, right: b.blocked.right },
            touching: { up: b.touching.up, down: b.touching.down, left: b.touching.left, right: b.touching.right } };
    }
    startCapture(): void {
        this.stopCapture(); this.frames = []; this.frame = 0; this.time = 0;
        const body = this.body, world = this.scene.physics.world;
        const update = body.update, bounds = body.checkWorldBounds, onCollide = body.onCollide;
        let active: PlatformerPhysicsFrame | undefined;
        body.onCollide = true;
        body.update = (dt: number) => {
            active = { frame: this.frame++, renderFrame: this.trialRenderFrame ?? this.scene.game.loop.frame, time: this.time, dt,
                input: { left: this.ctx.input.isPressed("move_left"), right: this.ctx.input.isPressed("move_right") },
                before: this.snapshot(), contacts: [] };
            this.time += dt;
            this.frames.push(active);
            if (this.frames.length > 240) this.frames.shift();
            update.call(body, dt);
            active.integrated = this.snapshot();
        };
        body.checkWorldBounds = () => {
            const before = this.snapshot();
            const collided = bounds.call(body);
            if (collided && active) active.bounds = { before, after: this.snapshot() };
            return collided;
        };
        const after = () => { if (active) active.after = this.snapshot(); };
        const contact = (_a: Phaser.GameObjects.GameObject, _b: Phaser.GameObjects.GameObject,
            a: Phaser.Physics.Arcade.Body | Phaser.Physics.Arcade.StaticBody, b: Phaser.Physics.Arcade.Body | Phaser.Physics.Arcade.StaticBody) => {
            if (!active || (a !== body && b !== body)) return;
            const other = a === body ? b : a;
            const d = this.ctx.debug.getState().details;
            if (!d) return;
            const groups = [["platform", d.platforms], ["hazard", d.hazards], ["enemy", d.enemies]] as const;
            for (const [kind, rectangles] of groups) {
                const index = rectangles.findIndex(p => Math.abs(p.x - other.center.x) < 1 && Math.abs(p.y - other.center.y) < 1);
                if (index >= 0) { active.contacts.push({ kind, index, x: other.center.x, y: other.center.y }); return; }
            }
            active.contacts.push({ kind: "other", index: -1, x: other.center.x, y: other.center.y });
        };
        world.on(Phaser.Physics.Arcade.Events.WORLD_STEP, after);
        world.on(Phaser.Physics.Arcade.Events.COLLIDE, contact);
        this.restore = () => {
            body.update = update; body.checkWorldBounds = bounds; body.onCollide = onCollide;
            world.off(Phaser.Physics.Arcade.Events.WORLD_STEP, after);
            world.off(Phaser.Physics.Arcade.Events.COLLIDE, contact);
        };
    }
    stopCapture(): PlatformerPhysicsFrame[] {
        this.restore?.(); this.restore = undefined;
        return this.frames;
    }
    private direction(direction: -1 | 0 | 1): void {
        const keyboard = this.scene.input.keyboard;
        if (!keyboard) throw new Error("Diagnostic trial requires keyboard input");
        const left = this.spec.controls.move_left.includes("keyboard_left") ? 37 : 65;
        const right = this.spec.controls.move_right.includes("keyboard_right") ? 39 : 68;
        // These are the same key events consumed by PhaserInputService.
        keyboard.addKey(left).emit(direction === -1 ? "down" : "up");
        keyboard.addKey(right).emit(direction === 1 ? "down" : "up");
    }
    trial(input: PlatformerDiagnosticTrial): PlatformerDiagnosticResult {
        const details = this.ctx.debug.getState().details;
        const source = details?.platforms[input.sourceIndex];
        if (!source || !Number.isFinite(input.launchX) || Math.abs(input.launchX - source.x) > (source.width + this.body.width) / 2) throw new Error("Invalid supported diagnostic setup");
        const maxFrames = input.maxFrames ?? 150;
        if (!Number.isInteger(maxFrames) || maxFrames < 1 || maxFrames > 180) throw new Error("Diagnostic trial exceeds bounded frame budget");
        const world = this.scene.physics.world;
        const step = () => {
            if ((input.stepsPerRender ?? 1) === 1) world.singleStep();
            else { world.update(0, 1000 / world.fps * input.stepsPerRender!); world.postUpdate(); }
        };
        this.scene.game.loop.sleep();
        let supportedStart = false, jumped = false, landingIndex: number | null = null;
        try {
            this.direction(0);
            this.body.reset(input.launchX, source.y - source.height / 2 - this.body.height / 2 - 1);
            // Establish support through actual collision, never by forging flags.
            for (let i = 0; i < 4; i++) { this.updateScene(); world.singleStep(); }
            supportedStart = this.body.blocked.down || this.body.touching.down;
            this.direction(input.initialDirection ?? 0); this.updateScene();
            this.startCapture();
            this.jump();
            for (let frame = 0; frame < maxFrames; frame++) {
                this.trialRenderFrame = frame;
                const atTarget = input.releaseX !== undefined && (input.direction >= 0 ? this.body.center.x >= input.releaseX : this.body.center.x <= input.releaseX);
                this.direction(!atTarget && frame >= (input.delayFrames ?? 0) && frame < (input.releaseFrame ?? maxFrames) ? input.direction : 0);
                this.updateScene();
                if (this.ctx.debug.getState().game_over) break;
                step();
                jumped ||= this.frames.some(f => f.before.vy < 0);
                if (jumped && this.body.velocity.y >= 0 && (this.body.blocked.down || this.body.touching.down)) {
                    const foot = this.body.bottom;
                    landingIndex = details!.platforms.findIndex(p => Math.abs(p.y - p.height / 2 - foot) < 1 && Math.abs(p.x - this.body.center.x) < (p.width + this.body.width) / 2);
                    if (landingIndex < 0) landingIndex = null;
                    if (landingIndex !== null || !this.ctx.debug.getState().player?.alive) break;
                }
            }
            return { trial: input, fps: world.fps, fixedStep: world.fixedStep, frames: this.stopCapture(), supportedStart, jumped,
                alive: this.ctx.debug.getState().player?.alive ?? false, landingIndex,
                scope: "Isolated supported setup, real Arcade singleStep and production scene/input; not a demonstrated spawn-to-goal route or every render catch-up schedule" };
        } finally { this.stopCapture(); this.trialRenderFrame = undefined; this.direction(0); this.scene.game.loop.wake(); }
    }
}
