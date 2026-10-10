import { publicRecoverySchema, publicWinddownSchema } from "@depthhq/schema";
import { errorResponse, marketParam } from "@/shared/http/http.schema";

export const recoveryGetSchema = {
  params: marketParam,
  response: { 200: publicRecoverySchema, 404: errorResponse },
} as const;

export const winddownGetSchema = {
  params: marketParam,
  response: { 200: publicWinddownSchema, 404: errorResponse },
} as const;
