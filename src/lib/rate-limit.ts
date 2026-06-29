interface RateLimitRecord {
  timestamps: number[];
}

const rateLimitMap = new Map<string, RateLimitRecord>();

// Clean up expired entries (older than 1 minute) every 5 minutes
if (typeof window === "undefined") {
  setInterval(() => {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    
    for (const [key, record] of rateLimitMap.entries()) {
      record.timestamps = record.timestamps.filter((t) => t > oneMinuteAgo);
      if (record.timestamps.length === 0) {
        rateLimitMap.delete(key);
      }
    }
    console.log(`[Rate Limiter] Periodic cleanup ran. Active rate-limit keys: ${rateLimitMap.size}`);
  }, 300000); // 5 minutes
}

/**
 * Check if the request exceeds rate limit (max 10 requests / minute per IP/Endpoint)
 * Returns true if allowed, false if rate limited.
 */
export const rateLimit = (ip: string, endpoint: string, limit: number = 10): boolean => {
  const key = `${ip}:${endpoint}`;
  const now = Date.now();
  const oneMinuteAgo = now - 60000;

  let record = rateLimitMap.get(key);
  if (!record) {
    record = { timestamps: [] };
    rateLimitMap.set(key, record);
  }

  // Filter timestamps within the last 1 minute
  record.timestamps = record.timestamps.filter((t) => t > oneMinuteAgo);

  if (record.timestamps.length >= limit) {
    return false;
  }

  // Record current request timestamp
  record.timestamps.push(now);
  return true;
};
export default rateLimit;
