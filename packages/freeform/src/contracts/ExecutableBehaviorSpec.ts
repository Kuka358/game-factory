
export type MotionSpeed =
    | {
        sourcePath: string;
        exportName: string;
        property: string;
        unit: "pixels_per_second";
    }
    | {
        sourcePath: string;
        exportName: string;
        property: string;
        unit: "pixels_per_nominal_frame";
        referenceFps: number;
    };

export interface HorizontalControllerBehaviorSpec {
    schemaVersion: "1.0";
    kind: "horizontal_boolean_controller";

    // SHA-256 of the accepted normalized contract.
    contractDigest: string;

    sourcePath: string;
    className: string;

    update: {
        method: "update";
        deltaArgumentIndex: 1;
        deltaUnit: "milliseconds";
    };

    controls: {
        negative: string;
        positive: string;
        simultaneous: "cancel";
        released: "stop";
    };

    coordinates: {
        xOrigin: "center";
        yOrigin: "center";
        initialX: "viewport_center";
        yBehavior: "fixed";
        horizontalBounds: "half_width_clamp";
    };

    speed: MotionSpeed;
}
