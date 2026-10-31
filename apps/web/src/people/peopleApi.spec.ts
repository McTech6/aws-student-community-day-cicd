import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, createPerson, deletePerson, fetchPeople } from "./peopleApi";
import type { PersonId } from "./types";

const fetchMock = vi.fn<typeof fetch>();

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function apiErrorFrom(promise: Promise<unknown>): Promise<ApiError> {
  const error = await promise.catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(ApiError);
  return error as ApiError;
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("peopleApi", () => {
  it("loads people from /api/people", async () => {
    const people = [{ id: "p1", name: "Ada", email: "ada@forge.test", role: "intern" }];
    fetchMock.mockResolvedValue(json(people));

    await expect(fetchPeople()).resolves.toEqual(people);
    expect(fetchMock).toHaveBeenCalledWith("/api/people", undefined);
  });

  it("posts a new person as JSON", async () => {
    const saved = { id: "p1", name: "Ada", email: "ada@forge.test", role: "intern" };
    fetchMock.mockResolvedValue(json(saved, 201));

    await expect(
      createPerson({ name: "Ada", email: "ada@forge.test", role: "intern" }),
    ).resolves.toEqual(saved);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/people");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({
      name: "Ada",
      email: "ada@forge.test",
      role: "intern",
    });
  });

  it("deletes a person and accepts an empty 204 response", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    await expect(deletePerson("p 1" as PersonId)).resolves.toBeUndefined();
    expect(fetchMock.mock.calls[0][0]).toBe("/api/people/p%201");
  });

  it("reports an unreachable API as status 0", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    const error = await apiErrorFrom(fetchPeople());
    expect(error.status).toBe(0);
    expect(error.message).toBe("Could not reach the Forge API. Is it running?");
  });

  it("passes on a single Nest error message (409)", async () => {
    fetchMock.mockResolvedValue(
      json({ statusCode: 409, message: "That email is already on the roster." }, 409),
    );

    const error = await apiErrorFrom(
      createPerson({ name: "Ada", email: "ada@forge.test", role: "intern" }),
    );
    expect(error.status).toBe(409);
    expect(error.messages).toEqual(["That email is already on the roster."]);
  });

  it("passes on every validation message (400)", async () => {
    fetchMock.mockResolvedValue(
      json(
        {
          statusCode: 400,
          message: ["Name must be at least 2 characters.", "Email must look like an email address."],
        },
        400,
      ),
    );

    const error = await apiErrorFrom(
      createPerson({ name: "A", email: "nope", role: "intern" }),
    );
    expect(error.messages).toEqual([
      "Name must be at least 2 characters.",
      "Email must look like an email address.",
    ]);
  });

  it("falls back to a generic message when the error body is not JSON", async () => {
    fetchMock.mockResolvedValue(new Response("Bad Gateway", { status: 502 }));

    const error = await apiErrorFrom(fetchPeople());
    expect(error.status).toBe(502);
    expect(error.messages).toEqual(["Something went wrong. Try again."]);
  });
});
