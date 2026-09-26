import { publicAppSchema } from "@depth/schema";
import { addressParam, errorResponse } from "@/shared/http/http.schema";

export const appGetSchema = {
  params: addressParam,
  response: { 200: publicAppSchema, 400: errorResponse, 404: errorResponse },
} as const;
