import { Langfuse } from "langfuse";
import { getEnv } from "./env";

let langfuseInstance: Langfuse | null = null;

export const getLangfuse = (): Langfuse | null => {
  if (langfuseInstance) return langfuseInstance;

  try {
    const env = getEnv();
    const publicKey = env.LANGFUSE_PUBLIC_KEY;
    const secretKey = env.LANGFUSE_SECRET_KEY;
    const baseUrl = env.LANGFUSE_HOST || "https://cloud.langfuse.com";

    if (!publicKey || !secretKey) {
      // Return null quietly to keep app operational if telemetry is not configured
      return null;
    }

    langfuseInstance = new Langfuse({
      publicKey,
      secretKey,
      baseUrl,
      flushAt: 1, // Flush telemetry immediately inside edge/serverless contexts
    });

    console.log("[Langfuse] Tracing helper initialized successfully.");
    return langfuseInstance;
  } catch (err) {
    console.warn("[Langfuse] Helper failed to initialize:", err);
    return null;
  }
};
