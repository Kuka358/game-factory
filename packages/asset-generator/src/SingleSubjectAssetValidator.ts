import sharp from "sharp";

import type {
    GeneratedAssetSemanticMetadata,
    GeneratedImage,
    NormalizedAssetGenerationRequest
} from "./AssetGenerationTypes.js";

export type AssetValidationIssueCode =
    | "probable_spritesheet"
    | "multiple_subjects"
    | "subject_too_small"
    | "semantic_mismatch";

export interface AssetValidationIssue {
    code:
        AssetValidationIssueCode;

    message:
        string;
}

export interface AssetValidationResult {
    valid:
        boolean;

    issues:
        AssetValidationIssue[];

    semanticReview?:
        GeneratedAssetSemanticMetadata;
}

export interface GeneratedAssetValidator {
    validate(
        image:
            GeneratedImage,

        request:
            NormalizedAssetGenerationRequest
    ): Promise<AssetValidationResult>;
}

export interface SingleSubjectAssetValidatorOptions {
    alphaThreshold?:
        number;

    minimumComponentPixels?:
        number;

    minimumComponentRatio?:
        number;

    comparableComponentRatio?:
        number;

    minimumSubjectCoverage?:
        number;
}

interface ResolvedOptions {
    alphaThreshold:
        number;

    minimumComponentPixels:
        number;

    minimumComponentRatio:
        number;

    comparableComponentRatio:
        number;

    minimumSubjectCoverage:
        number;
}

interface Component {
    pixels:
        number;

    left:
        number;

    top:
        number;

    right:
        number;

    bottom:
        number;
}

export class SingleSubjectAssetValidator
    implements GeneratedAssetValidator
{
    private readonly options:
        ResolvedOptions;

    constructor(
        options:
            SingleSubjectAssetValidatorOptions = {}
    ) {
        this.options = {
            alphaThreshold:
                options.alphaThreshold ??
                24,

            /*
            * Ignore tiny detached antialiasing/noise particles.
            */
            minimumComponentPixels:
                options.minimumComponentPixels ??
                48,

            /*
            * Component must contain at least 1% of all opaque
            * pixels before we consider it a real object.
            */
            minimumComponentRatio:
                options.minimumComponentRatio ??
                0.01,

            /*
            * Any second component with at least 15% of the
            * largest object's area is considered another
            * significant subject.
            */
            comparableComponentRatio:
                options.comparableComponentRatio ??
                0.15,

            /*
            * Main subject should not be a tiny object somewhere
            * in a huge empty canvas.
            */
            minimumSubjectCoverage:
                options.minimumSubjectCoverage ??
                0.06
        };
    }

    async validate(
        image:
            GeneratedImage,

        request:
            NormalizedAssetGenerationRequest
    ): Promise<AssetValidationResult> {
        if (
            request.allowSpritesheet
        ) {
            return valid();
        }

        if (
            !request.singleSubject
        ) {
            return valid();
        }

        switch (
            request.profile
        ) {
            case "background":
            case "tileset":
                return valid();
        }

        const decoded =
            await sharp(
                image.bytes
            )
                .ensureAlpha()
                .raw()
                .toBuffer({
                    resolveWithObject:
                        true
                });

        if (
            decoded.info.channels !==
            4
        ) {
            throw new Error(
                "Asset validator expected RGBA image"
            );
        }

        const components =
            findComponents(
                decoded.data,
                decoded.info.width,
                decoded.info.height,
                this.options
            );

        if (
            components.length ===
            0
        ) {
            return {
                valid:
                    false,

                issues: [
                    {
                        code:
                            "subject_too_small",

                        message:
                            "No visible subject could be detected"
                    }
                ]
            };
        }

        const largest =
            components[0];

        if (
            !largest
        ) {
            return valid();
        }

        const canvasPixels =
            decoded.info.width *
            decoded.info.height;

        const coverage =
            largest.pixels /
            canvasPixels;

        const issues:
            AssetValidationIssue[] =
            [];

        if (
            coverage <
            this.options
                .minimumSubjectCoverage
        ) {
            issues.push({
                code:
                    "subject_too_small",

                message:
                    `Largest visible subject covers only ${(
                        coverage *
                        100
                    ).toFixed(
                        1
                    )}% of the canvas`
            });
        }

        const comparable =
            components.filter(
                (component) =>
                    component.pixels >=
                    largest.pixels *
                    this.options
                        .comparableComponentRatio
            );

        if (
            comparable.length >=
            2
        ) {
            if (
                looksLikeSpriteSheet(
                    comparable
                )
            ) {
                issues.push({
                    code:
                        "probable_spritesheet",

                    message:
                        [
                            `Detected ${comparable.length}`,
                            "significant separated subjects",
                            "arranged like multiple sprite frames"
                        ].join(
                            " "
                        )
                });
            } else {
                issues.push({
                    code:
                        "multiple_subjects",

                    message:
                        [
                            `Expected exactly one dominant subject,`,
                            `but detected ${comparable.length}`,
                            "significant separated subjects"
                        ].join(
                            " "
                        )
                });
            }
        }

        return {
            valid:
                issues.length ===
                0,

            issues
        };
    }
}

function valid():
    AssetValidationResult
{
    return {
        valid:
            true,

        issues:
            []
    };
}

function findComponents(
    rgba:
        Buffer,

    width:
        number,

    height:
        number,

    options:
        ResolvedOptions
): Component[] {
    const pixelCount =
        width *
        height;

    const visited =
        new Uint8Array(
            pixelCount
        );

    const queue =
        new Int32Array(
            pixelCount
        );

    const components:
        Component[] =
        [];

    let totalOpaque =
        0;

    for (
        let pixel = 0;
        pixel < pixelCount;
        pixel += 1
    ) {
        if (
            rgba[
                pixel *
                4 +
                3
            ] >
            options.alphaThreshold
        ) {
            totalOpaque +=
                1;
        }
    }

    const minimumPixels =
        Math.max(
            options
                .minimumComponentPixels,

            Math.floor(
                totalOpaque *
                options
                    .minimumComponentRatio
            )
        );

    for (
        let start = 0;
        start < pixelCount;
        start += 1
    ) {
        if (
            visited[
                start
            ]
        ) {
            continue;
        }

        const alpha =
            rgba[
                start *
                4 +
                3
            ];

        if (
            alpha <=
            options.alphaThreshold
        ) {
            visited[
                start
            ] =
                1;

            continue;
        }

        let read =
            0;

        let write =
            0;

        queue[
            write++
        ] =
            start;

        visited[
            start
        ] =
            1;

        let pixels =
            0;

        let left =
            width;

        let top =
            height;

        let right =
            -1;

        let bottom =
            -1;

        while (
            read <
            write
        ) {
            const pixel =
                queue[
                    read++
                ];

            const x =
                pixel %
                width;

            const y =
                Math.floor(
                    pixel /
                    width
                );

            pixels +=
                1;

            left =
                Math.min(
                    left,
                    x
                );

            right =
                Math.max(
                    right,
                    x
                );

            top =
                Math.min(
                    top,
                    y
                );

            bottom =
                Math.max(
                    bottom,
                    y
                );

            visitNeighbor(
                pixel - 1,
                x > 0
            );

            visitNeighbor(
                pixel + 1,
                x <
                    width - 1
            );

            visitNeighbor(
                pixel - width,
                y > 0
            );

            visitNeighbor(
                pixel + width,
                y <
                    height - 1
            );
        }

        if (
            pixels >=
            minimumPixels
        ) {
            components.push({
                pixels,
                left,
                top,
                right,
                bottom
            });
        }

        function visitNeighbor(
            pixel:
                number,

            allowed:
                boolean
        ): void {
            if (
                !allowed ||
                visited[
                    pixel
                ]
            ) {
                return;
            }

            visited[
                pixel
            ] =
                1;

            const neighborAlpha =
                rgba[
                    pixel *
                        4 +
                        3
                ];

            if (
                neighborAlpha <=
                options.alphaThreshold
            ) {
                return;
            }

            queue[
                write++
            ] =
                pixel;
        }
    }

    return components.sort(
        (
            a,
            b
        ) =>
            b.pixels -
            a.pixels
    );
}

function looksLikeSpriteSheet(
    components:
        readonly Component[]
): boolean {
    if (
        components.length <
        2
    ) {
        return false;
    }

    const widths =
        components.map(
            component =>
                component.right -
                component.left +
                1
        );

    const heights =
        components.map(
            component =>
                component.bottom -
                component.top +
                1
        );

    const centersX =
        components.map(
            component =>
                (
                    component.left +
                    component.right
                ) /
                2
        );

    const centersY =
        components.map(
            component =>
                (
                    component.top +
                    component.bottom
                ) /
                2
        );

    const averageWidth =
        average(
            widths
        );

    const averageHeight =
        average(
            heights
        );

    const horizontalStrip =
        range(
            centersY
        ) <=
        averageHeight *
            0.75;

    const verticalStrip =
        range(
            centersX
        ) <=
        averageWidth *
            0.75;

    const similarSizes =
        ratio(
            Math.min(
                ...components.map(
                    component =>
                        component.pixels
                )
            ),

            Math.max(
                ...components.map(
                    component =>
                        component.pixels
                )
            )
        ) >=
        0.35;

    if (
        similarSizes &&
        (
            horizontalStrip ||
            verticalStrip
        )
    ) {
        return true;
    }

    /*
     * 4+ similarly sized isolated subjects are strongly
     * suspicious even when arranged in a 2x2 grid.
     */
    return (
        similarSizes &&
        components.length >=
            4
    );
}

function average(
    values:
        readonly number[]
): number {
    if (
        values.length ===
        0
    ) {
        return 0;
    }

    return values.reduce(
        (
            sum,
            value
        ) =>
            sum + value,

        0
    ) /
        values.length;
}

function range(
    values:
        readonly number[]
): number {
    if (
        values.length ===
        0
    ) {
        return 0;
    }

    return (
        Math.max(
            ...values
        ) -
        Math.min(
            ...values
        )
    );
}

function ratio(
    smaller:
        number,

    larger:
        number
): number {
    if (
        larger <=
        0
    ) {
        return 0;
    }

    return smaller /
        larger;
}