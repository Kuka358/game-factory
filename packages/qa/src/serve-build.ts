import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";

const buildDir =
    process.env.GAME_FACTORY_BUILD_DIR;

if (!buildDir) {
    throw new Error(
        "GAME_FACTORY_BUILD_DIR is not set"
    );
}

const root = path.resolve(buildDir);
const indexFile = path.join(root, "index.html");

await fs.access(indexFile);

console.log(
    `Serving Game Factory build: ${root}`
);

const contentTypes:
    Record<string, string> = {
        ".html": "text/html; charset=utf-8",
        ".js": "text/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".json": "application/json; charset=utf-8",
        ".png": "image/png",
        ".webp": "image/webp",
        ".svg": "image/svg+xml",
        ".map": "application/json"
    };

const server = http.createServer(
    async (request, response) => {
        try {
            const url = new URL(
                request.url ?? "/",
                "http://localhost"
            );

            if (url.pathname === "/__health") {
                response.statusCode = 200;
                response.setHeader(
                    "Content-Type",
                    "text/plain; charset=utf-8"
                );
                response.end("ok");
                return;
            }

            const pathname =
                url.pathname === "/"
                    ? "/index.html"
                    : url.pathname;

            const relativePath =
                decodeURIComponent(pathname)
                    .replace(/^\/+/, "");

            const filePath =
                path.resolve(
                    root,
                    relativePath
                );

            const relative =
                path.relative(
                    root,
                    filePath
                );

            if (
                relative.startsWith("..") ||
                path.isAbsolute(relative)
            ) {
                response.statusCode = 403;
                response.end("Forbidden");
                return;
            }

            const data =
                await fs.readFile(filePath);

            response.statusCode = 200;

            response.setHeader(
                "Content-Type",
                contentTypes[
                    path.extname(filePath)
                ] ??
                    "application/octet-stream"
            );

            response.end(data);
        } catch {
            response.statusCode = 404;
            response.end("Not found");
        }
    }
);

const port = 4173;

server.on("error", (error) => {
    console.error(
        "QA HTTP server failed:",
        error
    );

    process.exit(1);
});

server.listen(
    port,
    "127.0.0.1",
    () => {
        console.log(
            `Game Factory QA server listening on http://127.0.0.1:${port}`
        );
    }
);