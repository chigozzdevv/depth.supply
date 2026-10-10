import { candleIntervals, candlePageSchema } from "@depthhq/schema";
import { marketParam } from "@/shared/http/http.schema";

export const candleQuerySchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    interval: { type: "string", enum: candleIntervals },
    before: { type: "integer", minimum: 0 },
    limit: { type: "integer", minimum: 1, maximum: 500 },
  },
} as const;
export const candleGetSchema = {
  params: marketParam,
  querystring: candleQuerySchema,
  response: { 200: candlePageSchema },
} as const;
