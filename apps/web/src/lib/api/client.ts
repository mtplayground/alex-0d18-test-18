interface ApiErrorShape {
  error: {
    message: string;
  };
}

function hasErrorMessage(body: unknown): body is ApiErrorShape {
  return (
    body !== null &&
    typeof body === "object" &&
    "error" in body &&
    typeof body.error === "object" &&
    body.error !== null &&
    "message" in body.error &&
    typeof body.error.message === "string"
  );
}

export function parseApiResponseText(responseText: string): unknown {
  if (responseText.trim() === "") {
    return {};
  }

  return JSON.parse(responseText) as unknown;
}

export async function parseApiResponseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    return (await response.json()) as unknown;
  }

  return await response.text();
}

export function apiErrorFromBody(body: unknown, fallbackMessage: string): Error {
  return new Error(hasErrorMessage(body) ? body.error.message : fallbackMessage);
}

export async function apiErrorFromResponse(
  response: Response,
  fallbackMessage: string,
): Promise<Error> {
  return apiErrorFromBody(await parseApiResponseBody(response), fallbackMessage);
}

export async function requestJson<T>(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  fallbackMessage: string,
): Promise<T> {
  const response = await fetch(input, init);
  const body = await parseApiResponseBody(response);

  if (!response.ok) {
    throw apiErrorFromBody(body, fallbackMessage);
  }

  return body as T;
}
