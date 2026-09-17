// Self-contained browser callback: Playwright serializes this function.
// Cadence regressions exercise the same callback as normal QA.
export interface PlatformerInputOptions {
    targetX: number; jumping: boolean; leftCode: number; rightCode: number;
    jumpCode: number; delay: number;
}
export async function runPlatformerInput({ targetX, jumping, leftCode, rightCode, jumpCode, delay }: PlatformerInputOptions) {
        const bridge = window.__GAME_FACTORY__;
        if (!bridge) throw new Error("Missing debug bridge");
        const state = () => bridge.getState();
        const key = (type: string, keyCode: number) => window.dispatchEvent(new KeyboardEvent(type, { keyCode, which: keyCode, bubbles: true }));
        const startX = state().player!.x;
        const right = targetX > startX;
        const direction = right ? rightCode : leftCode;
        let moving = Math.abs(targetX - startX) >= 4;
        if (jumping) {
            if (jumpCode) key("keydown", jumpCode);
            else bridge.dispatchAction("jump");
        }
        let pressed = moving && (!jumping || delay === 0);
        if (pressed) key("keydown", direction);
        let jumpObservedAt: number | undefined;
        let airborne = false;
        let previousX = startX, minimumAdvance = Infinity, maximumAdvance = 0;
        const deadline = performance.now() + 10_000;
        const samples: { x: number; y: number; vx: number; vy: number; grounded: boolean }[] = [];
        try {
            await new Promise<void>((resolve, reject) => {
                const step = () => {
                    const current = state();
                    samples.push({ x: current.player!.x, y: current.player!.y, vx: current.details?.playerVelocity?.x ?? 0, vy: current.details?.playerVelocity?.y ?? 0, grounded: Boolean(current.details?.grounded) });
                    if (samples.length > 120) samples.shift();
                    if (jumping && !current.details?.grounded) airborne = true;
                    if (jumpObservedAt === undefined && (current.details?.playerVelocity?.y ?? 0) < 0) jumpObservedAt = performance.now();
                    if (moving && !pressed && jumpObservedAt !== undefined && performance.now() - jumpObservedAt >= delay * 1000) {
                        key("keydown", direction);
                        pressed = true;
                    }
                    // Arcade sets velocity directly each update. Release before the
                    // next physics steps, rather than waiting to cross the target.
                    const currentX = current.player!.x;
                    const advance = Math.abs(currentX - previousX);
                    if (pressed && advance > 0 && Math.abs(current.details?.playerVelocity?.x ?? 0) > 0) {
                        minimumAdvance = Math.min(minimumAdvance, advance);
                        maximumAdvance = Math.max(maximumAdvance, advance);
                    }
                    previousX = currentX;
                    // Arcade can integrate the preceding velocity before the
                    // scene consumes keyup. Centre the stopping interval using
                    // observed render advances instead of assuming two steps.
                    const releaseDistance = maximumAdvance > 0
                        ? maximumAdvance + minimumAdvance / 2
                        : Math.abs(current.details?.playerVelocity?.x ?? 0) / 30 + 2;
                    if (moving && pressed && (right ? current.player!.x >= targetX - releaseDistance : current.player!.x <= targetX + releaseDistance)) {
                        key("keyup", direction);
                        moving = false;
                    }
                    if (current.game_over || (!moving && (!jumping || (airborne && current.details?.grounded)))) return resolve();
                    if (performance.now() > deadline) return reject(new Error("Platformer input waypoint timed out"));
                    requestAnimationFrame(step);
                };
                requestAnimationFrame(step);
            });
        } finally {
            key("keyup", direction);
            if (jumpCode) key("keyup", jumpCode);
        }
        return samples;

}
