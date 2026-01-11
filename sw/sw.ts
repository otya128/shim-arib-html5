import { ClientFile, IndexItem, Message } from "./message";

declare const self: ServiceWorkerGlobalScope;

const csp = "default-src 'self' 'unsafe-eval' 'unsafe-inline' blob: data: romsound:";

self.addEventListener("fetch", async (event) => {
    const url = new URL(event.request.url);
    const m = /\/d\/(?<clientId>[^/]+)(?<path>\/.*)/.exec(url.pathname);
    if (m == null) {
        return;
    }
    const clientId = m.groups?.["clientId"];
    const path = m.groups?.["path"];
    if (clientId == null || path == null) {
        return;
    }
    const client = clients.get(clientId);
    if (client == null) {
        return;
    }
    const index = client.index.get(path);
    if (index == null) {
        return;
    }
    const file = client.files.get(index.id);
    if (file == null) {
        return;
    }
    if (index.contentType.toLowerCase().split(";")[0] === "text/html") {
        let s = new ReadableStream<Uint8Array<ArrayBuffer>>({
            start(controller) {
                controller.enqueue(file.body);
                controller.close();
            },
        });
        if (index.contentEncoding === "deflate") {
            let ds = new DecompressionStream("deflate");
            s.pipeTo(ds.writable);
            s = ds.readable;
        }
        let tds = new TextDecoderStream();
        s.pipeTo(tds.writable);
        let chunks: string[] = [];
        let ts = new TransformStream<string, Uint8Array<ArrayBuffer>>({
            transform(chunk) {
                chunks.push(chunk);
            },
            flush(controller) {
                let html = chunks.join("");
                html = html.replace(/<head>/i, '<head><script src="/dist/shim.js"></script>');
                controller.enqueue(new TextEncoder().encode(html));
                controller.terminate();
            },
        });
        tds.readable.pipeTo(ts.writable);
        event.respondWith(
            new Response(ts.readable, {
                headers: new Headers([
                    ["Content-Type", index.contentType],
                    ["Content-Security-Policy", csp],
                ]),
            }),
        );
        return;
    }
    if (index.contentEncoding === "deflate") {
        const s = new ReadableStream<Uint8Array<ArrayBuffer>>({
            start(controller) {
                controller.enqueue(file.body);
                controller.close();
            },
        });
        const ds = new DecompressionStream("deflate");
        s.pipeTo(ds.writable);
        event.respondWith(
            new Response(ds.readable, {
                headers: new Headers([
                    ["Content-Type", index.contentType],
                    ["Content-Security-Policy", csp],
                ]),
            }),
        );
        return;
    }
    event.respondWith(
        new Response(file.body, {
            headers: new Headers([
                ["Content-Type", index.contentType],
                ["Content-Security-Policy", csp],
            ]),
        }),
    );
});

type Client = {
    files: Map<string, ClientFile>;
    index: Map<string, IndexItem>;
};

const clients = new Map<string, Client>();

self.addEventListener("message", (event) => {
    const { clientId, messages } = event.data as { clientId: string; messages: Message[] };
    let client = clients.get(clientId);
    if (client == null) {
        client = {
            files: new Map(),
            index: new Map(),
        };
        clients.set(clientId, client);
    }
    for (const message of messages) {
        switch (message.type) {
            case "addFile":
                console.log("file added", { clientId, id: message.file.id });
                client.files.set(message.file.id, message.file);
                break;
            case "addIndex":
                console.log("index added", { clientId, index: message.index });
                for (const i of message.index) {
                    client.index.set(i.path, i);
                }
                break;
        }
    }
});
