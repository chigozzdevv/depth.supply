import { publicQuoteSchema } from "@depth/schema";
import { addressParam, errorResponse } from "@/http/http.schema";

export const quoteGetSchema = {
  params: addressParam,
  response: { 200: publicQuoteSchema, 400: errorResponse, 404: errorResponse },
} as const;
