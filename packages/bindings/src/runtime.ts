import { Buffer } from "buffer";

// Anchor's browser decoder expects Node's Buffer global.
if (typeof globalThis.Buffer === "undefined") globalThis.Buffer = Buffer;
