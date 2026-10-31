import { describe, expect, it } from "vitest";
import {
  errorMessage,
  findDraftErrors,
  formatPersonCount,
  isDuplicateEmail,
  isPersonRole,
  normalizeEmail,
  type Person,
  type PersonId,
} from "./types";

const ada: Person = {
  id: "p1" as PersonId,
  name: "Ada",
  email: "ada@forge.test",
  role: "intern",
};

describe("normalizeEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeEmail("  ADA@Forge.Test ")).toBe("ada@forge.test");
  });
});

describe("isDuplicateEmail", () => {
  it("matches regardless of case and spaces", () => {
    expect(isDuplicateEmail([ada], " ADA@forge.test")).toBe(true);
  });

  it("ignores the person being edited", () => {
    expect(isDuplicateEmail([ada], "ada@forge.test", ada.id)).toBe(false);
  });

  it("never treats an empty email as a duplicate", () => {
    expect(isDuplicateEmail([ada], "   ")).toBe(false);
  });
});

describe("findDraftErrors", () => {
  it("flags empty name and email", () => {
    expect(findDraftErrors({ name: " ", email: "", role: "intern" })).toEqual({
      name: "Name is required.",
      email: "Email is required.",
    });
  });

  it("returns no errors for a filled-in draft", () => {
    expect(findDraftErrors({ name: "Ada", email: "ada@forge.test", role: "core" })).toEqual({});
  });
});

describe("formatPersonCount", () => {
  it.each([
    [0, "0 people"],
    [1, "1 person"],
    [2, "2 people"],
  ])("formats %i as %s", (count, expected) => {
    expect(formatPersonCount(count)).toBe(expected);
  });
});

describe("isPersonRole", () => {
  it("accepts only intern and core", () => {
    expect(isPersonRole("intern")).toBe(true);
    expect(isPersonRole("core")).toBe(true);
    expect(isPersonRole("admin")).toBe(false);
  });
});

describe("errorMessage", () => {
  it("uses the error message, or the fallback for non-errors", () => {
    expect(errorMessage(new Error("boom"), "fallback")).toBe("boom");
    expect(errorMessage("not an error", "fallback")).toBe("fallback");
  });
});
