import type { PlatformerGameSpec } from "@game-factory/game-spec";

export const BENCHMARK_SEEDS = [1, 42, 2026, 12345, 98765] as const;
export const BENCHMARK_PROFILES = [
    { id: "gentle", speed: 160, jump: 520, length: 2400, width: [384, 448], gap: [32, 64], height: 20, enemy: 0, hazard: 0, collectible: 0.5, controls: "arrows" },
    { id: "reference", speed: 280, jump: 640, length: 3000, width: [384, 448], gap: [72, 88], height: 24, enemy: 0.6, hazard: 1, collectible: 1, controls: "arrows" },
    { id: "narrow-fast", speed: 420, jump: 640, length: 3600, width: [128, 192], gap: [80, 160], height: 100, enemy: 0.4, hazard: 0.6, collectible: 0.7, controls: "wasd" },
    { id: "low-jump", speed: 200, jump: 300, length: 2400, width: [192, 256], gap: [16, 48], height: 20, enemy: 0, hazard: 0.5, collectible: 1, controls: "wasd" },
    { id: "high-jump", speed: 320, jump: 900, length: 4200, width: [256, 384], gap: [200, 320], height: 240, enemy: 0.3, hazard: 0.4, collectible: 0.5, controls: "arrows" },
    { id: "pointer-jump", speed: 180, jump: 600, length: 2800, width: [256, 320], gap: [48, 100], height: 50, enemy: 0, hazard: 1, collectible: 1, controls: "pointer" }
] as const;

export function makeBenchmarkSpec(base: PlatformerGameSpec, id: string, seed: number): PlatformerGameSpec {
    const profile = BENCHMARK_PROFILES.find(profile => profile.id === id);
    if (!profile) throw new Error(`Unknown benchmark spec: ${id}`);
    if (!Number.isSafeInteger(seed) || seed < 0) throw new Error("Seed must be a nonnegative safe integer");
    const spec = structuredClone(base);
    spec.metadata = { title: `Benchmark ${id}`, description: `Deterministic Platformer robustness matrix v1: ${id}` };
    spec.generation.seed = seed;
    spec.player.movement = { move_speed: profile.speed, jump_force: profile.jump };
    spec.platformer = {
        level_length: profile.length, platform_width_min: profile.width[0], platform_width_max: profile.width[1],
        platform_gap_min: profile.gap[0], platform_gap_max: profile.gap[1], platform_height_variation: profile.height,
        enemy_density: profile.enemy, hazard_density: profile.hazard, collectible_density: profile.collectible
    };
    spec.controls = profile.controls === "arrows"
        ? { move_left: ["keyboard_left"], move_right: ["keyboard_right"], jump: ["keyboard_up"] }
        : { move_left: ["keyboard_a"], move_right: ["keyboard_d"], jump: profile.controls === "pointer" ? ["pointer"] : ["keyboard_space"] };
    return spec;
}
