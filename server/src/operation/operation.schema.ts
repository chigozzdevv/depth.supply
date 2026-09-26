import { operationSnapshotSchema } from "@depth/schema";
import { addressParam, errorResponse } from "@/http/http.schema";

export const operationGetSchema = {
  params: addressParam,
  response: {
    200: operationSnapshotSchema,
    400: errorResponse,
    404: errorResponse,
  },
} as const;
