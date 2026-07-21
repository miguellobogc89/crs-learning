// components/knowledge/intake/services/read-error-message.ts

export async function readErrorMessage(
  response: Response,
  fallback: string,
) {
  try {
    const body = (await response.json()) as {
      error?: string;
    };

    return body.error || fallback;
  } catch {
    return fallback;
  }
}