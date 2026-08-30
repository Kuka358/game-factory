import type {
    PlatformerGameSpec
} from "@game-factory/game-spec";

import {
    ARCADE_GRAVITY_Y
} from "../../physics.js";


const PLATFORM_TILE_SIZE =
    64;

const PLATFORM_HEIGHT =
    PLATFORM_TILE_SIZE;


const MIN_PLATFORM_CENTER_Y =
    180;


const BOTTOM_MARGIN =
    70;


/*
 * We intentionally use only part of the mathematically
 * available jump distance.
 *
 * A human player needs some margin for imperfect timing.
 */
const JUMP_REACH_SAFETY =
    0.68;


const MAX_DOWNWARD_STEP =
    180;


export interface PlatformerLevelPlatform {
    index:
        number;

    x:
        number;

    y:
        number;

    width:
        number;

    height:
        number;
}


export interface PlatformerLevelPoint {
    x:
        number;

    y:
        number;
}


export interface PlatformerLevelLayout {
    seed:
        number;

    worldWidth:
        number;

    platforms:
        PlatformerLevelPlatform[];

    playerSpawn:
        PlatformerLevelPoint;

    goal:
        PlatformerLevelPoint;
}


export interface GeneratePlatformerLevelInput {
    spec:
        PlatformerGameSpec;

    viewportHeight:
        number;
}


export function generatePlatformerLevel(
    input:
        GeneratePlatformerLevelInput
): PlatformerLevelLayout {
    const {
        spec,
        viewportHeight
    } =
        input;


    const random =
        createSeededRandom(
            spec.generation.seed
        );


    const settings =
        spec.platformer;


    const firstWidth =
        randomGridAlignedInteger(
            random,

            settings
                .platform_width_min,

            settings
                .platform_width_max,

            PLATFORM_TILE_SIZE
        );


    const bottomPlatformY =
        viewportHeight -
        BOTTOM_MARGIN;


    const platforms:
        PlatformerLevelPlatform[] = [
            {
                index:
                    0,

                x:
                    firstWidth /
                    2,

                y:
                    bottomPlatformY,

                width:
                    firstWidth,

                height:
                    PLATFORM_HEIGHT
            }
        ];


    let current =
        platforms[0];


    if (
        !current
    ) {
        throw new Error(
            "Unable to create initial platform"
        );
    }


    /*
     * Do not try to push platforms all the way to the
     * mathematical world boundary. We only need the final
     * playable platform to end reasonably close to it.
     */
    const targetRightEdge =
        Math.max(
            firstWidth +
                300,

            settings.level_length -
                220
        );


    while (
        rightEdge(
            current
        ) <
        targetRightEdge
    ) {
        const width =
            randomGridAlignedInteger(
                random,

                settings
                    .platform_width_min,

                settings
                    .platform_width_max,

                PLATFORM_TILE_SIZE
            );


        const maximumJumpRise =
            calculateMaximumSafeRise(
                spec.player
                    .movement
                    .jump_force
            );


        const configuredRise =
            Math.min(
                settings
                    .platform_height_variation,

                maximumJumpRise
            );


        const configuredDrop =
            Math.min(
                settings
                    .platform_height_variation,

                MAX_DOWNWARD_STEP
            );


        /*
         * Negative screen-Y = next platform is higher.
         * Positive screen-Y = next platform is lower.
         */
        const requestedDeltaY =
            randomInteger(
                random,

                -configuredRise,

                configuredDrop
            );


        const minimumY =
            Math.min(
                MIN_PLATFORM_CENTER_Y,
                bottomPlatformY
            );


        const nextY =
            clamp(
                current.y +
                    requestedDeltaY,

                minimumY,

                bottomPlatformY
            );


        const actualDeltaY =
            nextY -
            current.y;


        const maximumReachableGap =
            calculateMaximumSafeHorizontalGap({
                moveSpeed:
                    spec.player
                        .movement
                        .move_speed,

                jumpForce:
                    spec.player
                        .movement
                        .jump_force,

                deltaY:
                    actualDeltaY
            });


        /*
         * Playability takes priority over the requested
         * minimum gap. If AI asks for gap_min=300 while
         * this character can only safely jump 170px,
         * the generator clamps it instead of generating
         * an impossible level.
         */
        const gapMax =
            Math.max(
                0,

                Math.min(
                    settings
                        .platform_gap_max,

                    maximumReachableGap
                )
            );


        const gapMin =
            Math.min(
                settings
                    .platform_gap_min,

                gapMax
            );


        const gap =
            randomInteger(
                random,
                gapMin,
                gapMax
            );


        const x =
            rightEdge(
                current
            ) +
            gap +
            width /
                2;


        /*
         * Avoid creating a platform whose majority lies
         * outside the configured world.
         */
        if (
            x +
                width /
                    2 >
            settings.level_length -
                40
        ) {
            break;
        }


        const next:
            PlatformerLevelPlatform = {
            index:
                platforms.length,

            x,

            y:
                nextY,

            width,

            height:
                PLATFORM_HEIGHT
        };


        platforms.push(
            next
        );


        current =
            next;
    }


    const firstPlatform =
        platforms[0];


    const lastPlatform =
        platforms[
            platforms.length -
                1
        ];


    if (
        !firstPlatform ||
        !lastPlatform
    ) {
        throw new Error(
            "Platformer level contains no platforms"
        );
    }


    const playerSpawn = {
        x:
            Math.min(
                firstPlatform.x,

                leftEdge(
                    firstPlatform
                ) +
                    110
            ),

        y:
            topEdge(
                firstPlatform
            ) -
            42
    };


    const goal = {
        x:
            Math.max(
                lastPlatform.x,

                rightEdge(
                    lastPlatform
                ) -
                    72
            ),

        /*
         * Goal sprite is ~96px tall.
         */
        y:
            topEdge(
                lastPlatform
            ) -
            48
    };


    return {
        seed:
            spec.generation.seed,

        worldWidth:
            Math.max(
                settings.level_length,

                rightEdge(
                    lastPlatform
                ) +
                    160
            ),

        platforms,

        playerSpawn,

        goal
    };
}


function calculateMaximumSafeRise(
    jumpForce:
        number
): number {
    /*
     * Maximum theoretical jump height:
     *
     * h = v² / 2g
     *
     * We only use 65% so generated jumps remain
     * comfortable instead of frame-perfect.
     */
    const theoretical =
        (
            jumpForce *
            jumpForce
        ) /
        (
            2 *
            ARCADE_GRAVITY_Y
        );


    return Math.max(
        0,

        Math.floor(
            theoretical *
            0.65
        )
    );
}


function calculateMaximumSafeHorizontalGap(
    input: {
        moveSpeed:
            number;

        jumpForce:
            number;

        deltaY:
            number;
    }
): number {
    const {
        moveSpeed,
        jumpForce,
        deltaY
    } =
        input;


    /*
     * Vertical motion:
     *
     * y(t) = -v*t + 0.5*g*t²
     *
     * Solve for the requested platform height difference.
     */
    const discriminant =
        jumpForce *
            jumpForce +
        2 *
            ARCADE_GRAVITY_Y *
            deltaY;


    if (
        discriminant <=
        0
    ) {
        return 0;
    }


    const flightTime =
        (
            jumpForce +
            Math.sqrt(
                discriminant
            )
        ) /
        ARCADE_GRAVITY_Y;


    const horizontalDistance =
        moveSpeed *
        flightTime *
        JUMP_REACH_SAFETY;


    return Math.max(
        0,

        Math.floor(
            horizontalDistance
        )
    );
}


function createSeededRandom(
    seed:
        number
): () => number {
    /*
     * xorshift32.
     *
     * Fast, deterministic and more than sufficient for
     * procedural platform placement.
     */
    let state =
        seed |
        0;


    if (
        state ===
        0
    ) {
        state =
            0x6d2b79f5;
    }


    return () => {
        state ^=
            state <<
            13;

        state ^=
            state >>>
            17;

        state ^=
            state <<
            5;


        return (
            state >>>
            0
        ) /
        4_294_967_296;
    };
}


function randomInteger(
    random:
        () => number,

    minimum:
        number,

    maximum:
        number
): number {
    const min =
        Math.ceil(
            Math.min(
                minimum,
                maximum
            )
        );


    const max =
        Math.floor(
            Math.max(
                minimum,
                maximum
            )
        );


    if (
        min ===
        max
    ) {
        return min;
    }


    return (
        min +
        Math.floor(
            random() *
            (
                max -
                min +
                1
            )
        )
    );
}

function randomGridAlignedInteger(
    random:
        () => number,

    minimum:
        number,

    maximum:
        number,

    grid:
        number
): number {
    const min =
        Math.ceil(
            Math.min(
                minimum,
                maximum
            )
        );

    const max =
        Math.floor(
            Math.max(
                minimum,
                maximum
            )
        );


    const firstAligned =
        Math.ceil(
            min /
            grid
        ) *
        grid;

    const lastAligned =
        Math.floor(
            max /
            grid
        ) *
        grid;


    /*
     * Normally platform bounds contain at least one
     * complete 64px tile.
     *
     * Keep a defensive fallback for unusual specs.
     */
    if (
        firstAligned >
        lastAligned
    ) {
        return randomInteger(
            random,
            min,
            max
        );
    }


    const stepCount =
        Math.floor(
            (
                lastAligned -
                firstAligned
            ) /
            grid
        );


    return (
        firstAligned +
        randomInteger(
            random,
            0,
            stepCount
        ) *
        grid
    );
}


function leftEdge(
    platform:
        PlatformerLevelPlatform
): number {
    return (
        platform.x -
        platform.width /
            2
    );
}


function rightEdge(
    platform:
        PlatformerLevelPlatform
): number {
    return (
        platform.x +
        platform.width /
            2
    );
}


function topEdge(
    platform:
        PlatformerLevelPlatform
): number {
    return (
        platform.y -
        platform.height /
            2
    );
}


function clamp(
    value:
        number,

    minimum:
        number,

    maximum:
        number
): number {
    return Math.min(
        maximum,

        Math.max(
            minimum,
            value
        )
    );
}