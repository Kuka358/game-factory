import { afterEach, describe, expect, it, vi } from "vitest";
import { runPlatformerInput } from "../../qa/src/platformer-input.js";

afterEach(() => vi.unstubAllGlobals());

describe("Platformer waypoint release under render catch-up", () => {
    // Model only input delivery/observation cadence, not jump/collision physics.
    // Arcade consumes the preceding scene velocity before Scene.update handles
    // the released key. The real-Phaser diagnostic suite separately checks physics.
    async function waypoint(cadence: number[], target: number, direction: -1 | 1 = 1) {
        let x = 1198, velocity = 0, held = 0, frame = 0;
        class KeyEvent {
            constructor(readonly type: string, readonly init: { keyCode: number }) {}
        }
        vi.stubGlobal("KeyboardEvent", KeyEvent);
        vi.stubGlobal("window", {
            dispatchEvent(event: KeyEvent) {
                if (event.init.keyCode === 37 || event.init.keyCode === 39) held = event.type === "keyup" ? 0 : event.init.keyCode === 39 ? 420 : -420;
            },
            __GAME_FACTORY__: { dispatchAction() {}, getState: () => ({
                player: { x, y: 200, alive: true }, game_over: false,
                details: { playerVelocity: { x: velocity, y: frame < 40 ? -100 : 100 }, grounded: frame >= 80 }
            }) }
        });
        vi.stubGlobal("requestAnimationFrame", (callback: () => void) => {
            queueMicrotask(() => {
                x += velocity / 60 * cadence[frame % cadence.length]!;
                velocity = held;
                frame++;
                callback();
            });
        });
        const samples = await runPlatformerInput({ targetX: target, jumping: true, leftCode: 37, rightCode: 39, jumpCode: 38, delay: 0 });
        expect(frame).toBeLessThan(120);
        expect(samples.at(-1)!.vx).toBe(0);
        expect(held).toBe(0);
        expect(Math.sign(target - 1198)).toBe(direction);
        return x;
    }
    it("stops before the measured lethal boundary with alternating two/three-step renders", async () => {
        const x = await waypoint([2, 3], 1375.8700365257264);
        expect(x).toBeGreaterThan(1338); // actual destination left minus player half-width
        expect(x).toBeLessThan(1393.7400730514526); // actual hazard left minus player half-width
        expect(Math.abs(x - 1375.8700365257264)).toBeLessThanOrEqual(16);
    });
    it.each([[1], [2], [3], [3, 2, 2]])("handles fixed and variable cadence %j without seed/profile inputs", async (...steps) => {
        const x = await waypoint(steps, 1376);
        expect(Math.abs(x - 1376)).toBeLessThanOrEqual(16);
    });
    it("uses the same release policy for leftward input", async () => {
        const x = await waypoint([2, 3], 1020, -1);
        expect(Math.abs(x - 1020)).toBeLessThanOrEqual(16);
    });
});
