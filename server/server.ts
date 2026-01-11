import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { logger } from "hono/logger";

const app = new Hono();

app.use(logger());
app.use((c, next) => {
    c.header("Content-Security-Policy", "default-src 'self' 'unsafe-eval' 'unsafe-inline' blob: data: romsound:");
    c.header("Service-Worker-Allowed", "/");
    return next();
});
app.get("/dist/*", serveStatic({ root: "./" }));
app.get("/streams/*", serveStatic({ root: "./" }));
app.get("/fonts/*", serveStatic({ root: "./" }));
app.get("/", serveStatic({ root: "./", path: "index.html" }));
serve(
    {
        fetch: app.fetch,
        hostname: process.env.HOST,
        port: process.env.PORT != null ? parseInt(process.env.PORT) : 24244,
    },
    (info) => {
        console.log(`Listening on http://${info.address}:${info.port}`);
    },
);
