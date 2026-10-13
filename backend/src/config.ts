import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

export const configSchema = z.object({
  PORT: z
    .string()
    .optional()
    .default("4000")
    .transform((val) => parseInt(val, 10)),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  RPC_URL: z.string().url("RPC_URL must be a valid URL"),
  CHAIN_ID: z
    .string()
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().positive("CHAIN_ID must be a positive integer")),
  CONTRACT_ADDRESS: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/, "CONTRACT_ADDRESS must be a valid 20-byte EVM address (0x...)"),
  DEPLOY_BLOCK: z
    .string()
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().min(0, "DEPLOY_BLOCK must be a non-negative integer")),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  SESSION_SECRET: z
    .string()
    .min(32, "SESSION_SECRET must be at least 32 characters long"),
  FRONTEND_ORIGIN: z.string().url("FRONTEND_ORIGIN must be a valid URL"),
  BLOB_DIR: z.string().min(1, "BLOB_DIR is required"),
});

export type Config = z.infer<typeof configSchema>;

export function parseConfig(envInput: Record<string, string | undefined>): Config {
  const result = configSchema.safeParse(envInput);
  if (!result.success) {
    const formattedErrors = result.error.issues
      .map((err) => `  - ${err.path.join(".")}: ${err.message}`)
      .join("\n");
    const errorMsg = `\n=========================================\n❌ FATAL: Configuration Validation Failed\n=========================================\n${formattedErrors}\n=========================================\n`;
    throw new Error(errorMsg);
  }
  return result.data;
}

let activeConfig: Config | null = null;

export function loadConfig(envInput: Record<string, string | undefined> = process.env): Config {
  activeConfig = parseConfig(envInput);
  return activeConfig;
}

export function getConfig(): Config {
  if (!activeConfig) {
    return loadConfig();
  }
  return activeConfig;
}
