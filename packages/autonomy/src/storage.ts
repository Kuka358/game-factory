export function encodeStorageKey(
    value:
        string
): string {
    const normalized =
        value.trim();

    if (
        normalized.length === 0
    ) {
        throw new Error(
            "Storage key must not be empty"
        );
    }

    return encodeURIComponent(
        normalized
    ).replace(
        /[!'()*]/g,
        character =>
            `%${character
                .charCodeAt(0)
                .toString(16)
                .toUpperCase()}`
    );
}