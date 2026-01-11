/*
 * Copyright (C) 2024 otya. All Rights Reserved.
 *
 * @author otya <otya281@gmail.com>
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { MMTTLVReader } from "arib-mmt-tlv-ts";
import { MMT_ASSET_TYPE_HEV1, MMT_ASSET_TYPE_MP4A } from "arib-mmt-tlv-ts/mmt-si.js";
import { MPUExtendedTimestampDescriptor, MPUTimestamp } from "arib-mmt-tlv-ts/mmt-si-descriptor.js";

export type SeekInformation = {
    first_timestamp: number;
    last_timestamp: number;
    estimated_bitrate: number;
    content_length: number;
};

type ProbeFirstTimestampResult = {
    video_timestamp?: number;
    audio_timestamp?: number;
    contentLength?: number;
};

export class MMTTLVSeekLocator {
    seek_info: Promise<SeekInformation | undefined>;
    private duration_probe_size = 4 * 1024 * 1024;
    private duration_probe_size_limit = 32 * 1024 * 1024;
    private max_seek_error_seconds = 10;
    private rap_cache = new Map<number, ProbeFirstTimestampResult>();
    private url: string;
    private TAG = "MMTTLVSeekLocator";

    public constructor(url: string, durationCallback: (d: number) => void) {
        this.url = url;
        this.seek_info = this.probeSeekInfo(durationCallback);
    }

    async probeSeekInfo(durationCallback: (d: number) => void): Promise<SeekInformation | undefined> {
        const { video_timestamp, audio_timestamp, contentLength } = await this.probeFirstTimestamp(
            0,
            this.duration_probe_size_limit,
        );
        if (video_timestamp == null || audio_timestamp == null || contentLength == null) {
            console.log("probeSeekInfo: probeFirstTimestamp failed");
            return undefined;
        }
        console.debug(this.TAG, `probeSeekInfo: video_timestamp=${video_timestamp} audio_timestamp=${audio_timestamp}`);
        const first_timestamp = Math.min(video_timestamp, audio_timestamp);
        let last_timestamp: number | undefined;
        let probe_size: number = this.duration_probe_size;
        while (last_timestamp == null) {
            const start = Math.max(contentLength - probe_size, 0);
            last_timestamp = await this.probeLastTimestamp(start);
            probe_size *= 2;
            if (probe_size > this.duration_probe_size_limit || start === Math.max(contentLength - probe_size, 0)) {
                console.error(this.TAG, "probeSeekInfo: probeLastTimestamp failed");
                return undefined;
            }
        }
        console.debug(this.TAG, `probeSeekInfo: last_timestamp=${last_timestamp}`);
        durationCallback(last_timestamp - first_timestamp);
        return {
            first_timestamp,
            last_timestamp,
            estimated_bitrate: (contentLength * 8) / (last_timestamp - first_timestamp),
            content_length: contentLength,
        };
    }

    probeFirstTimestamp(
        start: number,
        probeSize: number,
        abortSignal?: AbortSignal,
    ): Promise<ProbeFirstTimestampResult> {
        const reader = new MMTTLVReader();
        let mpt_packet_id: number | undefined;
        reader.addEventListener("plt", (e) => {
            mpt_packet_id = e.table.packages[0].locationInfo.packetId;
        });
        let video_packet_id: number | undefined;
        let video_rap_mpu_sequence: number | undefined;
        let audio_packet_id: number | undefined;
        let audio_rap_mpu_sequence: number | undefined;
        const video_timestamps: Map<number, MPUTimestamp> = new Map();
        const audio_timestamps: Map<number, MPUTimestamp> = new Map();
        reader.addEventListener("mpt", (e) => {
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
        reader.addEventListener("mpu", (e) => {
            if (e.mmtHeader.packetId === video_packet_id) {
                if (!e.mmtHeader.rapFlag || video_rap_mpu_sequence != null) {
                    return;
                }
                video_rap_mpu_sequence = e.mpu.mpuSequenceNumber;
            }
            if (e.mmtHeader.packetId === audio_packet_id) {
                if (!e.mmtHeader.rapFlag || audio_rap_mpu_sequence != null) {
                    return;
                }
                audio_rap_mpu_sequence = e.mpu.mpuSequenceNumber;
            }
        });
        return new Promise((resolve, reject) => {
            let bytes = 0;
            let settled = false;
            const resolveOnce = (result: ProbeFirstTimestampResult) => {
                if (settled) {
                    return;
                }
                settled = true;
                resolve(result);
            };
            const rejectOnce = (reason: unknown) => {
                if (settled) {
                    return;
                }
                settled = true;
                reject(reason);
            };

            this.streamHttpRange(start, {
                maxBytes: probeSize,
                abortSignal,
                onChunk: (chunk, _byteStart, totalLength) => {
                    reader.push(chunk);
                    bytes += chunk.byteLength;
                    if (video_rap_mpu_sequence != null && audio_rap_mpu_sequence != null) {
                        let min_video_mpu_seq = Infinity;
                        video_timestamps.forEach((_, k) => {
                            min_video_mpu_seq = Math.min(min_video_mpu_seq, k);
                        });
                        const video_ts = video_timestamps.get(Math.max(min_video_mpu_seq, video_rap_mpu_sequence));
                        let min_audio_mpu_seq = Infinity;
                        audio_timestamps.forEach((_, k) => {
                            min_audio_mpu_seq = Math.min(min_audio_mpu_seq, k);
                        });
                        const audio_ts = audio_timestamps.get(Math.max(min_audio_mpu_seq, audio_rap_mpu_sequence));
                        if (video_ts != null && audio_ts != null) {
                            resolveOnce({
                                video_timestamp:
                                    video_ts.mpuPresentationTime.seconds +
                                    video_ts.mpuPresentationTime.fractional * Math.pow(2, -32),
                                audio_timestamp:
                                    audio_ts.mpuPresentationTime.seconds +
                                    audio_ts.mpuPresentationTime.fractional * Math.pow(2, -32),
                                contentLength: totalLength,
                            });
                            return true;
                        }
                    }
                    if (bytes >= probeSize) {
                        resolveOnce({ contentLength: totalLength });
                        return true;
                    }
                    return false;
                },
            })
                .then((totalLength) => {
                    if (!settled) {
                        resolveOnce({ contentLength: totalLength });
                    }
                })
                .catch((error) => {
                    if (error instanceof DOMException && error.name === "AbortError") {
                        rejectOnce("aborted");
                        return;
                    }
                    rejectOnce(error);
                });
        });
    }

    // TODO: probe last decodable timestamp instead of first decodable timestamp
    async probeLastTimestamp(start: number, probeSize?: number) {
        const reader = new MMTTLVReader();
        let mpt_packet_id: number | undefined;
        reader.addEventListener("plt", (e) => {
            mpt_packet_id = e.table.packages[0].locationInfo.packetId;
        });
        let video_packet_id: number | undefined;
        let rap_mpu_sequence: number | undefined;
        const video_timestamps: Map<number, MPUTimestamp> = new Map();
        let video_extended_timestamp_desc: MPUExtendedTimestampDescriptor | undefined;
        reader.addEventListener("mpt", (e) => {
            if (e.packetId !== mpt_packet_id) {
                return;
            }
            for (const asset of e.table.assets) {
                const packet_id = asset.locations[0]?.packetId;
                if (video_packet_id == null && asset.assetType === MMT_ASSET_TYPE_HEV1) {
                    video_packet_id = packet_id;
                }
                if (packet_id === video_packet_id) {
                    for (const desc of asset.assetDescriptors) {
                        if (desc.tag === "mpuTimestamp") {
                            for (const ts of desc.timestamps) {
                                video_timestamps.set(ts.mpuSequenceNumber, ts);
                            }
                        } else if (desc.tag === "mpuExtendedTimestamp") {
                            video_extended_timestamp_desc = desc;
                        }
                    }
                }
            }
        });
        reader.addEventListener("mpu", (e) => {
            if (e.mmtHeader.packetId !== video_packet_id || !e.mmtHeader.rapFlag) {
                return;
            }
            rap_mpu_sequence = e.mpu.mpuSequenceNumber;
        });
        let last_pts: number | undefined;
        let bytes = 0;
        try {
            await this.streamHttpRange(start, {
                maxBytes: probeSize,
                onChunk: (chunk) => {
                    reader.push(chunk);
                    bytes += chunk.byteLength;
                    if (rap_mpu_sequence != null) {
                        const ts = video_timestamps.get(rap_mpu_sequence);
                        if (ts != null) {
                            last_pts =
                                ts.mpuPresentationTime.seconds + ts.mpuPresentationTime.fractional * Math.pow(2, -32);
                            if (video_extended_timestamp_desc != null) {
                                const { defaultPTSOffset, timescale } = video_extended_timestamp_desc;
                                if (defaultPTSOffset != null && timescale != null) {
                                    last_pts += defaultPTSOffset / timescale;
                                }
                            }
                        }
                    }
                    if (probeSize != null && bytes >= probeSize) {
                        return true;
                    }
                    return false;
                },
            });
        } catch (_error) {
            return undefined;
        }
        return last_pts;
    }

    private parseTotalLength(response: Response, start: number): number | undefined {
        const contentRange = response.headers.get("Content-Range");
        if (contentRange != null) {
            const match = /bytes\s+\d+-\d+\/(\d+|\*)/i.exec(contentRange);
            if (match != null && match[1] !== "*") {
                const total = Number(match[1]);
                if (!Number.isNaN(total)) {
                    return total;
                }
            }
        }
        const contentLength = response.headers.get("Content-Length");
        if (contentLength != null) {
            const length = Number(contentLength);
            if (!Number.isNaN(length)) {
                if (response.status === 200 && start === 0) {
                    return length;
                }
                return start + length;
            }
        }
        return undefined;
    }

    private async streamHttpRange(
        start: number,
        options: {
            maxBytes?: number;
            abortSignal?: AbortSignal;
            onChunk: (chunk: Uint8Array, byteStart: number, totalLength?: number) => boolean | void;
        },
    ): Promise<number | undefined> {
        const { maxBytes, abortSignal, onChunk } = options;
        if (abortSignal?.aborted) {
            throw new DOMException("Aborted", "AbortError");
        }
        const headers = new Headers();
        if (start > 0 || maxBytes != null) {
            const end = maxBytes != null ? start + maxBytes - 1 : undefined;
            headers.set("Range", end != null ? `bytes=${start}-${end}` : `bytes=${start}-`);
        }
        const controller = new AbortController();
        const handleAbort = () => controller.abort();
        abortSignal?.addEventListener("abort", handleAbort);
        try {
            const response = await fetch(this.url, {
                headers,
                signal: controller.signal,
            });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status} ${response.statusText}`);
            }
            const totalLength = this.parseTotalLength(response, start);
            const body = response.body;
            if (body == null) {
                throw new Error("ReadableStream is not supported in this environment");
            }
            const reader = body.getReader();
            let byteStart = start;
            while (true) {
                const { value, done } = await reader.read();
                if (done) {
                    break;
                }
                if (value == null) {
                    continue;
                }
                const shouldStop = onChunk(value, byteStart, totalLength);
                byteStart += value.byteLength;
                const hitLimit = maxBytes != null && byteStart - start >= maxBytes;
                if (shouldStop || hitLimit) {
                    await reader.cancel().catch(() => undefined);
                    break;
                }
            }
            return totalLength;
        } catch (error) {
            if (controller.signal.aborted) {
                throw new DOMException("Aborted", "AbortError");
            }
            throw error;
        } finally {
            abortSignal?.removeEventListener("abort", handleAbort);
        }
    }

    async estimateCBR(ts: number, info: SeekInformation, abortSignal?: AbortSignal): Promise<number | undefined> {
        const { first_timestamp, estimated_bitrate } = info;
        let estimated_position = Math.floor((estimated_bitrate * Math.max(0, ts - 1)) / 8);
        if (abortSignal?.aborted) {
            return undefined;
        }
        const cached = this.rap_cache.get(estimated_position);
        const probed = cached ?? (await this.probeFirstTimestamp(estimated_position, 32 * 1024 * 1024, abortSignal));
        if (probed == null) {
            return undefined;
        }
        this.rap_cache.set(estimated_position, probed);
        const { video_timestamp, audio_timestamp } = probed;
        if (video_timestamp == null || audio_timestamp == null) {
            return undefined;
        }
        const actual_ts = Math.min(video_timestamp, audio_timestamp);
        const delta = ts - (actual_ts - first_timestamp);
        console.debug(
            this.TAG,
            `probe RAP CBR${cached ? " (cached)" : ""} offset=${estimated_position} ts=${actual_ts - info.first_timestamp} delta=${delta}`,
        );
        if (delta >= 0 && delta < this.max_seek_error_seconds) {
            if (delta < 0.5) {
                return Math.max(0, estimated_position - Math.floor(info.estimated_bitrate / 8 / 2));
            }
            return estimated_position;
        }
        return undefined;
    }
    async estimateVBR(ts: number, info: SeekInformation, abortSignal?: AbortSignal): Promise<number | undefined> {
        let lbound = 0;
        let ubound = info.content_length - 1;
        let mid = lbound + Math.floor((ubound - lbound) / 2);

        while (lbound <= ubound) {
            if (abortSignal?.aborted) {
                return undefined;
            }
            const cached = this.rap_cache.get(mid);
            const probed = cached ?? (await this.probeFirstTimestamp(mid, 32 * 1024 * 1024, abortSignal));
            this.rap_cache.set(mid, probed);
            const { video_timestamp, audio_timestamp } = probed;
            if (video_timestamp == null || audio_timestamp == null) {
                return undefined;
            }
            const actual_ts = Math.max(video_timestamp, audio_timestamp);
            const delta = ts - (actual_ts - info.first_timestamp);
            console.debug(
                this.TAG,
                `probe RAP VBR${cached ? " (cached)" : ""} offset=${mid} ts=${actual_ts - info.first_timestamp} delta=${delta}`,
            );
            if (delta >= 0 && delta < this.max_seek_error_seconds) {
                if (delta < 0.5) {
                    return Math.max(0, mid - Math.floor(info.estimated_bitrate / 8 / 2));
                }
                return mid;
            } else if (delta > 0) {
                lbound = mid + 1;
            } else {
                ubound = mid - 1;
            }
            const next = lbound + Math.floor((ubound - lbound) / 2);
            if (Math.abs(next - mid) <= 32 * 1024) {
                return Math.min(next, mid);
            }
            mid = next;
        }
        return undefined;
    }

    public async locateSeekPosition(milliseconds: number, abortSignal?: AbortSignal): Promise<number> {
        const ts = milliseconds / 1000;
        if (ts < this.max_seek_error_seconds) {
            if (abortSignal?.aborted) {
                throw "aborted";
            }
            return 0;
        }
        const info = await this.seek_info;
        if (info == null) {
            throw "locateSeekPosition failed.";
        }
        const cbr_estimated = await this.estimateCBR(ts, info, abortSignal);
        if (cbr_estimated != null) {
            if (abortSignal?.aborted) {
                throw "aborted";
            }
            return cbr_estimated;
        }
        console.debug(this.TAG, "CBR estimation failed, falling back to VBR estimation.");
        const vbr_estimated = await this.estimateVBR(ts, info, abortSignal);
        if (vbr_estimated == null) {
            throw "locateSeekPosition failed.";
        }
        if (abortSignal?.aborted) {
            throw "aborted";
        }
        return vbr_estimated;
    }
}
