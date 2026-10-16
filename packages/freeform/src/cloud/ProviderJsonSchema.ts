
const OMITTED_KEYWORDS = new Set([
    "minLength",
    "maxLength",
    "pattern",
    "minimum",
    "maximum",
    "minItems",
    "maxItems",
    "uniqueItems"
]);

export function toProviderJsonSchema(
    schema: Record<string, unknown>
): Record<string, unknown> {
    return transform(schema) as Record<string, unknown>;
}

function transform(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map(transform);
    }

    if (value === null || typeof value !== "object") {
        return value;
    }

    const result: Record<string, unknown> = {};

    for (const [key, item] of Object.entries(value)) {
        if (OMITTED_KEYWORDS.has(key)) {
            continue;
        }

        if (key === "const") {
            result.enum = [item];
            continue;
        }

        result[key] = transform(item);
    }

    return result;
}
