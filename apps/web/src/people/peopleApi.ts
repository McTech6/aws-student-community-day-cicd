import type { Person, PersonDraft, PersonId } from "./types";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

const UNREACHABLE = "Could not reach the Forge API. Is it running?";
const UNKNOWN_FAILURE = "Something went wrong. Try again.";

/** status 0 means the request never got an HTTP response (API down, CORS, offline). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly messages: readonly string[],
  ) {
    super(messages.join(" "));
    this.name = "ApiError";
  }
}

export async function fetchPeople(): Promise<readonly Person[]> {
  return request<readonly Person[]>("/people");
}

export async function createPerson(draft: PersonDraft): Promise<Person> {
  return request<Person>("/people", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(draft),
  });
}

export async function deletePerson(id: PersonId): Promise<void> {
  await request<null>(`/people/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, init);
  } catch {
    throw new ApiError(0, [UNREACHABLE]);
  }

  const body: unknown =
    response.status === 204 ? null : await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(response.status, readMessages(body));
  }
  return body as T;
}

/** Nest sends `message` as a string (409, 404) or a string[] (400 from ValidationPipe). */
function readMessages(body: unknown): readonly string[] {
  if (typeof body !== "object" || body === null || !("message" in body)) {
    return [UNKNOWN_FAILURE];
  }
  const { message } = body;
  if (typeof message === "string") {
    return [message];
  }
  if (Array.isArray(message)) {
    const texts = message.filter((item): item is string => typeof item === "string");
    if (texts.length > 0) {
      return texts;
    }
  }
  return [UNKNOWN_FAILURE];
}
