export interface SurgicalCreateFileEdit {
    operation:
        "create";

    path:
        string;

    content:
        string;
}


export interface SurgicalReplaceEdit {
    operation:
        "replace";

    path:
        string;

    /**
     * Exact text copied from the current file.
     *
     * It must occur exactly once in the current virtual file state.
     */
    oldText:
        string;

    newText:
        string;
}


export interface SurgicalDeleteFileEdit {
    operation:
        "delete";

    path:
        string;
}


export type SurgicalFileEdit =
    | SurgicalCreateFileEdit
    | SurgicalReplaceEdit
    | SurgicalInsertBeforeEdit
    | SurgicalInsertAfterEdit
    | SurgicalDeleteFileEdit;


export interface SurgicalFileSnapshot {
    path:
        string;

    /**
     * null means that the file does not exist.
     *
     * Empty files are represented by "".
     */
    content:
        string | null;
}


export interface PlannedSurgicalFileMutation {
    path:
        string;

    operation:
        "write" | "delete";

    /**
     * Content observed before the edit batch.
     *
     * Later the filesystem applicator can use this value to detect
     * concurrent/stale changes before touching the worktree.
     */
    originalContent:
        string | null;

    /**
     * Complete final content for write operations.
     *
     * Delete operations always use "".
     */
    content:
        string;
}


interface MutableFileState {
    originalContent:
        string | null;

    currentContent:
        string | null;
}

export interface SurgicalInsertBeforeEdit {
    operation:
        "insert_before";

    path:
        string;

    anchor:
        string;

    content:
        string;
}


export interface SurgicalInsertAfterEdit {
    operation:
        "insert_after";

    path:
        string;

    anchor:
        string;

    content:
        string;
}


const MAX_SURGICAL_REPLACE_COVERAGE =
    0.8;


/**
 * Validate and calculate a complete edit batch entirely in memory.
 *
 * No filesystem mutation happens here. If any edit is invalid the
 * complete batch fails and no mutation plan is returned.
 */
export function planSurgicalEdits(
    snapshots:
        readonly SurgicalFileSnapshot[],

    edits:
        readonly SurgicalFileEdit[]
): PlannedSurgicalFileMutation[] {
    const states =
        new Map<
            string,
            MutableFileState
        >();


    for (
        const snapshot of
        snapshots
    ) {
        const path =
            normalizeSurgicalPath(
                snapshot.path
            );


        if (
            states.has(
                path
            )
        ) {
            throw new Error(
                `Duplicate surgical edit snapshot: ${path}`
            );
        }


        if (
            snapshot.content !==
                null &&
            typeof snapshot.content !==
                "string"
        ) {
            throw new Error(
                `Invalid surgical edit snapshot content: ${path}`
            );
        }


        states.set(
            path,
            {
                originalContent:
                    snapshot.content,

                currentContent:
                    snapshot.content
            }
        );
    }


    const touchedPaths:
        string[] = [];

    const touched =
        new Set<string>();


    for (
        const edit of
        edits
    ) {
        const path =
            normalizeSurgicalPath(
                edit.path
            );


        const state =
            states.get(
                path
            );


        if (!state) {
            throw new Error(
                `Surgical edit has no file snapshot: ${path}`
            );
        }


        switch (
            edit.operation
        ) {
            case "create": {
                validateString(
                    edit.content,
                    `create content for ${path}`
                );


                /*
                 * Checking originalContent, rather than only the
                 * current virtual state, prevents:
                 *
                 *   delete existing file
                 *   create same file with arbitrary full content
                 *
                 * from becoming a full-file rewrite escape hatch.
                 */
                if (
                    state.originalContent !==
                    null
                ) {
                    throw new Error(
                        `Surgical create requires a missing file: ${path}`
                    );
                }


                if (
                    state.currentContent !==
                    null
                ) {
                    throw new Error(
                        `Surgical file was already created in this batch: ${path}`
                    );
                }


                state.currentContent =
                    edit.content;

                break;
            }


            case "replace": {
                if (
                    state.currentContent ===
                    null
                ) {
                    throw new Error(
                        `Surgical replace requires an existing file: ${path}`
                    );
                }


                if (
                    edit.oldText.length ===
                    0
                ) {
                    throw new Error(
                        `Surgical replace oldText must not be empty: ${path}`
                    );
                }


                if (
                    edit.oldText ===
                    edit.newText
                ) {
                    throw new Error(
                        `Surgical replace must change content: ${path}`
                    );
                }


                /*
                * Capture the current virtual state once.
                *
                * All validation below must be calculated against the file
                * BEFORE this replacement is applied.
                */
                const currentContent =
                    state.currentContent;


                const normalizedCurrentContent =
                    normalizeNewlines(
                        currentContent
                    );


                const normalizedOldText =
                    normalizeNewlines(
                        edit.oldText
                    );


                /*
                * Treat LF and CRLF as equivalent for the complete-file
                * rewrite guard.
                */
                if (
                    normalizedOldText ===
                    normalizedCurrentContent
                ) {
                    throw new Error(
                        `Surgical replace must not replace the complete existing file: ${path}`
                    );
                }


                /*
                * Resolve the real source range first.
                *
                * findUniqueTextRange still requires exact text apart from
                * newline representation.
                */
                const match =
                    findUniqueTextRange(
                        currentContent,
                        edit.oldText,
                        path,
                        "replace"
                    );


                /*
                * Coverage is based on logical text, not the replacement
                * result and not platform-specific CRLF byte/character count.
                *
                * This check MUST happen before currentContent is modified.
                */
                const replacementCoverage =
                    normalizedOldText.length /
                    normalizedCurrentContent.length;


                if (
                    replacementCoverage >
                    MAX_SURGICAL_REPLACE_COVERAGE
                ) {
                    throw new Error(
                        [
                            `Surgical replace anchor covers too much of the existing file: ${path}`,
                            `coverage=${(
                                replacementCoverage *
                                100
                            ).toFixed(
                                1
                            )}%`,
                            `limit=${(
                                MAX_SURGICAL_REPLACE_COVERAGE *
                                100
                            ).toFixed(
                                1
                            )}%`
                        ].join(
                            " "
                        )
                    );
                }


                const replacement =
                    adaptReplacementNewlines(
                        edit.newText,
                        currentContent,
                        match.start,
                        match.end
                    );


                state.currentContent =
                    currentContent.slice(
                        0,
                        match.start
                    ) +
                    replacement +
                    currentContent.slice(
                        match.end
                    );


                break;
            }

            case "insert_before":
            case "insert_after": {
                if (
                    state.currentContent ===
                    null
                ) {
                    throw new Error(
                        `Surgical insert requires an existing file: ${path}`
                    );
                }


                if (
                    edit.anchor.length ===
                    0
                ) {
                    throw new Error(
                        `Surgical insert anchor must not be empty: ${path}`
                    );
                }


                if (
                    edit.content.length ===
                    0
                ) {
                    throw new Error(
                        `Surgical insert content must not be empty: ${path}`
                    );
                }


                /*
                * Capture the narrowed value once.
                *
                * state.currentContent is mutable state, so TypeScript does not
                * reliably preserve its string narrowing across subsequent calls.
                */
                const currentContent =
                    state.currentContent;


                const match =
                    findUniqueTextRange(
                        currentContent,
                        edit.anchor,
                        path,
                        "insert"
                    );


                const insertion =
                    adaptReplacementNewlines(
                        edit.content,
                        currentContent,
                        match.start,
                        match.end
                    );


                const insertAt =
                    edit.operation ===
                        "insert_before"
                        ? match.start
                        : match.end;


                state.currentContent =
                    currentContent.slice(
                        0,
                        insertAt
                    ) +
                    insertion +
                    currentContent.slice(
                        insertAt
                    );


                break;
            }


            case "delete": {
                /*
                 * A file created earlier in this batch may not be
                 * deleted again. It is unnecessary work and would
                 * make the protocol easier to abuse.
                 */
                if (
                    state.originalContent ===
                    null
                ) {
                    throw new Error(
                        `Surgical delete requires a file that existed before the batch: ${path}`
                    );
                }


                if (
                    state.currentContent ===
                    null
                ) {
                    throw new Error(
                        `Surgical file was already deleted in this batch: ${path}`
                    );
                }


                state.currentContent =
                    null;

                break;
            }


            default: {
                const unreachable:
                    never =
                    edit;


                throw new Error(
                    `Unsupported surgical edit operation: ${String(
                        (
                            unreachable as {
                                operation?:
                                    unknown;
                            }
                        ).operation
                    )}`
                );
            }
        }


        if (
            !touched.has(
                path
            )
        ) {
            touched.add(
                path
            );

            touchedPaths.push(
                path
            );
        }
    }


    const result:
        PlannedSurgicalFileMutation[] = [];


    for (
        const path of
        touchedPaths
    ) {
        const state =
            states.get(
                path
            );


        if (!state) {
            throw new Error(
                `Missing surgical edit state: ${path}`
            );
        }


        /*
         * Multiple valid replacements could theoretically cancel
         * each other. Do not report a mutation when the final state
         * is byte-for-byte identical to the original snapshot.
         */
        if (
            state.currentContent ===
            state.originalContent
        ) {
            continue;
        }


        if (
            state.currentContent ===
            null
        ) {
            result.push({
                path,

                operation:
                    "delete",

                originalContent:
                    state.originalContent,

                content:
                    ""
            });

            continue;
        }


        result.push({
            path,

            operation:
                "write",

            originalContent:
                state.originalContent,

            content:
                state.currentContent
        });
    }


    return result;
}


function replaceExactOnce(
    content:
        string,

    oldText:
        string,

    newText:
        string
): string {
    const index =
        content.indexOf(
            oldText
        );


    if (
        index <
        0
    ) {
        /*
         * Normally unreachable because occurrence count was already
         * checked, but keep this helper independently safe.
         */
        throw new Error(
            "Surgical replacement anchor disappeared"
        );
    }


    return (
        content.slice(
            0,
            index
        ) +
        newText +
        content.slice(
            index +
            oldText.length
        )
    );
}


function countOccurrences(
    content:
        string,

    search:
        string
): number {
    let count =
        0;

    let offset =
        0;


    while (
        offset <=
        content.length -
            search.length
    ) {
        const index =
            content.indexOf(
                search,
                offset
            );


        if (
            index <
            0
        ) {
            break;
        }


        count +=
            1;


        /*
         * Advance by one rather than search.length so overlapping
         * anchors are considered ambiguous too.
         */
        offset =
            index +
            1;
    }


    return count;
}


function normalizeSurgicalPath(
    value:
        string
): string {
    if (
        typeof value !==
        "string"
    ) {
        throw new Error(
            "Surgical edit path must be a string"
        );
    }


    const normalized =
        value.trim();


    if (
        normalized.length ===
        0
    ) {
        throw new Error(
            "Surgical edit path must not be empty"
        );
    }


    return normalized;
}


function validateString(
    value:
        unknown,

    name:
        string
): asserts value is string {
    if (
        typeof value !==
        "string"
    ) {
        throw new Error(
            `${name} must be a string`
        );
    }
}

interface TextRange {
    start:
        number;

    end:
        number;
}


interface NormalizedText {
    text:
        string;

    offsets:
        readonly number[];
}


function findUniqueTextRange(
    content:
        string,

    needle:
        string,

    path:
        string,

    kind:
        "replace" |
        "insert"
): TextRange {
    const exactMatches =
        findAllOccurrences(
            content,
            needle
        );


    if (
        exactMatches.length ===
        1
    ) {
        const start =
            exactMatches[0]!;


        return {
            start,

            end:
                start +
                needle.length
        };
    }


    if (
        exactMatches.length >
        1
    ) {
        throw new Error(
            kind ===
                "replace"
                ? `Surgical replace anchor is ambiguous: ${path}`
                : `Surgical insert anchor is ambiguous: ${path}`
        );
    }


    /*
     * LF and CRLF are two encodings of the same textual
     * line boundary. This is the only normalization allowed
     * here. Spaces, tabs and all non-newline characters still
     * require exact equality.
     */
    if (
        !containsLineBreak(
            needle
        )
    ) {
        throw new Error(
            kind ===
                "replace"
                ? `Surgical replace anchor was not found: ${path}`
                : `Surgical insert anchor was not found: ${path}`
        );
    }


    const normalizedContent =
        normalizeNewlinesWithOffsets(
            content
        );


    const normalizedNeedle =
        normalizeNewlines(
            needle
        );


    const normalizedMatches =
        findAllOccurrences(
            normalizedContent.text,
            normalizedNeedle
        );


    if (
        normalizedMatches.length ===
        0
    ) {
        throw new Error(
            kind ===
                "replace"
                ? `Surgical replace anchor was not found: ${path}`
                : `Surgical insert anchor was not found: ${path}`
        );
    }


    if (
        normalizedMatches.length >
        1
    ) {
        throw new Error(
            kind ===
                "replace"
                ? `Surgical replace anchor is ambiguous: ${path}`
                : `Surgical insert anchor is ambiguous: ${path}`
        );
    }


    const normalizedStart =
        normalizedMatches[0]!;


    const normalizedEnd =
        normalizedStart +
        normalizedNeedle.length;


    const start =
        normalizedContent
            .offsets[
                normalizedStart
            ];


    const end =
        normalizedContent
            .offsets[
                normalizedEnd
            ];


    if (
        start ===
            undefined ||
        end ===
            undefined
    ) {
        throw new Error(
            `Unable to map normalized surgical edit range: ${path}`
        );
    }


    return {
        start,
        end
    };
}


function findAllOccurrences(
    content:
        string,

    needle:
        string
): number[] {
    const result:
        number[] = [];


    let offset =
        0;


    while (
        offset <=
        content.length -
            needle.length
    ) {
        const found =
            content.indexOf(
                needle,
                offset
            );


        if (
            found <
            0
        ) {
            break;
        }


        result.push(
            found
        );


        /*
         * Preserve overlapping-match detection.
         */
        offset =
            found +
            1;
    }


    return result;
}


function containsLineBreak(
    value:
        string
): boolean {
    return (
        value.includes(
            "\n"
        ) ||
        value.includes(
            "\r"
        )
    );
}


function normalizeNewlines(
    value:
        string
): string {
    return value.replace(
        /\r\n|\r/g,
        "\n"
    );
}


function normalizeNewlinesWithOffsets(
    value:
        string
): NormalizedText {
    let text =
        "";


    const offsets:
        number[] = [];


    let sourceIndex =
        0;


    while (
        sourceIndex <
        value.length
    ) {
        offsets.push(
            sourceIndex
        );


        if (
            value[sourceIndex] ===
                "\r" &&
            value[sourceIndex + 1] ===
                "\n"
        ) {
            text +=
                "\n";

            sourceIndex +=
                2;

            continue;
        }


        if (
            value[sourceIndex] ===
            "\r"
        ) {
            text +=
                "\n";

            sourceIndex +=
                1;

            continue;
        }


        text +=
            value[sourceIndex];

        sourceIndex +=
            1;
    }


    offsets.push(
        value.length
    );


    return {
        text,
        offsets
    };
}


function adaptReplacementNewlines(
    value:
        string,

    currentContent:
        string,

    start:
        number,

    end:
        number
): string {
    if (
        !containsLineBreak(
            value
        )
    ) {
        return value;
    }


    const matched =
        currentContent.slice(
            start,
            end
        );


    const useCrLf =
        matched.includes(
            "\r\n"
        ) ||
        (
            !matched.includes(
                "\n"
            ) &&
            currentContent.includes(
                "\r\n"
            )
        );


    const normalized =
        normalizeNewlines(
            value
        );


    return useCrLf
        ? normalized.replace(
            /\n/g,
            "\r\n"
        )
        : normalized;
}