/** Branded id so a raw string is not accepted where a Person id is required. */
export type PersonId = string & { readonly __brand: "PersonId" };

export const PERSON_ROLES = ["intern", "core"] as const;
export type PersonRole = (typeof PERSON_ROLES)[number];

export interface Person {
  readonly id: PersonId;
  readonly name: string;
  readonly email: string;
  readonly role: PersonRole;
}

export interface PersonDraft {
  readonly name: string;
  readonly email: string;
  readonly role: PersonRole;
}


export type LoadState =
  | { readonly status: "idle" }
  | { readonly status: "loading" }
  | { readonly status: "ready" }
  | { readonly status: "error"; readonly message: string };

export type DraftField = "name" | "email";
export type DraftErrors = Partial<Record<DraftField, string>>;

export function isPersonRole(value: string): value is PersonRole {
  return (PERSON_ROLES as readonly string[]).includes(value);
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isDuplicateEmail(
  people: readonly Person[],
  email: string,
  exceptId?: PersonId,
): boolean {
  const key = normalizeEmail(email);
  if (key === "") {
    return false;
  }
  return people.some(
    (person) =>
      person.id !== exceptId && normalizeEmail(person.email) === key,
  );
}

/** Only catches empty fields. The API owns the real rules (length, format, duplicates). */
export function findDraftErrors(draft: PersonDraft): DraftErrors {
  const errors: DraftErrors = {};
  if (draft.name.trim() === "") {
    errors.name = "Name is required.";
  }
  if (draft.email.trim() === "") {
    errors.email = "Email is required.";
  }
  return errors;
}

export function formatPersonCount(count: number): string {
  return count === 1 ? "1 person" : `${count} people`;
}

export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
