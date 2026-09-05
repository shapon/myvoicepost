// Strips HTML tags from user-entered text before it is sent to the server.
const HTML_TAGS_REGEX = /<[^>]*>/g;

// Fields that must be sent byte-for-byte (credentials/tokens) — never strip these.
const SENSITIVE_FIELD_REGEX = /password|passwd|pwd|token|secret|^otp$|^code$|^pin$/i;

export function stripHtmlTags(input: string): string {
  return input.replace(HTML_TAGS_REGEX, "");
}

// Recursively strips HTML tags from every string value in a request payload,
// skipping sensitive fields (passwords, tokens, OTP codes) so they reach the
// server unmodified.
export function sanitizePayload<T>(data: T): T {
  if (typeof data === "string") {
    return stripHtmlTags(data) as unknown as T;
  }
  if (Array.isArray(data)) {
    return data.map((item) => sanitizePayload(item)) as unknown as T;
  }
  if (
    data !== null &&
    typeof data === "object" &&
    !(data instanceof File) &&
    !(data instanceof Blob) &&
    !(data instanceof FormData)
  ) {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      result[key] = SENSITIVE_FIELD_REGEX.test(key) ? value : sanitizePayload(value);
    }
    return result as T;
  }
  return data;
}
