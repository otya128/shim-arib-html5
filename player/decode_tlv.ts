import { createMMTTLVReader, MMTTLVReader } from "arib-mmt-tlv-ts";
import { bcdTimeToSeconds, concatBuffers, mjdBCDToUnixEpoch } from "arib-mmt-tlv-ts/utils.js";
import {
    DataAssetMPU,
    DataAssetManagementTable,
    EventMessageTable,
    MHApplicationInformationTable,
    MMT_ASSET_TYPE_APPLICATION,
    MMT_ASSET_TYPE_TIMED_TEXT,
} from "arib-mmt-tlv-ts/mmt-si.js";
import {
    APPLICATION_FORMAT_ARIB_HTML5,
    ApplicationServiceDescriptor,
    MHDataComponentDescriptor,
} from "arib-mmt-tlv-ts/mmt-si-descriptor.js";
import { ITEM_COMPRESSION_TYPE_ZLIB, readIndexItem } from "arib-mmt-tlv-ts/application.js";
import { ntp64TimestampToDate } from "arib-mmt-tlv-ts/ntp.js";
import type { Message } from "../sw/message";
import {
    MMTP_FRAGMENTATION_INDICATOR_COMPLETE,
    MMTP_FRAGMENTATION_INDICATOR_HEAD,
    MMTP_FRAGMENTATION_INDICATOR_MIDDLE,
    MMTP_FRAGMENTATION_INDICATOR_TAIL,
} from "arib-mmt-tlv-ts/mmtp.js";

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

type DataComponent = {
    mpus: Map<number, DataComponentMPU>;
};

type Fragmentation = {
    downloadId: number;
    lastItemFragmentNumber: number;
    received: number;
    fragments: Uint8Array[];
    data?: Uint8Array;
};

type DataComponentMPU = {
    items: Map<number, Fragmentation>;
};

type Directory = {
    baseDirectoryPath: string;
    nodeTag: number;
    directoryNodeVersion: number;
    directoryNodePath: string;
};

type Node = {
    componentTag: number;
    mpu: DataAssetMPU;
};

export type BrowserMessage =
    | {
          type: "currentEvent";
          currentEventInformation: CurrentEventInformation;
      }
    | {
          type: "currentAIT";
          packetId: number;
          table: MHApplicationInformationTable;
      }
    | {
          type: "emt";
          packetId: number;
          table: EventMessageTable;
      }
    | {
          type: "updateBIT";
          serviceIdToBroadcasterId: Map<number, number>;
      }
    | {
          type: "ntp";
          time: number;
      }
    | {
          type: "tot";
          time: number;
      }
    | {
          type: "applicationService";
          applicationService: ApplicationServiceDescriptor;
      }
    | {
          type: "caption";
          componentId: number;
          data: string;
      };

export type DecodeMMTTLVOptions = {
    browserCallback: (message: BrowserMessage) => void;
    callback: (messages: Message[]) => void;
};

const textDecoder = new TextDecoder();

export function decodeMMTTLV(options: DecodeMMTTLVOptions): MMTTLVReader {
    const { browserCallback, callback } = options;
    const currentEvent: CurrentEventInformation = {
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
    };
    const reader = createMMTTLVReader();
    let eitVersion = -1;
    const eitReceivedSections = new Set<number>();
    reader.addEventListener("eit", (event) => {
        if (event.table.tableId === "EIT[p/f]") {
            if (event.table.versionNumber === eitVersion) {
                if (eitReceivedSections.has(event.table.sectionNumber)) {
                    return;
                }
            } else {
                eitReceivedSections.clear();
                eitVersion = event.table.versionNumber;
            }
            eitReceivedSections.add(event.table.sectionNumber);
            for (const e of event.table.events) {
                console.log({
                    eventId: e.eventId,
                    duration: e.duration == null ? null : bcdTimeToSeconds(e.duration),
                    startTime: e.startTime == null ? null : mjdBCDToUnixEpoch(e.startTime),
                });
                if (event.table.sectionNumber === 0) {
                    currentEvent.event_id = e.eventId;
                    currentEvent.duration = e.duration == null ? null : bcdTimeToSeconds(e.duration);
                    currentEvent.start_time =
                        e.startTime == null ? null : new Date(mjdBCDToUnixEpoch(e.startTime) * 1000);
                    currentEvent.free_ca_mode = e.freeCAMode;
                    currentEvent.name = null;
                    currentEvent.desc = null;
                }
                if (event.table.sectionNumber === 1) {
                    currentEvent.f_event_id = e.eventId;
                    currentEvent.f_duration = e.duration == null ? null : bcdTimeToSeconds(e.duration);
                    currentEvent.f_start_time =
                        e.startTime == null ? null : new Date(mjdBCDToUnixEpoch(e.startTime) * 1000);
                    currentEvent.f_free_ca_mode = e.freeCAMode;
                    currentEvent.f_name = null;
                    currentEvent.f_desc = null;
                }
                for (const desc of e.descriptors) {
                    switch (desc.tag) {
                        case "mhShortEvent":
                            if (event.table.sectionNumber === 0) {
                                currentEvent.name = textDecoder.decode(desc.eventName);
                                currentEvent.desc = textDecoder.decode(desc.text);
                            }
                            if (event.table.sectionNumber === 1) {
                                currentEvent.f_name = textDecoder.decode(desc.eventName);
                                currentEvent.f_desc = textDecoder.decode(desc.text);
                            }
                            console.log({
                                eventName: textDecoder.decode(desc.eventName),
                                text: textDecoder.decode(desc.text),
                            });
                            break;
                    }
                }
                browserCallback({
                    type: "currentEvent",
                    currentEventInformation: { ...currentEvent },
                });
            }
        }
    });
    reader.addEventListener("tlvDiscontinuity", (event) => {
        console.log("tlvDiscontinuity", event);
    });
    reader.addEventListener("mmtDiscontinuity", (event) => {
        console.log("mmtDiscontinuity", event);
    });
    let aitVersion = -1;
    reader.addEventListener("ait", (event) => {
        if (event.table.versionNumber === aitVersion) {
            return;
        }
        aitVersion = event.table.versionNumber;
        browserCallback({
            type: "currentAIT",
            packetId: event.packetId,
            table: event.table,
        });
        console.dir(event.table, { depth: 100 });
    });
    let ddmtVersion = -1;
    let ddmtReceivedSections = new Set<number>();
    const directories = new Map<number, Directory>();
    reader.addEventListener("ddmt", (event) => {
        if (event.table.versionNumber === ddmtVersion) {
            if (ddmtReceivedSections.has(event.table.sectionNumber)) {
                return;
            }
        } else {
            ddmtReceivedSections.clear();
            directories.clear();
            ddmtVersion = event.table.versionNumber;
        }
        ddmtReceivedSections.add(event.table.sectionNumber);
        //console.dir(event.table, { depth: 100 });
        const baseDirectoryPath = textDecoder.decode(event.table.baseDirectoryPath);
        console.log(event.table.sectionNumber, event.table.lastSectionNumber, baseDirectoryPath);
        for (const node of event.table.directoryNodes) {
            const directoryNodePath = textDecoder.decode(node.directoryNodePath);
            console.log("|" + directoryNodePath, node.nodeTag, node.directoryNodeVersion);
            directories.set(node.nodeTag, {
                baseDirectoryPath,
                nodeTag: node.nodeTag,
                directoryNodeVersion: node.directoryNodeVersion,
                directoryNodePath,
            });
        }
    });
    let damtVersion = -1;
    let damtReceivedSections = new Set<number>();
    const assets = new Map<number, DataAssetManagementTable>();
    const nodes = new Map<number, Node>();
    reader.addEventListener("damt", (event) => {
        if (event.table.versionNumber === damtVersion) {
            if (damtReceivedSections.has(event.table.sectionNumber)) {
                return;
            }
        } else {
            damtReceivedSections.clear();
            assets.clear();
            nodes.clear();
            damtVersion = event.table.versionNumber;
        }
        damtReceivedSections.add(event.table.sectionNumber);
        assets.set(event.table.componentTag, event.table);
        for (const mpu of event.table.mpus) {
            for (const info of mpu.mpuInfo) {
                if (info.tag === "mpuNode") {
                    nodes.set(info.nodeTag, { componentTag: event.table.componentTag, mpu });
                }
            }
        }
    });
    reader.addEventListener("emt", (event) => {
        browserCallback({
            type: "emt",
            packetId: event.packetId,
            table: event.table,
        });
    });
    let sdtTableVersion = -1;
    reader.addEventListener("sdt", (event) => {
        if (event.table.tableId === "SDT[actual]") {
            if (sdtTableVersion == event.table.versionNumber) {
                return;
            }
            sdtTableVersion = event.table.versionNumber;
            currentEvent.original_network_id = event.table.originalNetworkId;
            currentEvent.tlv_stream_id = event.table.tlvStreamId;
            currentEvent.service_id = event.table.services[0].serviceId; // FIXME
            browserCallback({
                type: "currentEvent",
                currentEventInformation: { ...currentEvent },
            });
        }
    });
    reader.addEventListener("bit", (event) => {
        const serviceIdToBroadcasterId = new Map<number, number>();
        for (const broadcaster of event.table.broadcasters) {
            for (const desc of broadcaster.broadcasterDescriptors) {
                if (desc.tag !== "mhServiceList") {
                    continue;
                }
                for (const service of desc.services) {
                    serviceIdToBroadcasterId.set(service.serviceId, broadcaster.broadcasterId);
                }
            }
        }
        browserCallback({
            type: "updateBIT",
            serviceIdToBroadcasterId,
        });
    });
    let mptVersion = -1;
    const packetId2ComponentTag = new Map<number, number>();
    const componentTag2PacketId = new Map<number, number>();
    const dataComponents = new Map<number, DataComponent>();
    const captionComponents = new Map<number, MHDataComponentDescriptor>();
    reader.addEventListener("mpt", (event) => {
        if (event.table.version === mptVersion) {
            return;
        }
        packetId2ComponentTag.clear();
        componentTag2PacketId.clear();
        mptVersion = event.table.version;
        for (const desc of event.table.mptDescriptors) {
            if (desc.tag === "applicationService") {
                if (desc.applicationFormat !== APPLICATION_FORMAT_ARIB_HTML5) {
                    continue;
                }
                // const dtPacketId = desc.dtMessageLocationInfo?.packetId;
                browserCallback({
                    type: "applicationService",
                    applicationService: desc,
                });
            }
        }
        for (const asset of event.table.assets) {
            if (asset.assetType !== MMT_ASSET_TYPE_TIMED_TEXT && asset.assetType !== MMT_ASSET_TYPE_APPLICATION) {
                continue;
            }
            const packetId = asset.locations[0]?.packetId;
            if (packetId == null) {
                continue;
            }
            console.dir(asset, { depth: 100 });
            if (asset.assetType === MMT_ASSET_TYPE_APPLICATION) {
                if (!dataComponents.has(packetId)) {
                    dataComponents.set(packetId, {
                        mpus: new Map(),
                    });
                }
            }
            for (const desc of asset.assetDescriptors) {
                if (desc.tag === "streamIdentifier") {
                    packetId2ComponentTag.set(packetId, desc.componentTag);
                    componentTag2PacketId.set(desc.componentTag, packetId);
                }
                if (desc.tag === "dataComponent") {
                    if (asset.assetType === MMT_ASSET_TYPE_TIMED_TEXT) {
                        captionComponents.set(packetId, desc);
                    }
                }
            }
        }
    });
    reader.addEventListener("mpu", (event) => {
        const dataComponent = dataComponents.get(event.mmtHeader.packetId);
        const componentTag = packetId2ComponentTag.get(event.mmtHeader.packetId);
        if (dataComponent == null || componentTag == null) {
            return;
        }
        if (event.mpu.timedFlag) {
            return;
        }
        let downloadId: number | undefined;
        let itemFragmentNumber: number | undefined;
        let lastItemFragmentNumber: number | undefined;
        for (const ext of event.mmtHeader.headerExtensions) {
            if (ext.headerType === "downloadId") {
                downloadId = ext.downloadId;
            } else if (ext.headerType === "itemFragmentation") {
                itemFragmentNumber = ext.itemFragmentNumber;
                lastItemFragmentNumber = ext.lastItemFragmentNumber;
            }
        }
        if (downloadId == null || itemFragmentNumber == null || lastItemFragmentNumber == null) {
            return;
        }
        const seq = event.mpu.mpuSequenceNumber;
        const asset = assets.get(componentTag);
        if (asset?.componentTag !== componentTag) {
            return;
        }
        let directory: Directory | undefined;
        for (const mpu of asset.mpus) {
            if (mpu.mpuSequenceNumber !== seq) {
                continue;
            }
            for (const info of mpu.mpuInfo) {
                if (info.tag === "mpuNode") {
                    directory = directories.get(info.nodeTag);
                    break;
                }
            }
        }
        if (directory == null) {
            return;
        }
        let mpu = dataComponent.mpus.get(seq);
        if (mpu == null) {
            mpu = {
                items: new Map(),
            };
            dataComponent.mpus.set(seq, mpu);
        }
        for (const mfu of event.mpu.mfuList) {
            let item = mpu.items.get(mfu.itemId);
            if (item == null || item.downloadId !== downloadId) {
                item = {
                    downloadId,
                    lastItemFragmentNumber,
                    fragments: [],
                    received: 0,
                    data: undefined,
                };
                mpu.items.set(mfu.itemId, item);
            }
            if (item.data != null) {
                continue;
            }
            if (item.fragments[itemFragmentNumber] == null) {
                item.fragments[itemFragmentNumber] = mfu.mfuData;
                item.received += 1;
            }
            if (item.received === item.lastItemFragmentNumber + 1) {
                item.data = concatBuffers(item.fragments);
                item.fragments.length = 0;
                console.log(
                    { packetId: event.mmtHeader.packetId, itemId: mfu.itemId, downloadId },
                    // item.data
                );
                if (mfu.itemId === 0) {
                    const items = readIndexItem(item.data)?.items ?? [];
                    for (const i of items) {
                        console.log(i.itemId, textDecoder.decode(i.fileName), textDecoder.decode(i.itemType));
                    }
                    callback([
                        {
                            type: "addIndex",
                            index: items.map((item) => {
                                const prefix =
                                    "/" +
                                    [
                                        ...directory.baseDirectoryPath.split("/"),
                                        ...directory.directoryNodePath.split("/"),
                                    ]
                                        .filter((x) => x.length > 0)
                                        .join("/") +
                                    "/";
                                const path = prefix + textDecoder.decode(item.fileName);
                                return {
                                    id: `${componentTag}-${item.itemId}`,
                                    path,
                                    contentType: textDecoder.decode(item.itemType),
                                    contentEncoding:
                                        item.compressionType === ITEM_COMPRESSION_TYPE_ZLIB ? "deflate" : undefined,
                                };
                            }),
                        },
                    ]);
                } else {
                    callback([
                        {
                            type: "addFile",
                            file: {
                                id: `${componentTag}-${mfu.itemId}`,
                                body: item.data as Uint8Array<ArrayBuffer>,
                            },
                        },
                    ]);
                }
            }
        }
    });
    reader.addEventListener("ntp", (event) => {
        browserCallback({
            type: "ntp",
            time: ntp64TimestampToDate(event.ntp.transmitTimestamp).getTime(),
        });
    });
    const mfuBuffers = new Map<number, { sequenceNumber: number; queue: Uint8Array[] }>();
    reader.addEventListener("mpu", (event) => {
        const c = captionComponents.get(event.mmtHeader.packetId);
        if (c == null) {
            return;
        }
        if (c.additionalAribSubtitleInfo == null) {
            return;
        }
        let mfuList: Uint8Array[] = [];
        if (event.mpu.fragmentationIndicator === MMTP_FRAGMENTATION_INDICATOR_COMPLETE) {
            mfuBuffers.delete(event.mmtHeader.packetId);
            mfuList = event.mpu.mfuList.map((x) => x.mfuData);
        } else if (event.mpu.fragmentationIndicator === MMTP_FRAGMENTATION_INDICATOR_HEAD) {
            mfuBuffers.set(event.mmtHeader.packetId, {
                sequenceNumber: event.mpu.mpuSequenceNumber,
                queue: event.mpu.mfuList.map((x) => x.mfuData),
            });
            return;
        } else if (event.mpu.fragmentationIndicator === MMTP_FRAGMENTATION_INDICATOR_MIDDLE) {
            const buffer = mfuBuffers.get(event.mmtHeader.packetId);
            if (buffer == null) {
                return;
            }
            if (buffer.sequenceNumber !== event.mpu.mpuSequenceNumber) {
                mfuBuffers.delete(event.mmtHeader.packetId);
                return;
            }
            buffer.queue.push(...event.mpu.mfuList.map((x) => x.mfuData));
            return;
        } else if (event.mpu.fragmentationIndicator === MMTP_FRAGMENTATION_INDICATOR_TAIL) {
            const buffer = mfuBuffers.get(event.mmtHeader.packetId);
            if (buffer == null) {
                return;
            }
            if (buffer.sequenceNumber !== event.mpu.mpuSequenceNumber) {
                mfuBuffers.delete(event.mmtHeader.packetId);
                return;
            }
            buffer.queue.push(...event.mpu.mfuList.map((x) => x.mfuData));
            mfuList.push(concatBuffers(buffer.queue));
            mfuBuffers.delete(event.mmtHeader.packetId);
        }
        for (const mfu of mfuList) {
            let off = 0;
            // const subtitleTag = mfu[off];
            off++;
            // const subtitleSequenceNumber = mfu[off];
            off++;
            const subsampleNumber = mfu[off];
            off++;
            const lastSubsampleNumber = mfu[off];
            off++;
            const dataType = mfu[off] >> 4;
            const lengthExtensionFlag = !!(mfu[off] & 8);
            const subsampleInfoListFlag = !!(mfu[off] & 4);
            off++;
            let dataSize = (mfu[off] << 8) | (mfu[off + 1] << 0);
            off += 2;
            if (lengthExtensionFlag) {
                dataSize = (dataSize << 16) | (mfu[off] << 8) | (mfu[off + 1] << 0);
                off += 2;
            }
            if (subsampleNumber === 0 && lastSubsampleNumber > 0 && subsampleInfoListFlag) {
                for (let i = 1; i < lastSubsampleNumber + 1; i++) {
                    // const subsampleIDataType = mfu[off] >> 4;
                    off++;
                    let subsampleIDataSize = (mfu[off] << 8) | (mfu[off + 1] << 0);
                    off += 2;
                    if (lengthExtensionFlag) {
                        subsampleIDataSize = (subsampleIDataSize << 16) | (mfu[off] << 8) | (mfu[off + 1] << 0);
                        off += 2;
                    }
                }
            }
            browserCallback({
                type: "caption",
                componentId: packetId2ComponentTag.get(event.mmtHeader.packetId)!,
                data: JSON.stringify({
                    ISO_639_language_code: c.additionalAribSubtitleInfo.iso639LanguageCode,
                    tmd: c.additionalAribSubtitleInfo.tmd.toString(2).padStart(4, "0"),
                    resolution: c.additionalAribSubtitleInfo.resolution.toString(2).padStart(4, "0"),
                    reference_start_time_seconds: c.additionalAribSubtitleInfo.referenceStartTime?.startTime.seconds,
                    reference_start_time_fraction:
                        c.additionalAribSubtitleInfo.referenceStartTime?.startTime.fractional,
                    subtitle_sequence_number: c.additionalAribSubtitleInfo.startMPUSequenceNumber,
                    subsample_number: subsampleNumber,
                    last_subsample_number: lastSubsampleNumber,
                    data_type: dataType.toString(2).padStart(4, "0"),
                    data: dataType === 0 || dataType === 0b0110 ? textDecoder.decode(mfu.subarray(off)) : "",
                }),
            });
        }
    });
    return reader;
}
