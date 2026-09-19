import {
    lstat,
    readFile
} from "node:fs/promises";

import {
    posix,
    resolve
} from "node:path";

import ts from "typescript";

import {
    normalizeRepositoryPath
} from "./workspace.js";


export type RepositoryRelationReason =
    | "direct_import"
    | "reverse_import"
    | "package_manifest"
    | "package_entrypoint"
    | "workspace_dependency_manifest"
    | "direct_workspace_import"
    | "direct_workspace_entrypoint";


export interface RepositoryRelatedPath {
    path:
        string;

    score:
        number;

    reasons:
        readonly RepositoryRelationReason[];
}


export interface RepositoryIntelligenceInput {
    repositoryRoot:
        string;

    eligiblePaths:
        readonly string[];

    seedPaths:
        readonly string[];
}


export interface RepositoryIntelligence {
    analyze(
        input:
            RepositoryIntelligenceInput
    ): Promise<readonly RepositoryRelatedPath[]>;
}


export interface TypeScriptRepositoryIntelligenceOptions {
    maxScanFiles?:
        number;

    maxSourceFileBytes?:
        number;
}

interface RepositoryPackageInfo {
    manifestPath:
        string;

    root:
        string;

    name?:
        string;

    dependencyNames:
        readonly string[];
}


export class TypeScriptRepositoryIntelligence
    implements RepositoryIntelligence
{
    private readonly maxScanFiles:
        number;

    private readonly maxSourceFileBytes:
        number;


    constructor(
        options:
            TypeScriptRepositoryIntelligenceOptions = {}
    ) {
        this.maxScanFiles =
            positiveInteger(
                options.maxScanFiles ??
                1_000,

                "maxScanFiles"
            );

        this.maxSourceFileBytes =
            positiveInteger(
                options.maxSourceFileBytes ??
                128_000,

                "maxSourceFileBytes"
            );
    }


    async analyze(
        input:
            RepositoryIntelligenceInput
    ): Promise<readonly RepositoryRelatedPath[]> {
        const repositoryRoot =
            resolve(
                input.repositoryRoot
            );

        const eligible =
            new Set(
                input.eligiblePaths.map(
                    path =>
                        normalizeRepositoryPath(
                            path
                        )
                )
            );


        const sourcePaths =
            [...eligible]
                .filter(
                    isSourceFile
                )
                .sort(
                    comparePaths
                )
                .slice(
                    0,
                    this.maxScanFiles
                );


        const imports =
            new Map<
                string,
                Set<string>
            >();

        const importedBy =
            new Map<
                string,
                Set<string>
            >();

        const workspaceImportNames =
            new Map<
                string,
                Set<string>
            >();

        for (
            const sourcePath of
            sourcePaths
        ) {
            const source =
                await readSafeSource(
                    repositoryRoot,
                    sourcePath,
                    this.maxSourceFileBytes
                );

            if (source === null) {
                continue;
            }


            const preprocessing =
                ts.preProcessFile(
                    source,
                    true,
                    true
                );


            for (
                const importedFile of
                preprocessing.importedFiles
            ) {
                const target =
                    resolveImportTarget(
                        sourcePath,
                        importedFile.fileName,
                        eligible
                    );

                if (!target) {
                    const packageName =
                        getPackageName(
                            importedFile.fileName
                        );

                    if (packageName) {
                        addRelation(
                            workspaceImportNames,
                            sourcePath,
                            packageName
                        );
                    }

                    continue;
                }


                addRelation(
                    imports,
                    sourcePath,
                    target
                );

                addRelation(
                    importedBy,
                    target,
                    sourcePath
                );
            }
        }


        const related =
            new Map<
                string,
                {
                    score:
                        number;

                    reasons:
                        Set<RepositoryRelationReason>;
                }
            >();


        for (
            const rawSeed of
            input.seedPaths
        ) {
            const seed =
                normalizeRepositoryPath(
                    rawSeed
                );


            for (
                const dependency of
                imports.get(
                    seed
                ) ??
                []
            ) {
                addScore(
                    related,
                    dependency,
                    3_000,
                    "direct_import"
                );
            }


            for (
                const importer of
                importedBy.get(
                    seed
                ) ??
                []
            ) {
                addScore(
                    related,
                    importer,
                    2_500,
                    "reverse_import"
                );
            }
        }

        const packages =
            await collectRepositoryPackages(
                repositoryRoot,
                eligible,
                this.maxSourceFileBytes
            );


        const packagesByName =
            new Map(
                packages
                    .filter(
                        item =>
                            item.name !==
                            undefined
                    )
                    .map(
                        item => [
                            item.name!,
                            item
                        ] as const
                    )
            );

        for (
            const rawSeed of
            input.seedPaths
        ) {
            const seed =
                normalizeRepositoryPath(
                    rawSeed
                );


            const directlyImportedNames =
                workspaceImportNames.get(
                    seed
                ) ??
                new Set<string>();


            for (
                const packageName of
                directlyImportedNames
            ) {
                const dependency =
                    packagesByName.get(
                        packageName
                    );

                if (!dependency) {
                    continue;
                }


                if (
                    eligible.has(
                        dependency.manifestPath
                    )
                ) {
                    addScore(
                        related,
                        dependency.manifestPath,
                        2_700,
                        "direct_workspace_import"
                    );
                }


                const entrypoint =
                    findPackageEntrypoint(
                        dependency,
                        eligible
                    );

                if (entrypoint) {
                    addScore(
                        related,
                        entrypoint,
                        2_300,
                        "direct_workspace_entrypoint"
                    );
                }
            }
        }


        for (
            const rawSeed of
            input.seedPaths
        ) {
            const seed =
                normalizeRepositoryPath(
                    rawSeed
                );

            const owner =
                findOwningPackage(
                    seed,
                    packages
                );

            if (!owner) {
                continue;
            }


            if (
                eligible.has(
                    owner.manifestPath
                )
            ) {
                addScore(
                    related,
                    owner.manifestPath,
                    2_200,
                    "package_manifest"
                );
            }


            const entrypoint =
                findPackageEntrypoint(
                    owner,
                    eligible
                );

            if (entrypoint) {
                addScore(
                    related,
                    entrypoint,
                    1_800,
                    "package_entrypoint"
                );
            }

            const directlyImportedNames =
                workspaceImportNames.get(
                    seed
                ) ??
                new Set<string>();


            for (
                const dependencyName of
                owner.dependencyNames
            ) {
                if (
                    directlyImportedNames.has(
                        dependencyName
                    )
                ) {
                    continue;
                }

                const dependency =
                    packagesByName.get(
                        dependencyName
                    );

                if (
                    !dependency ||
                    dependency.manifestPath ===
                        owner.manifestPath ||
                    !eligible.has(
                        dependency.manifestPath
                    )
                ) {
                    continue;
                }


                addScore(
                    related,
                    dependency.manifestPath,
                    1_200,
                    "workspace_dependency_manifest"
                );
            }
        }


        return [...related]
            .map(
                (
                    [
                        path,
                        value
                    ]
                ) => ({
                    path,

                    score:
                        value.score,

                    reasons:
                        [...value.reasons]
                            .sort()
                })
            )
            .sort(
                (
                    first,
                    second
                ) => {
                    if (
                        first.score !==
                        second.score
                    ) {
                        return (
                            second.score -
                            first.score
                        );
                    }

                    return comparePaths(
                        first.path,
                        second.path
                    );
                }
            );
    }
}

function getPackageName(
    specifier:
        string
): string | undefined {
    if (
        specifier.startsWith(
            "./"
        ) ||
        specifier.startsWith(
            "../"
        )
    ) {
        return undefined;
    }


    const segments =
        specifier.split(
            "/"
        );


    if (
        specifier.startsWith(
            "@"
        )
    ) {
        if (
            segments.length <
            2
        ) {
            return undefined;
        }

        return (
            `${segments[0]}/${segments[1]}`
        );
    }


    return segments[0];
}

function resolveImportTarget(
    sourcePath:
        string,

    specifier:
        string,

    eligible:
        ReadonlySet<string>
): string | undefined {
    if (
        !specifier.startsWith(
            "./"
        ) &&
        !specifier.startsWith(
            "../"
        )
    ) {
        /*
         * Package imports are deliberately ignored in this first
         * intelligence layer.
         *
         * Package-boundary intelligence comes later.
         */
        return undefined;
    }


    const sourceDirectory =
        posix.dirname(
            sourcePath
        );

    let base:
        string;

    try {
        base =
            normalizeRepositoryPath(
                posix.normalize(
                    posix.join(
                        sourceDirectory,
                        specifier
                    )
                )
            );
    } catch {
        return undefined;
    }


    for (
        const candidate of
        moduleCandidates(
            base
        )
    ) {
        if (
            eligible.has(
                candidate
            )
        ) {
            return candidate;
        }
    }

    return undefined;
}


function moduleCandidates(
    base:
        string
): readonly string[] {
    const extension =
        posix.extname(
            base
        ).toLowerCase();

    const candidates:
        string[] = [];


    const push =
        (
            value:
                string
        ) => {
            if (
                !candidates.includes(
                    value
                )
            ) {
                candidates.push(
                    value
                );
            }
        };


    if (
        extension ===
        ".js"
    ) {
        const stem =
            base.slice(
                0,
                -3
            );

        push(
            `${stem}.ts`
        );

        push(
            `${stem}.tsx`
        );

        push(
            `${stem}.js`
        );
    } else if (
        extension ===
        ".jsx"
    ) {
        const stem =
            base.slice(
                0,
                -4
            );

        push(
            `${stem}.tsx`
        );

        push(
            `${stem}.jsx`
        );
    } else if (
        extension ===
        ".mjs"
    ) {
        const stem =
            base.slice(
                0,
                -4
            );

        push(
            `${stem}.mts`
        );

        push(
            `${stem}.mjs`
        );
    } else if (
        extension ===
        ".cjs"
    ) {
        const stem =
            base.slice(
                0,
                -4
            );

        push(
            `${stem}.cts`
        );

        push(
            `${stem}.cjs`
        );
    } else if (
        extension.length >
        0
    ) {
        push(
            base
        );
    } else {
        push(
            base
        );

        for (
            const sourceExtension of
            SOURCE_EXTENSIONS
        ) {
            push(
                `${base}${sourceExtension}`
            );
        }

        for (
            const sourceExtension of
            SOURCE_EXTENSIONS
        ) {
            push(
                `${base}/index${sourceExtension}`
            );
        }
    }


    return candidates;
}


async function readSafeSource(
    repositoryRoot:
        string,

    repositoryPath:
        string,

    maxBytes:
        number
): Promise<string | null> {
    const segments =
        normalizeRepositoryPath(
            repositoryPath
        ).split(
            "/"
        );

    let current =
        repositoryRoot;


    for (
        const segment of
        segments
    ) {
        current =
            resolve(
                current,
                segment
            );

        assertInsideRepository(
            repositoryRoot,
            current
        );


        try {
            const stat =
                await lstat(
                    current
                );

            /*
             * Never follow repository symlinks while building model
             * context relationships.
             */
            if (
                stat.isSymbolicLink()
            ) {
                return null;
            }
        } catch (
            error
        ) {
            if (
                isMissingFileError(
                    error
                )
            ) {
                return null;
            }

            throw error;
        }
    }


    const buffer =
        await readFile(
            current
        );


    if (
        buffer.byteLength >
        maxBytes
    ) {
        return null;
    }


    if (
        buffer.includes(
            0
        )
    ) {
        return null;
    }


    return buffer.toString(
        "utf8"
    );
}


function addRelation(
    graph:
        Map<
            string,
            Set<string>
        >,

    source:
        string,

    target:
        string
): void {
    let targets =
        graph.get(
            source
        );

    if (!targets) {
        targets =
            new Set<string>();

        graph.set(
            source,
            targets
        );
    }

    targets.add(
        target
    );
}


function addScore(
    result:
        Map<
            string,
            {
                score:
                    number;

                reasons:
                    Set<RepositoryRelationReason>;
            }
        >,

    path:
        string,

    score:
        number,

    reason:
        RepositoryRelationReason
): void {
    const existing =
        result.get(
            path
        );

    if (existing) {
        existing.score +=
            score;

        existing.reasons.add(
            reason
        );

        return;
    }


    result.set(
        path,
        {
            score,

            reasons:
                new Set([
                    reason
                ])
        }
    );
}

async function collectRepositoryPackages(
    repositoryRoot:
        string,

    eligible:
        ReadonlySet<string>,

    maxBytes:
        number
): Promise<RepositoryPackageInfo[]> {
    const result:
        RepositoryPackageInfo[] = [];


    const manifests =
        [...eligible]
            .filter(
                path =>
                    posix.basename(
                        path
                    ) ===
                    "package.json"
            )
            .sort(
                comparePaths
            );


    for (
        const manifestPath of
        manifests
    ) {
        const source =
            await readSafeSource(
                repositoryRoot,
                manifestPath,
                maxBytes
            );

        if (source === null) {
            continue;
        }


        let value:
            unknown;

        try {
            value =
                JSON.parse(
                    source
                );
        } catch {
            /*
             * Invalid package metadata should not break context
             * discovery for the entire repository.
             */
            continue;
        }


        if (
            !isRecord(
                value
            )
        ) {
            continue;
        }


        const dependencyNames =
            new Set<string>();


        for (
            const field of
            [
                "dependencies",
                "devDependencies",
                "peerDependencies",
                "optionalDependencies"
            ] as const
        ) {
            const dependencies =
                value[field];

            if (
                !isRecord(
                    dependencies
                )
            ) {
                continue;
            }


            for (
                const name of
                Object.keys(
                    dependencies
                )
            ) {
                dependencyNames.add(
                    name
                );
            }
        }


        result.push({
            manifestPath,

            root:
                posix.dirname(
                    manifestPath
                ),

            name:
                typeof value.name ===
                    "string"
                    ? value.name
                    : undefined,

            dependencyNames:
                [...dependencyNames]
                    .sort(
                        (
                            first,
                            second
                        ) =>
                            first.localeCompare(
                                second,
                                "en"
                            )
                    )
        });
    }


    return result;
}


function findOwningPackage(
    repositoryPath:
        string,

    packages:
        readonly RepositoryPackageInfo[]
): RepositoryPackageInfo | undefined {
    const candidates =
        packages
            .filter(
                item =>
                    pathBelongsToPackage(
                        repositoryPath,
                        item.root
                    )
            )
            .sort(
                (
                    first,
                    second
                ) =>
                    second.root.length -
                    first.root.length
            );

    return candidates[0];
}


function pathBelongsToPackage(
    repositoryPath:
        string,

    packageRoot:
        string
): boolean {
    if (
        packageRoot ===
        "."
    ) {
        return true;
    }

    return (
        repositoryPath ===
            packageRoot ||
        repositoryPath.startsWith(
            `${packageRoot}/`
        )
    );
}


function findPackageEntrypoint(
    packageInfo:
        RepositoryPackageInfo,

    eligible:
        ReadonlySet<string>
): string | undefined {
    const prefix =
        packageInfo.root ===
            "."
            ? ""
            : `${packageInfo.root}/`;


    const candidates = [
        `${prefix}src/index.ts`,
        `${prefix}src/index.tsx`,
        `${prefix}src/index.mts`,
        `${prefix}src/index.cts`,
        `${prefix}index.ts`,
        `${prefix}index.tsx`
    ];


    return candidates.find(
        candidate =>
            eligible.has(
                candidate
            )
    );
}


function isRecord(
    value:
        unknown
): value is Record<string, unknown> {
    return (
        typeof value ===
            "object" &&
        value !==
            null &&
        !Array.isArray(
            value
        )
    );
}


function isSourceFile(
    path:
        string
): boolean {
    const extension =
        posix.extname(
            path
        ).toLowerCase();

    return SOURCE_EXTENSIONS.some(
        candidate =>
            candidate ===
            extension
    );
}


function assertInsideRepository(
    repositoryRoot:
        string,

    target:
        string
): void {
    const root =
        resolve(
            repositoryRoot
        );

    const absolute =
        resolve(
            target
        );

    if (
        absolute !==
            root &&
        !absolute.startsWith(
            `${root}${process.platform === "win32" ? "\\" : "/"}`
        )
    ) {
        throw new Error(
            `Repository intelligence path escapes repository: ${target}`
        );
    }
}


function isMissingFileError(
    value:
        unknown
): value is NodeJS.ErrnoException {
    return (
        value instanceof
            Error &&
        "code" in
            value &&
        (
            value as
                NodeJS.ErrnoException
        ).code ===
            "ENOENT"
    );
}


function positiveInteger(
    value:
        number,

    name:
        string
): number {
    if (
        !Number.isInteger(
            value
        ) ||
        value <=
            0
    ) {
        throw new Error(
            `${name} must be a positive integer`
        );
    }

    return value;
}


function comparePaths(
    first:
        string,

    second:
        string
): number {
    return first.localeCompare(
        second,
        "en"
    );
}


const SOURCE_EXTENSIONS = [
    ".ts",
    ".tsx",
    ".mts",
    ".cts",
    ".js",
    ".jsx",
    ".mjs",
    ".cjs"
] as const;