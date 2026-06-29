export const DEMO_TENANT_ID = "a0000000-0000-0000-0000-000000000001";

export const getTenantId = (): string => {
  return DEMO_TENANT_ID;
};

// Auto-detect if we should run in Mock Mode
// Activated if explicitly requested via env, or if API keys are missing.
export const isMockMode = (): boolean => {
  if (process.env.MOCK_MODE === "true") {
    return true;
  }
  // Fall back to mock if API keys are not provided
  const hasGeminiKey = !!process.env.GEMINI_API_KEY;
  return !hasGeminiKey;
};
