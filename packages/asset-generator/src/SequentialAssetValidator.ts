import type {
    GeneratedImage,
    NormalizedAssetGenerationRequest
} from "./AssetGenerationTypes.js";

import type {
    AssetValidationResult,
    GeneratedAssetValidator
} from "./SingleSubjectAssetValidator.js";


export class SequentialAssetValidator
    implements GeneratedAssetValidator
{
    constructor(
        private readonly validators:
            readonly GeneratedAssetValidator[]
    ) {}


    async validate(
        image:
            GeneratedImage,

        request:
            NormalizedAssetGenerationRequest
    ): Promise<AssetValidationResult> {
        let semanticReview:
            AssetValidationResult[
                "semanticReview"
            ];


        for (
            const validator of
            this.validators
        ) {
            const result =
                await validator.validate(
                    image,
                    request
                );


            if (
                result.semanticReview
            ) {
                semanticReview =
                    result.semanticReview;
            }


            /*
             * Deliberately short circuit.
             *
             * There is no reason to spend money on a VLM
             * when structural validation already failed.
             */
            if (
                !result.valid
            ) {
                return {
                    ...result,

                    semanticReview:
                        result.semanticReview ??
                        semanticReview
                };
            }
        }


        return {
            valid:
                true,

            issues:
                [],

            semanticReview
        };
    }
}