
export interface FreeformRuntimePolicy {
    schemaVersion: "1.0";

    continuousMotion: {
        frameRateIndependent: true;

        allowedTimeModels: Array<
            | "delta_ms"
            | "engine_managed"
            | "fixed_timestep"
        >;

        deltaUnit: "milliseconds";
    };

    deterministicInput: {
        sameInputAndElapsedTimeSameResult: true;
    };

    verification: {
        requireBehavioralChecksForMotion: true;
        compareDifferentFrameRates: true;
        preventCoderFromEditingTests: true;
    };
}

export const DEFAULT_FREEFORM_RUNTIME_POLICY:
    Readonly<FreeformRuntimePolicy> = {
        schemaVersion: "1.0",

        continuousMotion: {
            frameRateIndependent: true,
            allowedTimeModels: [
                "delta_ms",
                "engine_managed",
                "fixed_timestep"
            ],
            deltaUnit: "milliseconds"
        },

        deterministicInput: {
            sameInputAndElapsedTimeSameResult: true
        },

        verification: {
            requireBehavioralChecksForMotion: true,
            compareDifferentFrameRates: true,
            preventCoderFromEditingTests: true
        }
    };
