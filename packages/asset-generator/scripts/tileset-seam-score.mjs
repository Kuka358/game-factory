import sharp from "sharp";


export async function calculateHorizontalSeamScore(
    bytes,
    edgeWidth = 4
) {
    const {
        data,
        info
    } =
        await sharp(
            bytes
        )
            .ensureAlpha()
            .raw()
            .toBuffer({
                resolveWithObject:
                    true
            });


    const width =
        info.width;

    const height =
        info.height;

    const channels =
        info.channels;


    let difference =
        0;

    let samples =
        0;


    for (
        let y = 0;
        y < height;
        y += 1
    ) {
        for (
            let edgeX = 0;
            edgeX < edgeWidth;
            edgeX += 1
        ) {
            const leftX =
                edgeX;

            const rightX =
                width -
                edgeWidth +
                edgeX;


            const leftIndex =
                (
                    y *
                    width +
                    leftX
                ) *
                channels;

            const rightIndex =
                (
                    y *
                    width +
                    rightX
                ) *
                channels;


            for (
                let channel = 0;
                channel < 3;
                channel += 1
            ) {
                difference +=
                    Math.abs(
                        data[
                            leftIndex +
                            channel
                        ] -
                        data[
                            rightIndex +
                            channel
                        ]
                    );

                samples +=
                    1;
            }
        }
    }


    if (
        samples === 0
    ) {
        return 0;
    }


    const averageDifference =
        difference /
        samples;


    /*
     * 100 = identical edges.
     * 0   = maximum possible mismatch.
     */
    return Number(
        (
            100 -
            (
                averageDifference /
                255 *
                100
            )
        ).toFixed(
            2
        )
    );
}