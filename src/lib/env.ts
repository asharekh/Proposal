import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url("DATABASE_URL must be a valid PostgreSQL connection string"),
  GEMINI_API_KEY: z.string().min(1, "GEMINI_API_KEY is required"),
  NEXTAUTH_SECRET: z.string().min(1, "NEXTAUTH_SECRET is required").default("default-development-secret-key-32-chars-long"),
  PUPPETEER_EXECUTABLE_PATH: z.string().optional(),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  MOCK_MODE: z.string().optional(),
  LANGFUSE_PUBLIC_KEY: z.string().optional(),
  LANGFUSE_SECRET_KEY: z.string().optional(),
  LANGFUSE_HOST: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

let envCache: Env | null = null;

export const getEnv = (): Env => {
  if (envCache) return envCache;

  // For testing/mocking ease, if MOCK_MODE is true, we provide default stubs to prevent startup crash
  const mockModeActive = process.env.MOCK_MODE === "true" || !process.env.GEMINI_API_KEY;

  const rawEnv = {
    DATABASE_URL: process.env.DATABASE_URL || (mockModeActive ? "postgresql://postgres:postgres@localhost:5432/postgres" : undefined),
    GEMINI_API_KEY: process.env.GEMINI_API_KEY || (mockModeActive ? "mock-api-key" : undefined),
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET || "default-development-secret-key-32-chars-long",
    PUPPETEER_EXECUTABLE_PATH: process.env.PUPPETEER_EXECUTABLE_PATH,
    NODE_ENV: process.env.NODE_ENV || "development",
    MOCK_MODE: mockModeActive ? "true" : process.env.MOCK_MODE,
    LANGFUSE_PUBLIC_KEY: process.env.LANGFUSE_PUBLIC_KEY,
    LANGFUSE_SECRET_KEY: process.env.LANGFUSE_SECRET_KEY,
    LANGFUSE_HOST: process.env.LANGFUSE_HOST,
  };

  const parsed = envSchema.safeParse(rawEnv);

  if (!parsed.success) {
    console.error("❌ Invalid environment variables:", parsed.error.flatten().fieldErrors);
    throw new Error(
      `Environment validation failed. Missing variables: ${Object.keys(parsed.error.flatten().fieldErrors).join(", ")}. If you just want to test the UI, set MOCK_MODE=true in your .env file.`
    );
  }

  envCache = parsed.data;
  return envCache;
};

// Validate immediately on load
if (typeof window === "undefined") {
  getEnv();
}
