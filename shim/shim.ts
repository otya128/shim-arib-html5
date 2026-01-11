import mpegts from "mpegts.js";
import FetchStreamLoader from "./fetch-stream-loader";
import type { EventMessageTable, MHApplication, MHApplicationInformationTable } from "arib-mmt-tlv-ts/mmt-si.js";
import type { ApplicationServiceDescriptor } from "arib-mmt-tlv-ts/mmt-si-descriptor.js";
import { playRomSound } from "./romsound";

interface ApplicationInformationTable {
    getApplications(): Application[];
}

interface Application {
    type: string;
    organization_id: number;
    application_id: number;
    control_code: string;
    autostart_priority: number;
    replaceApplication(organization_id: number, application_id: number, ait_url?: string): void;
    destroyApplication(): void;
    exitFromManagedState(url: string): void;
    getOwnerAIT(): ApplicationInformationTable;
    getApplicationBoundaryAndPermissionDescriptor(): ApplicationBoundaryAndPermissionDescriptor;
}

interface Application {
    readonly keySet: KeySet;
}
interface KeySet {
    value: number;
    setValue(value: number): number;
}

interface ApplicationBoundaryAndPermissionDescriptor {}

// interface PermissionManagedArea {
//     permission?: number[];
//     urls?: string[];
// }

interface ApplicationManager {
    getOwnerApplication(document?: Document): Application | null;
}
interface NavigatorApplicationManager {
    applicationManager: ApplicationManager;
}

interface NavigatorReceiverDevice {
    receiverDevice: ReceiverDevice;
}

type DeviceIdentifierCallback = (identifier?: string) => void;

interface SystemInformation {
    makerid: string;
    browsername: string;
    browserversion: string;
    modelname: string;
    baseurl: string;
}

type CurrentEventInformationCallback = (info: CurrentEventInformation) => void;

interface CurrentEventInformation {
    original_network_id: number;
    tlv_stream_id: number;
    service_id: number;
    event_id: number | null;
    start_time: Date | null;
    duration: number | null;
    free_ca_mode: boolean | null;
    name: string | null;
    desc: string | null;
    f_event_id: number | null;
    f_start_time: Date | null;
    f_duration: number | null;
    f_free_ca_mode: boolean | null;
    f_name: string | null;
    f_desc: string | null;
    // content_id,component_tag,channel_id,module_id,module_name,resource_name
}

type GeneralEventMessageListener = (msg: GeneralEventMessage) => void;

type EventIDUpdateListener = (event_ref: ISDBResourceReference | null) => void;

type AITUpdateListener = (ait: ApplicationInformationTable) => void;
interface StreamEventTarget {
    addGeneralEventMessageListener(
        param: GeneralEventMessageListenerParams,
        listener: GeneralEventMessageListener,
    ): void;
    removeGeneralEventMessageListener(
        param: GeneralEventMessageListenerParams,
        listener?: GeneralEventMessageListener,
    ): void;
    addEventIDUpdateListener(listener: EventIDUpdateListener): void;
    removeEventIDUpdateListener(listener?: EventIDUpdateListener): void;
    addAITUpdateListener(listener: AITUpdateListener): void;
    removeAITUpdateListener(listener?: AITUpdateListener): void;
}

interface ISDBResourceReference {
    original_network_id?: number;
    tlv_stream_id?: number;
    service_id?: number;
    event_id?: number;
    component_tag?: number;
    event_message_tag?: number;
}

interface GeneralEventMessageListenerParams {
    source: ISDBResourceReference;
    message_group_id?: number;
    message_id?: number;
    message_version?: number;
}

interface GeneralEventMessage {
    source: ISDBResourceReference;
    message_group_id: number;
    message_id: number;
    message_version: number;
    private_data_byte?: string;
}

type CacheEventListener = (path: string, event: string) => void;

interface CacheEventTarget {
    storeDataResource(path: string, listener?: CacheEventListener): void;
    releaseDataResource(path?: string): void;
    addCacheEventListener(path: string, listener: CacheEventListener): void;
    removeCacheEventListener(path: string, listener?: CacheEventListener): void;
}

interface ReceiverDevice {
    getDeviceIdentifier(type: number, resultCallback: DeviceIdentifierCallback): void;
    getSystemInformation(query?: string[]): object;
    getCurrentEventInformation(resultCallback: CurrentEventInformationCallback): void;
    confirmIPNetwork(destination: string, confirmType: number, timeout: number): boolean;
    streamEvent: StreamEventTarget;
    cacheEvent: CacheEventTarget;
}

declare global {
    interface Window {
        dataBroadcasting: {
            currentEvent: CurrentEventInformation;
            applicationService?: ApplicationServiceDescriptor;
            ait?: MHApplicationInformationTable;
            application?: MHApplication;
            now?: number;
            serviceIdToBroadcasterId?: Map<number, number>;
            cachedFiles?: Set<string>;
        };
        VK_RED: number;
        VK_GREEN: number;
        VK_YELLOW: number;
        VK_BLUE: number;
        VK_UP: number;
        VK_DOWN: number;
        VK_LEFT: number;
        VK_RIGHT: number;
        VK_ENTER: number;
        VK_BACK: number;
        VK_0: number;
        VK_1: number;
        VK_2: number;
        VK_3: number;
        VK_4: number;
        VK_5: number;
        VK_6: number;
        VK_7: number;
        VK_8: number;
        VK_9: number;
        VK_10: number;
        VK_11: number;
        VK_12: number;
        VK_DBUTTON: number;
        VK_SUBTITLE: number;
        VK_PLAY_PAUSE: number;
        VK_PLAY: number;
        VK_PAUSE: number;
        VK_STOP: number;
        VK_FAST_FWD: number;
        VK_REWIND: number;
        VK_TRACK_NEXT: number;
        VK_TRACK_PREV: number;
        VK_VCR_OTHER: number;
        VK_PAGE_UP: number;
        VK_PAGE_DOWN: number;
        VK_TA: number;
        getApplications(): Application[];
    }
    interface Navigator extends NavigatorApplicationManager {}
    interface Navigator extends NavigatorReceiverDevice {}
    interface HTMLObjectElement {
        enableFullscreen?(): boolean;
        disableFullscreen?(): boolean;
        isFullscreen?(): boolean;
        enableAudioMute?(): boolean;
        disableAudioMute?(): boolean;
        isCaptionExistent?(url: string): boolean;
        addCaptionListener?(listener: CaptionListener, url?: string): void;
        removeCaptionListener?(listener?: CaptionListener): void;
    }
}

type CaptionListener = (captiondata: string) => void;
const contentWindow = window;
const global = contentWindow as unknown as typeof globalThis;

contentWindow.document.fonts.add(new global.FontFace("丸ゴシック", "url('/fonts/KosugiMaru-Regular.woff2')"));
contentWindow.document.fonts.add(
    new global.FontFace("丸ゴシック", "url('/fonts/KosugiMaru-Bold.woff2')", {
        weight: "bold",
    }),
);
contentWindow.document.fonts.add(new global.FontFace("太丸ゴシック", "url('/fonts/KosugiMaru-Bold.woff2')"));
contentWindow.document.fonts.add(new global.FontFace("角ゴシック", "url('/fonts/Kosugi-Regular.woff2')"));
contentWindow.getApplications = function getApplications() {
    return Array.from([]);
};
const generalEventMessageListeners = new Map<
    GeneralEventMessageListener,
    {
        versions: Map<number, number>;
        eventVersions: Map<number, number>;
        params: GeneralEventMessageListenerParams;
    }
>();
contentWindow.addEventListener("message", (event) => {
    if (event.data.type === "caption") {
        for (const listeners of captionListeners.values()) {
            for (const { url, listener } of listeners) {
                if (url != null) {
                    if (parseInt(new URL(url).pathname.substring(1), 16) !== event.data.componentId) {
                        continue;
                    }
                }
                listener(event.data.data);
            }
        }
    }
    if (event.data.type !== "emt") {
        return;
    }
    const emt = event.data.table as EventMessageTable;
    const packetId = event.data.packetId;
    const emtTag = window.parent.dataBroadcasting?.applicationService?.emtList?.find(
        (x) => x.emtLocationInfo.packetId === packetId,
    )?.emtTag;
    for (const [listener, { versions, eventVersions, params }] of generalEventMessageListeners.entries()) {
        if ((params.source.event_message_tag ?? emtTag) !== emtTag) {
            continue;
        }
        if (versions.get(packetId) === emt.versionNumber) {
            continue;
        }
        versions.set(packetId, emt.versionNumber);
        for (const desc of emt.descriptors) {
            if (desc.tag !== "eventMessage") {
                continue;
            }
            const message_id = desc.eventMessageId >> 8;
            const message_version = desc.eventMessageId & 0xff;
            if (params.message_id !== message_id) {
                continue;
            }
            if (eventVersions.get(message_id) === message_version) {
                continue;
            }
            eventVersions.set(message_id, message_version);
            queueMicrotask(() => {
                listener({
                    source: {
                        original_network_id: window.parent.dataBroadcasting.currentEvent.original_network_id,
                        tlv_stream_id: window.parent.dataBroadcasting.currentEvent.tlv_stream_id,
                        service_id: window.parent.dataBroadcasting.currentEvent.service_id,
                        event_id: window.parent.dataBroadcasting.currentEvent.event_id ?? undefined,
                        event_message_tag: emtTag,
                    },
                    message_group_id: desc.eventMessageGroupId,
                    message_id,
                    message_version,
                    private_data_byte: new TextDecoder().decode(desc.privateData),
                });
            });
        }
    }
});

contentWindow.VK_LEFT = 37;
contentWindow.VK_DOWN = 40;
contentWindow.VK_RIGHT = 39;
contentWindow.VK_UP = 38;
contentWindow.VK_BACK = 8;
contentWindow.VK_ENTER = 13;
contentWindow.VK_DBUTTON = 68;
contentWindow.VK_BLUE = 66;
contentWindow.VK_RED = 82;
contentWindow.VK_GREEN = 71;
contentWindow.VK_YELLOW = 89;
contentWindow.VK_STOP = 413;
contentWindow.VK_PAUSE = 19;
contentWindow.VK_PLAY = 415;
contentWindow.VK_0 = 48;
contentWindow.VK_1 = 49;
contentWindow.VK_2 = 50;
contentWindow.VK_3 = 51;
contentWindow.VK_4 = 52;
contentWindow.VK_5 = 53;
contentWindow.VK_6 = 54;
contentWindow.VK_7 = 55;
contentWindow.VK_8 = 56;
contentWindow.VK_9 = 57;

contentWindow.navigator.receiverDevice = {
    getDeviceIdentifier(type, resultCallback) {
        console.log("getDeviceIdentifier", type);
        resultCallback("TEST");
    },
    getSystemInformation(_) {
        console.log("getSystemInformation");
        const r: SystemInformation = {
            makerid: "makerid",
            browsername: "browsername",
            browserversion: "browserversion",
            modelname: "modelname",
            baseurl: location.href.replace(/(?<=\/d\/[^/]+\/).*$/, ""),
        };
        return r;
    },
    getCurrentEventInformation(resultCallback) {
        console.log("getCurrentEventInformation");
        queueMicrotask(() => {
            resultCallback({ ...window.parent.dataBroadcasting.currentEvent });
        });
    },
    confirmIPNetwork(destination, confirmType, timeout) {
        console.log("confirmIPNetwork", destination, confirmType, timeout);
        return false;
    },
    streamEvent: {
        addGeneralEventMessageListener(param, listener) {
            console.log("addGeneralEventMessageListener", param);
            const p = {
                source: {
                    original_network_id: param.source.original_network_id,
                    tlv_stream_id: param.source.tlv_stream_id,
                    service_id: param.source.service_id,
                    event_id: param.source.event_id,
                    component_tag: param.source.component_tag,
                    event_message_tag: param.source.event_message_tag,
                },
                message_id: param.message_id,
                message_version: param.message_version,
            };
            generalEventMessageListeners.set(listener, {
                versions: new Map(),
                eventVersions: new Map(),
                params: p,
            });
        },
        removeGeneralEventMessageListener(param, _) {
            console.log("removeGeneralEventMessageListener", param);
        },
        addEventIDUpdateListener(_) {
            console.log("addEventIDUpdateListener");
        },
        removeEventIDUpdateListener(_) {
            console.log("removeEventIDUpdateListener");
        },
        addAITUpdateListener(_) {
            console.log("addAITUpdateListener");
        },
        removeAITUpdateListener(_) {
            console.log("removeAITUpdateListener");
        },
    },
    cacheEvent: {
        storeDataResource(path, listener) {
            console.log("storeDataResource", path);
            queueMicrotask(() => {
                listener?.(path, "store_finished");
            });
        },
        releaseDataResource(path) {
            console.log("releaseDataResource", path);
        },
        addCacheEventListener(path, _) {
            console.log("addCacheEventListener", path);
        },
        removeCacheEventListener(path, _) {
            console.log("removeCacheEventListener", path);
        },
    },
};

let keySet = 0;
const APPLICATION_CONTROL_CODE_AUTOSTART = 1;
const APPLICATION_CONTROL_CODE_PRESENT = 2;
const APPLICATION_CONTROL_CODE_KILL = 4;

function applicationControlCodeToString(code?: number) {
    switch (code) {
        case APPLICATION_CONTROL_CODE_AUTOSTART:
            return "AUTOSTART";
        case APPLICATION_CONTROL_CODE_PRESENT:
            return "PRESENT";
        case APPLICATION_CONTROL_CODE_KILL:
            return "KILL";
    }
    throw new Error("unknown: " + code);
}

const application: Application = {
    type: String("ARIB-HTML5"),
    organization_id: Number(window.parent.dataBroadcasting.application?.organizationId),
    application_id: Number(window.parent.dataBroadcasting.application?.applicationId),
    control_code: applicationControlCodeToString(window.parent.dataBroadcasting.application?.applicationControlCode),
    autostart_priority: 0,
    keySet: {
        get value() {
            return keySet;
        },
        setValue(value): number {
            keySet = value;
            return value;
        },
    },
    replaceApplication(organization_id: number, application_id: number, ait_url?: string): void {
        console.error("replaceApplication", organization_id, application_id, ait_url);
        throw 1;
    },
    destroyApplication(): void {
        console.error("destroyApplication");
        throw 1;
    },
    exitFromManagedState(url: string): void {
        console.error("exitFromManagedState", url);
        throw 1;
    },
    getOwnerAIT(): ApplicationInformationTable {
        console.error("getOwnerAIT");
        throw 1;
    },
    getApplicationBoundaryAndPermissionDescriptor(): ApplicationBoundaryAndPermissionDescriptor {
        console.error("getApplicationBoundaryAndPermissionDescriptor");
        throw 1;
    },
};

contentWindow.navigator.applicationManager = {
    getOwnerApplication() {
        return application;
    },
};

const origPlay = HTMLMediaElement.prototype.play;
const audioContext = new AudioContext();
const captionListeners = new Map<HTMLObjectElement, { listener: CaptionListener; url: string | undefined }[]>();
HTMLMediaElement.prototype.play = function play() {
    if (this.src.startsWith("romsound://")) {
        console.log("HTMLMediaElement.prototype.play", this.src);
        playRomSound(parseInt(this.src.substring("romsound://".length)), audioContext.destination);
        return Promise.resolve();
    }
    return origPlay.call(this);
};

HTMLObjectElement.prototype.isCaptionExistent = function isCaptionExistent(url) {
    console.log("HTMLVideoElement.prototype.isCaptionExistent:", url);
    return true;
};

HTMLObjectElement.prototype.addCaptionListener = function addCaptionListener(listener, url) {
    console.log("HTMLVideoElement.prototype.addCaptionListener:", url);
    const l = captionListeners.get(this);
    if (l != null) {
        l.push({ listener, url });
    } else {
        captionListeners.set(this, [{ listener, url }]);
    }
};

HTMLObjectElement.prototype.removeCaptionListener = function removeCaptionListener(listener) {
    console.log("HTMLVideoElement.prototype.removeCaptionListener");
    const l = captionListeners.get(this);
    if (l != null) {
        captionListeners.set(
            this,
            l.filter((x) => x.listener !== listener),
        );
    }
};
document.addEventListener("DOMContentLoaded", () => {
    const object = document.querySelector(`object[type="video/x-arib2-broadcast"]`);
    if (object == null) {
        return;
    }
    const video = document.createElement("video");
    video.style.width = "100%";
    video.style.height = "100%";
    const player = mpegts.createPlayer(
        {
            type: "mmttlv",
            isLive: true,
            url: "",
        },
        {
            enableWorkerForMSE: false, //workerForMSEH265Playback,
            liveSync: true,
            systemClockSync: true,
            enableStashBuffer: false,
            lazyLoadRecoverDuration: 4,
            liveSyncTargetLatency: 0.14,
            liveSyncMaxLatency: 0.2,
            liveSyncMinLatency: 0.1,
            liveSyncMinPlaybackRate: 1.0,
            liveSyncPlaybackRate: 1.0,
            customLoader: FetchStreamLoader,
        },
    );
    video.muted = true;
    player.attachMediaElement(video);
    player.load();
    object.appendChild(video);
    try {
        player.play();
    } catch {
        video.muted = true;
        player.play();
    }
});

const OrigDate = Date;

function ShimDate(this: any, ...args: any[]) {
    // Date()
    if (!(this instanceof ShimDate)) {
        return new OrigDate(window.parent.dataBroadcasting.now ?? OrigDate.now()).toString();
    }

    // new Date()
    if (args.length === 0) {
        return new OrigDate(window.parent.dataBroadcasting.now ?? OrigDate.now());
    }

    // @ts-expect-error
    return new OrigDate(...args);
}

ShimDate.prototype = OrigDate.prototype;

ShimDate.now = () => window.parent.dataBroadcasting.now ?? OrigDate.now();
ShimDate.parse = OrigDate.parse;
ShimDate.UTC = OrigDate.UTC;

contentWindow.Date = ShimDate as DateConstructor;

const localStorageSetItem = localStorage.setItem.bind(localStorage);
const localStorageGetItem = localStorage.getItem.bind(localStorage);

function getLocalStorageOrigin(key: string): string {
    // Ureg
    if (key.startsWith("ureg")) {
        const index = key.substring("ureg".length);
        const indexNumber = parseInt(index);
        if (indexNumber >= 0 && indexNumber <= 63 && index === String(indexNumber)) {
            return "arib://localhost";
        }
    }
    // Greg
    if (key.startsWith("greg")) {
        const index = key.substring("greg".length);
        const indexNumber = parseInt(index);
        if (indexNumber >= 0 && indexNumber <= 63 && index === String(indexNumber)) {
            return "arib://localhost";
        }
    }
    // 放送事業者共通領域
    if (key.startsWith("_common")) {
        const index = key.substring("_common".length);
        const indexNumber = parseInt(index);
        if (indexNumber >= 0 && indexNumber <= 255 && index === String(indexNumber)) {
            return "arib2://bs_common";
        }
    }
    // 放送事業者専用領域（保証域）
    if (key.startsWith("_wlocal")) {
        const index = key.substring("_wlocal".length);
        const indexNumber = parseInt(index);
        if (indexNumber >= 0 && indexNumber <= 255 && index === String(indexNumber)) {
            return `arib2://bid_${window.parent.dataBroadcasting.serviceIdToBroadcasterId?.get(window.parent.dataBroadcasting.currentEvent.service_id)?.toString(16)}.nid_${window.parent.dataBroadcasting.currentEvent.original_network_id?.toString(16)}`;
        }
    }
    // 放送事業者専用領域（非保証域）
    if (key.startsWith("_local")) {
        const index = key.substring("_local".length);
        const indexNumber = parseInt(index);
        if (indexNumber >= 0 && indexNumber <= 255 && index === String(indexNumber)) {
            return `arib2://bid_${window.parent.dataBroadcasting.serviceIdToBroadcasterId?.get(window.parent.dataBroadcasting.currentEvent.service_id)?.toString(16)}.nid_${window.parent.dataBroadcasting.currentEvent.original_network_id?.toString(16)}`;
        }
    }
    // 視聴者居住情報領域
    if (key === "_prefecture" || key === "_regioncode" || key === "_zipcode") {
        return "arib2://localhost";
    }
    return `arib2://aid_${window.parent.dataBroadcasting.application?.applicationId?.toString(16)}.oid_${window.parent.dataBroadcasting.application?.organizationId?.toString(16)}`;
}

localStorage.setItem = (key, value) => {
    const realKey = new URLSearchParams([
        ["origin", getLocalStorageOrigin(key)],
        ["key", key],
    ]);
    localStorageSetItem(realKey.toString(), value);
};

localStorage.getItem = (key) => {
    const realKey = new URLSearchParams([
        ["origin", getLocalStorageOrigin(key)],
        ["key", key],
    ]);
    return localStorageGetItem(realKey.toString());
};
