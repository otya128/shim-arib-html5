export type ClientFile = {
    id: string;
    body?: Uint8Array<ArrayBuffer>;
};

export type IndexItem = { path: string; id: string; contentType: string; contentEncoding?: string | undefined };

export type Message =
    | {
          type: "addFile";
          file: ClientFile;
      }
    | {
          type: "addIndex";
          index: IndexItem[];
      };
