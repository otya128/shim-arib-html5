import {
    APPLICATION_CONTROL_CODE_AUTOSTART,
    MMT_ASSET_TYPE_HEV1,
    MMT_ASSET_TYPE_MP4A,
} from "arib-mmt-tlv-ts/mmt-si.js";
import { MH_TRANSPORT_PROTOCOL_ID_MMT_NON_TIMED, MPUTimestamp } from "arib-mmt-tlv-ts/mmt-si-descriptor.js";
import { decodeMMTTLV } from "./decode_tlv";
import { ntp64TimestampToDate } from "arib-mmt-tlv-ts/ntp.js";
import { MMTTLVSeekLocator, SeekInformation } from "./mmttlv-seek-locator";

try {
    navigator.serviceWorker.register("/dist/sw.js", { scope: "/" });
} catch (e) {
    console.error("failed to register sw", e);
}

function wait(delay: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, delay));
}

const urlInput = document.querySelector("#url") as HTMLInputElement;
const fileInput = document.querySelector("#file") as HTMLInputElement;
const timeInput = document.querySelector("#time") as HTMLInputElement;
const unmuteButton = document.querySelector("#unmute") as HTMLButtonElement;
const muteButton = document.querySelector("#mute") as HTMLButtonElement;
const seekTimeButton = document.querySelector("#seektime") as HTMLButtonElement;
const seekInput = document.querySelector("#seek") as HTMLInputElement;
const playButton = document.querySelector("#play") as HTMLButtonElement;
const iframe = document.querySelector("iframe")!;

fileInput.addEventListener("change", () => {
    if (fileInput.files?.[0] != null) {
        urlInput.value = URL.createObjectURL(fileInput.files[0]);
    }
});

playButton.addEventListener("click", () => {
    if (urlInput.value) {
        playButton.disabled = true;
        main(urlInput.value);
    }
});

unmuteButton.addEventListener("click", () => {
    const video = iframe.contentDocument?.querySelector(
        `object[type="video/x-arib2-broadcast"]>video`,
    ) as HTMLVideoElement | null;
    if (video != null) {
        video.muted = false;
    }
});

muteButton.addEventListener("click", () => {
    const video = iframe.contentDocument?.querySelector(
        `object[type="video/x-arib2-broadcast"]>video`,
    ) as HTMLVideoElement | null;
    if (video != null) {
        video.muted = true;
    }
});

const files: Set<string> = new Set();
const index: Map<string, string> = new Map();
const cachedFiles = new Set<string>();

async function main(streamUrl: string) {
    const seekLocator = new MMTTLVSeekLocator(streamUrl, (d) => {
        seekInput.max = String(d);
        seekInput.step = "0.1";
    });
    const seekInfo = await seekLocator.seek_info;
    const swr = await navigator.serviceWorker.ready;
    if (swr.active == null) {
        return;
    }
    const sw = swr.active;
    const clientId = crypto.randomUUID();
    let abortController = new AbortController();
    seekInput.addEventListener("change", async () => {
        abortController.abort();
        abortController = new AbortController();
        const sp = await seekLocator.locateSeekPosition(Number(seekInput.value) * 1000, abortController.signal);
        iframe.src = "";
        await play(streamUrl, clientId, sw, abortController.signal, sp, seekInfo);
    });
    seekTimeButton.addEventListener("click", async () => {
        const parsed = timeInput.value.split(":").map((x) => parseFloat(x));
        let time = 0;
        switch (parsed.length) {
            case 1:
                time = parsed[0];
                break;
            case 2:
                time = parsed[0] * 60 + parsed[1];
                break;
            case 3:
                time = parsed[0] * 3600 + parsed[1] * 60 + parsed[2];
                break;
            default:
                return;
        }
        if (!Number.isFinite(time)) {
            return;
        }
        abortController.abort();
        abortController = new AbortController();
        const sp = await seekLocator.locateSeekPosition(time * 1000, abortController.signal);
        iframe.src = "";
        await play(streamUrl, clientId, sw, abortController.signal, sp, seekInfo);
    });
    await play(streamUrl, clientId, sw, abortController.signal, 0, seekInfo);
}

async function play(
    streamUrl: string,
    clientId: string,
    sw: ServiceWorker,
    signal: AbortSignal,
    pos: number,
    seekInfo?: SeekInformation,
) {
    const res = await fetch(streamUrl, {
        signal,
        headers: {
            Range: `bytes=${pos}-`,
        },
    });
    const reader = res.body?.getReader();
    if (reader == null) {
        return;
    }
    window.dataBroadcasting = {
        currentEvent: {
            original_network_id: 0,
            tlv_stream_id: 0,
            service_id: 9,
            event_id: null,
            start_time: null,
            duration: null,
            free_ca_mode: null,
            name: null,
            desc: null,
            f_event_id: null,
            f_start_time: null,
            f_duration: null,
            f_free_ca_mode: null,
            f_name: null,
            f_desc: null,
            // content_id,component_tag,channel_id,module_id,module_name,resource_name
        },
    };
    const dataBroadcasting = window.dataBroadcasting;
    dataBroadcasting.cachedFiles = cachedFiles;
    let entryPoint: string | undefined;
    let entryPointLoaded = false;
    const mmttlvReader = decodeMMTTLV({
        browserCallback(message) {
            switch (message.type) {
                case "currentAIT": {
                    const app = message.table.applications.find(
                        (x) => x.applicationControlCode === APPLICATION_CONTROL_CODE_AUTOSTART,
                    );
                    if (app == null) {
                        break;
                    }
                    let baseDirectoryPath: string | undefined;
                    let initialPath: string | undefined;
                    for (const desc of app.applicationDescriptors) {
                        if (desc.tag === "mhSimpleApplicationLocation") {
                            initialPath = new TextDecoder().decode(desc.initialPath);
                        } else if (desc.tag === "mhTransportProtocol") {
                            if (desc.protocolId === MH_TRANSPORT_PROTOCOL_ID_MMT_NON_TIMED) {
                                const sel = desc.urlSelectors?.[0];
                                if (sel?.urlBase != null) {
                                    baseDirectoryPath = new TextDecoder().decode(sel.urlBase);
                                }
                            }
                        }
                    }
                    if (baseDirectoryPath != null && initialPath != null) {
                        dataBroadcasting.application = app;
                        if (entryPoint == null) {
                            entryPoint =
                                "/" +
                                [...baseDirectoryPath.split("/"), ...initialPath.split("/")]
                                    .filter((x) => x.length > 0)
                                    .join("/");
                            if (cachedFiles.has(entryPoint)) {
                                entryPointLoaded = true;
                                iframe.src = `/d/${clientId}/` + entryPoint.replace(/^\/*/, "");
                            }
                        }
                    }
                    break;
                }
                case "emt":
                case "caption":
                    if (iframe.contentWindow != null) {
                        iframe.contentWindow.postMessage(message);
                    }
                    break;
                case "currentEvent":
                    dataBroadcasting.currentEvent = message.currentEventInformation;
                    break;
                case "applicationService":
                    dataBroadcasting.applicationService = message.applicationService;
                    break;
                case "ntp":
                    dataBroadcasting.now = message.time;
                    break;
                case "updateBIT":
                    dataBroadcasting.serviceIdToBroadcasterId = message.serviceIdToBroadcasterId;
                    break;
            }
        },
        callback(messages) {
            for (const message of messages) {
                switch (message.type) {
                    case "addFile":
                        files.add(message.file.id);
                        for (const [path, id] of index) {
                            if (id === message.file.id) {
                                cachedFiles.add(path);
                            }
                        }
                        break;
                    case "addIndex":
                        for (const i of message.index) {
                            index.set(i.path, i.id);
                            if (files.has(i.id)) {
                                cachedFiles.add(i.path);
                            }
                        }
                        break;
                }
            }
            sw.postMessage({ clientId, messages });
            if (!iframe.src && entryPoint != null && cachedFiles.has(entryPoint) && !entryPointLoaded) {
                const ep = entryPoint;
                entryPointLoaded = true;
                wait(1000).then(() => {
                    iframe.src = `/d/${clientId}/` + ep.replace(/^\/*/, "");
                });
            }
        },
    });
    {
        let mpt_packet_id: number | undefined;
        mmttlvReader.addEventListener("plt", (e) => {
            mpt_packet_id = e.table.packages[0].locationInfo.packetId;
        });
        let video_packet_id: number | undefined;
        let video_rap_mpu_sequence: number | undefined;
        let audio_packet_id: number | undefined;
        let audio_rap_mpu_sequence: number | undefined;
        const video_timestamps: Map<number, MPUTimestamp> = new Map();
        const audio_timestamps: Map<number, MPUTimestamp> = new Map();
        mmttlvReader.addEventListener("mpt", (e) => {
            if (e.packetId !== mpt_packet_id) {
                return;
            }
            for (const asset of e.table.assets) {
                const packet_id = asset.locations[0]?.packetId;
                if (video_packet_id == null && asset.assetType === MMT_ASSET_TYPE_HEV1) {
                    video_packet_id = packet_id;
                }
                if (audio_packet_id == null && asset.assetType === MMT_ASSET_TYPE_MP4A) {
                    audio_packet_id = packet_id;
                }
                if (packet_id === video_packet_id) {
                    for (const desc of asset.assetDescriptors) {
                        if (desc.tag === "mpuTimestamp") {
                            for (const ts of desc.timestamps) {
                                video_timestamps.set(ts.mpuSequenceNumber, ts);
                            }
                        }
                    }
                }
                if (packet_id === audio_packet_id) {
                    for (const desc of asset.assetDescriptors) {
                        if (desc.tag === "mpuTimestamp") {
                            for (const ts of desc.timestamps) {
                                audio_timestamps.set(ts.mpuSequenceNumber, ts);
                            }
                        }
                    }
                }
            }
        });
        mmttlvReader.addEventListener("mpu", (e) => {
            if (e.mmtHeader.packetId === video_packet_id) {
                if (!e.mmtHeader.rapFlag) {
                    return;
                }
                video_rap_mpu_sequence = e.mpu.mpuSequenceNumber;
                const t = video_timestamps.get(video_rap_mpu_sequence)?.mpuPresentationTime;
                if (t != null && seekInfo?.first_timestamp != null) {
                    seekInput.value = String(t.seconds + t.fractional * Math.pow(2, -32) - seekInfo.first_timestamp);
                }
            }
            if (e.mmtHeader.packetId === audio_packet_id) {
                if (!e.mmtHeader.rapFlag || audio_rap_mpu_sequence != null) {
                    return;
                }
                audio_rap_mpu_sequence = e.mpu.mpuSequenceNumber;
            }
        });
    }
    let beginTime: { offset: number; real: number; stream: Date } | undefined;
    let currentTime: { offset: number; real: number; stream: Date } | undefined;
    mmttlvReader.addEventListener("ntp", (event) => {
        currentTime = {
            offset: event.offset,
            real: performance.now(),
            stream: ntp64TimestampToDate(event.ntp.transmitTimestamp),
        };
        if (beginTime == null) {
            beginTime = currentTime;
        }
    });
    while (true) {
        const { value, done } = await reader.read();
        if (done) {
            break;
        }
        mmttlvReader.push(value);
        if (currentTime != null && beginTime != null) {
            const realElapsed = currentTime.real - beginTime.real;
            const streamElapsed = currentTime.stream.getTime() - beginTime.stream.getTime();
            if (streamElapsed - realElapsed > 30) {
                await wait(streamElapsed - realElapsed);
                currentTime = undefined;
            }
        }
        if (iframe.contentWindow != null) {
            iframe.contentWindow.postMessage({
                type: "mmttlv",
                value,
            });
        }
    }
}
