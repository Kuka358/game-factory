import {
    DatabaseSync
} from "node:sqlite";

import {
    access,
    readFile
} from "node:fs/promises";

import {
    resolve,
    sep
} from "node:path";

import {
    fileURLToPath,
    pathToFileURL
} from "node:url";

import type {
    AssetCandidate,
    AssetOrientation,
    AssetProvider,
    AssetRequirement
} from "@game-factory/assets";

import {
    createLocalSearchTags,
    getRoleSqlFilter,
    isLocalCandidateAllowed,
    scoreLocalCandidate
} from "./LocalCandidateScoring.js";


export interface LocalSpriteVaultClientOptions {
    databasePath:
        string;

    /**
     * Directory containing `sprite-library`.
     *
     * assets.local_path already begins with:
     * sprite-library\...
     */
    rootPath:
        string;

    candidateLimit?:
        number;
}

interface CandidateRow {
    file_id:
        number;

    asset_id:
        number;

    local_path:
        string;

    relative_path:
        string;

    width:
        number | null;

    height:
        number | null;

    orientation:
        string | null;

    is_probable_sprite_sheet:
        number | null;

    weighted_match:
        number;

    matched_tag_count:
        number;

    matched_tags:
        string | null;

    license_type:
        string | null;

    author:
        string | null;

    source_url:
        string | null;
}

interface AnimationTagRow {
    tag:
        string;
}

export class LocalSpriteVaultClient
    implements AssetProvider
{
    readonly source =
        "spritevault" as const;

    private readonly databasePath:
        string;

    private readonly rootPath:
        string;

    private readonly candidateLimit:
        number;

    constructor(
        options:
            LocalSpriteVaultClientOptions
    ) {
        this.databasePath =
            options.databasePath;

        this.rootPath =
            options.rootPath;

        this.candidateLimit =
            options.candidateLimit ??
            250;

    }

    async search(
        requirement:
            AssetRequirement
    ): Promise<AssetCandidate[]> {
        if (
            requirement.tags.length === 0
        ) {
            return [];
        }

        try {
            await access(
                this.databasePath
            );
        } catch {
            throw new Error(
                `SpriteVault database does not exist or is not accessible: ${this.databasePath}`
            );
        }

        const database =
            new DatabaseSync(
                this.databasePath,
                {
                    readOnly:
                        true
                }
            );

        try {
            const rows =
                this.searchRows(
                    database,
                    requirement
                );

            const allTags =
                this.loadFileTags(
                    database,
                    rows.map(
                        (row) =>
                            row.file_id
                    )
                );

            return rows
                .filter(
                    (row) => {
                        const fileTags =
                            allTags.get(
                                row.file_id
                            ) ?? [];

                        return isLocalCandidateAllowed(
                            requirement,
                            fileTags,
                            row.relative_path
                        );
                    }
                )
                .map(
                    (row) => {
                        const fileTags =
                            allTags.get(
                                row.file_id
                            ) ?? [];

                        return this.mapCandidate(
                            database,
                            requirement,
                            row,
                            fileTags
                        );
                    }
                );
        } finally {
            database.close();
        }
    }

    async download(
        candidate:
            AssetCandidate
    ): Promise<Uint8Array> {
        if (!candidate.sourceUrl) {
            throw new Error(
                `Local SpriteVault candidate "${candidate.id}" has no file URL`
            );
        }

        const url =
            new URL(
                candidate.sourceUrl
            );

        if (
            url.protocol !==
            "file:"
        ) {
            throw new Error(
                `Local SpriteVault candidate "${candidate.id}" does not reference a local file`
            );
        }

        const filePath =
            fileURLToPath(
                url
            );

        const buffer =
            await readFile(
                filePath
            );

        return new Uint8Array(
            buffer
        );
    }

    private searchRows(
        database:
            DatabaseSync,

        requirement:
            AssetRequirement
    ): CandidateRow[] {
        const searchTags =
            createLocalSearchTags(
                requirement
            );

        if (
            searchTags.length === 0
        ) {
            return [];
        }

        const queryTagValues =
            searchTags
                .map(
                    () =>
                        "(?, ?)"
                )
                .join(", ");

        const roleFilter =
            getRoleSqlFilter(
                requirement.role
            );

        const sql = `
            WITH query_tags(
                tag,
                importance
            ) AS (
                VALUES
                    ${queryTagValues}
            ),

            raw_hits AS (
                SELECT
                    gt.file_id
                        AS file_id,

                    LOWER(gt.tag)
                        AS tag,

                    q.importance *
                    CASE gt.tag_type
                        WHEN 'visual'
                            THEN 1.15

                        WHEN 'source'
                            THEN 1.00

                        WHEN 'keyword'
                            THEN 0.80

                        WHEN 'technical'
                            THEN 0.30

                        ELSE 0.60
                    END *
                    COALESCE(
                        gt.confidence,
                        0.75
                    ) AS weight

                FROM generated_tags gt

                JOIN query_tags q
                    ON LOWER(gt.tag) =
                    q.tag

                WHERE
                    gt.file_id
                        IS NOT NULL


                UNION ALL


                SELECT
                    f2.id
                        AS file_id,

                    LOWER(gt.tag)
                        AS tag,

                    q.importance *
                    0.25 *
                    COALESCE(
                        gt.confidence,
                        0.75
                    ) AS weight

                FROM generated_tags gt

                JOIN query_tags q
                    ON LOWER(gt.tag) =
                    q.tag

                JOIN files f2
                    ON f2.asset_id =
                    gt.asset_id

                WHERE
                    gt.file_id
                        IS NULL


                UNION ALL


                SELECT
                    f3.id
                        AS file_id,

                    LOWER(st.tag)
                        AS tag,

                    q.importance *
                    0.15
                        AS weight

                FROM source_tags st

                JOIN query_tags q
                    ON LOWER(st.tag) =
                    q.tag

                JOIN files f3
                    ON f3.asset_id =
                    st.asset_id
            ),

            best_tag_hits AS (
                SELECT
                    file_id,
                    tag,

                    MAX(weight)
                        AS weight

                FROM raw_hits

                GROUP BY
                    file_id,
                    tag
            ),

            scores AS (
                SELECT
                    file_id,

                    SUM(weight)
                        AS weighted_match,

                    COUNT(*)
                        AS matched_tag_count,

                    GROUP_CONCAT(
                        tag
                    ) AS matched_tags

                FROM best_tag_hits

                GROUP BY
                    file_id
            )

            SELECT
                f.id
                    AS file_id,

                f.asset_id
                    AS asset_id,

                a.local_path
                    AS local_path,

                f.relative_path
                    AS relative_path,

                f.width
                    AS width,

                f.height
                    AS height,

                f.orientation
                    AS orientation,

                f.is_probable_sprite_sheet
                    AS is_probable_sprite_sheet,

                scores.weighted_match
                    AS weighted_match,

                scores.matched_tag_count
                    AS matched_tag_count,

                scores.matched_tags
                    AS matched_tags,

                a.license_type
                    AS license_type,

                a.author
                    AS author,

                a.source_url
                    AS source_url

            FROM scores

            JOIN files f
                ON f.id =
                scores.file_id

            JOIN assets a
                ON a.id =
                f.asset_id

            WHERE
                a.local_path
                    IS NOT NULL

                AND f.analysis_status =
                    'completed'

                AND LOWER(
                    f.extension
                ) IN (
                    '.png',
                    '.jpg',
                    '.jpeg',
                    '.webp'
                )

                ${roleFilter}

            ORDER BY
                scores.weighted_match
                    DESC,

                f.id
                    ASC

            LIMIT ?
        `;

        const parameters: Array<
            string | number
        > = [];

        for (
            const searchTag of
            searchTags
        ) {
            parameters.push(
                searchTag.tag,
                searchTag.importance
            );
        }

        parameters.push(
            this.candidateLimit
        );

        return database
            .prepare(sql)
            .all(
                ...parameters
            ) as unknown as
                CandidateRow[];
    }

    private mapCandidate(
        database:
            DatabaseSync,

        requirement:
            AssetRequirement,

        row:
            CandidateRow,

        fileTags:
            readonly string[]
    ): AssetCandidate {
        const matchedTags =
            parseMatchedTags(
                row.matched_tags
            );

        const absolutePath =
            resolveSpriteVaultPath(
                this.rootPath,
                row.local_path,
                row.relative_path
            );

        const dimensions =
            row.width !== null &&
            row.height !== null
                ? {
                    width:
                        row.width,

                    height:
                        row.height
                }
                : undefined;

        const animations =
            this.findAnimations(
                database,
                requirement,
                row
            );

        const providerScore =
            scoreLocalCandidate(
                requirement,
                {
                    weightedMatch:
                        row.weighted_match,

                    relativePath:
                        row.relative_path,

                    width:
                        row.width,

                    height:
                        row.height,

                    isProbableSpriteSheet:
                        row.is_probable_sprite_sheet ===
                        null
                            ? null
                            : row.is_probable_sprite_sheet ===
                            1
                }
            );

        return {
            id:
                `asset:${row.asset_id}:file:${row.file_id}`,

            score:
                providerScore,

            tags:
                [...fileTags],

            dimensions,

            animations,

            orientation:
                parseDatabaseOrientation(
                    row.orientation
                ),

            sourceUrl:
                pathToFileURL(
                    absolutePath
                ).href,

            license: {
                type:
                    row.license_type ??
                    "unknown",

                author:
                    row.author ??
                    undefined,

                sourceUrl:
                    row.source_url ??
                    undefined
            }
        };
    }

    private findAnimations(
        database:
            DatabaseSync,

        requirement:
            AssetRequirement,

        row:
            CandidateRow
    ):
        | Array<{
            name: string;
        }>
        | undefined
    {
        const required =
            requirement.requirements
                .animations;

        if (
            !required ||
            required.length === 0
        ) {
            return undefined;
        }

        const normalized =
            normalizeTags(
                required
            );

        const placeholders =
            normalized.map(
                () => "?"
            ).join(", ");

        const sql = `
            SELECT DISTINCT
                tag
            FROM generated_tags
            WHERE
                file_id = ?
                AND tag IN (
                    ${placeholders}
                )
        `;

        const result =
            database
                .prepare(sql)
                .all(
                    row.file_id,
                    ...normalized
                ) as unknown as
                AnimationTagRow[];

        const found =
            new Set(
                result.map(
                    (item) =>
                        item.tag
                )
            );

        /*
         * Fallback to filename/path.
         *
         * SpriteVault already has files such as:
         * IDLE.png
         * RUN.png
         * JUMP.png
         */
        const pathText =
            row.relative_path
                .toLowerCase();

        for (
            const animation of
            normalized
        ) {
            if (
                pathText.includes(
                    animation
                )
            ) {
                found.add(
                    animation
                );
            }
        }

        return normalized
            .filter(
                (animation) =>
                    found.has(
                        animation
                    )
            )
            .map(
                (name) => ({
                    name
                })
            );
    }

    private loadFileTags(
        database:
            DatabaseSync,

        fileIds:
            readonly number[]
    ): Map<number, string[]> {
        const result =
            new Map<
                number,
                string[]
            >();

        if (
            fileIds.length === 0
        ) {
            return result;
        }

        const placeholders =
            fileIds
                .map(
                    () => "?"
                )
                .join(", ");

        const sql = `
            SELECT
                file_id,
                LOWER(tag) AS tag

            FROM generated_tags

            WHERE
                file_id IN (
                    ${placeholders}
                )

                AND tag_type IN (
                    'source',
                    'keyword',
                    'visual'
                )

            ORDER BY
                file_id,
                tag
        `;

        const rows =
            database
                .prepare(sql)
                .all(
                    ...fileIds
                ) as unknown as
                Array<{
                    file_id: number;
                    tag: string;
                }>;

        for (
            const row of
            rows
        ) {
            const tags =
                result.get(
                    row.file_id
                ) ?? [];

            if (
                !tags.includes(
                    row.tag
                )
            ) {
                tags.push(
                    row.tag
                );
            }

            result.set(
                row.file_id,
                tags
            );
        }

        return result;
    }
}

function normalizeTags(
    values:
        readonly string[]
): string[] {
    return [
        ...new Set(
            values
                .map(
                    (value) =>
                        value
                            .trim()
                            .toLowerCase()
                )
                .filter(Boolean)
        )
    ];
}

function parseMatchedTags(
    value:
        string | null
): string[] {
    if (!value) {
        return [];
    }

    return value
        .split(",")
        .map(
            (tag) =>
                tag.trim()
        )
        .filter(Boolean)
        .sort();
}

function parseDatabaseOrientation(
    value:
        string | null
):
    | AssetOrientation
    | undefined
{
    switch (value) {
        case "square":
        case "landscape":
        case "portrait":
            return value;

        default:
            return undefined;
    }
}

function resolveSpriteVaultPath(
    rootPath:
        string,

    localPath:
        string,

    relativePath:
        string
): string {
    return resolve(
        rootPath,
        normalizeStoredPath(
            localPath
        ),
        normalizeStoredPath(
            relativePath
        )
    );
}

function normalizeStoredPath(
    value:
        string
): string {
    return value
        .split(/[\\/]+/)
        .join(sep);
}