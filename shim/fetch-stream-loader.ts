import mpegts from "mpegts.js";

class FetchStreamLoader extends mpegts.BaseLoader {
    TAG: string;
    constructor() {
        super("fetch-stream-loader");
        this.TAG = "FetchStreamLoader";

        this._needStash = true;
    }

    destroy() {
        this.abort();
        super.destroy();
    }

    _receivedLength: number = 0;
    cb = (e: MessageEvent<any>) => {
        if (e.data.type === "mmttlv") {
            const chunk: Uint8Array<ArrayBuffer> = e.data.value;
            this.onDataArrival?.(chunk.buffer, this._receivedLength, this._receivedLength + chunk.length);
            this._receivedLength += chunk.length;
        }
    };
    open(_dataSource: mpegts.MediaSegment, _range: mpegts.Range) {
        window.addEventListener("message", this.cb);
    }

    abort() {
        window.removeEventListener("message", this.cb);
    }
}

export default FetchStreamLoader;
