import type {
    IterationScope
} from "./contracts.js";

import type {
    WorkspaceManager
} from "./providers.js";


export interface WorkspaceGuardOptions {
    allowedCommands?:
        readonly string[];
}


export class WorkspaceGuard
    implements WorkspaceManager
{
    private readonly allowedCommands:
        readonly string[];


    constructor(
        options:
            WorkspaceGuardOptions = {}
    ) {
        this.allowedCommands =
            options.allowedCommands ?? [];
    }


    assertPathAllowed(
        path:
            string,

        scope:
            IterationScope
    ): void {
        const normalizedPath =
            normalizeRepositoryPath(
                path
            );

        const forbidden =
            scope.forbiddenPaths.some(
                pattern =>
                    matchesPathPattern(
                        normalizedPath,
                        pattern
                    )
            );

        if (forbidden) {
            throw new Error(
                `Workspace path is forbidden: ${normalizedPath}`
            );
        }

        const allowed =
            scope.allowedPaths.some(
                pattern =>
                    matchesPathPattern(
                        normalizedPath,
                        pattern
                    )
            );

        if (!allowed) {
            throw new Error(
                `Workspace path is outside iteration scope: ${normalizedPath}`
            );
        }
    }


    assertCommandAllowed(
        command:
            string
    ): void {
        const normalized =
            command.trim();

        if (normalized.length === 0) {
            throw new Error(
                "Workspace command must not be empty"
            );
        }

        const allowed =
            this.allowedCommands.some(
                candidate =>
                    normalized ===
                    candidate.trim()
            );

        if (!allowed) {
            throw new Error(
                `Workspace command is not allowed: ${normalized}`
            );
        }
    }
}


export function normalizeRepositoryPath(
    value:
        string
): string {
    const normalized =
        value
            .trim()
            .replaceAll(
                "\\",
                "/"
            )
            .replace(
                /^\.\/+/,
                ""
            );

    if (
        normalized.length === 0
    ) {
        throw new Error(
            "Workspace path must not be empty"
        );
    }

    if (
        normalized.startsWith(
            "/"
        ) ||
        /^[A-Za-z]:\//.test(
            normalized
        )
    ) {
        throw new Error(
            `Workspace path must be repository-relative: ${value}`
        );
    }

    const segments =
        normalized.split(
            "/"
        );

    if (
        segments.some(
            segment =>
                segment === ".."
        )
    ) {
        throw new Error(
            `Workspace path traversal is not allowed: ${value}`
        );
    }

    return segments
        .filter(
            segment =>
                segment.length > 0 &&
                segment !== "."
        )
        .join(
            "/"
        );
}


function matchesPathPattern(
    path:
        string,

    pattern:
        string
): boolean {
    const normalizedPattern =
        normalizeRepositoryPath(
            pattern.replace(
                /\/\*\*$/,
                ""
            )
        );

    if (
        pattern
            .replaceAll("\\", "/")
            .endsWith("/**")
    ) {
        return (
            path ===
                normalizedPattern ||
            path.startsWith(
                `${normalizedPattern}/`
            )
        );
    }

    return path ===
        normalizedPattern;
}