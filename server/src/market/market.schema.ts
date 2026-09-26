import { publicMarketSchema } from "@depth/schema";
import { errorResponse, marketParam } from "@/http/http.schema";

export const marketListSchema = {
  response: {
    200: {
      type: "object",
      required: ["markets"],
      additionalProperties: false,
      properties: {
        markets: { type: "array", items: publicMarketSchema, maxItems: 1 },
      },
    },
  },
} as const;

export const marketGetSchema = {
  params: marketParam,
  response: { 200: publicMarketSchema, 404: errorResponse },
} as const;
