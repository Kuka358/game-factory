export type AIErrorCode =
    | "request_failed"
    | "invalid_response"
    | "structured_output_failed"
    | "timeout"
    | "configuration_error"
    | "review_failed";

export class AIError
    extends Error
{
    constructor(
        public readonly code:
            AIErrorCode,

        message:
            string,

        public readonly provider?:
            string,

        options?: {
            cause?:
                unknown;
        }
    ) {
        super(
            message,
            options
        );

        this.name =
            "AIError";
    }
}