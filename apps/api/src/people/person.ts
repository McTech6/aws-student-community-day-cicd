export const PERSON_ROLES = ["intern", "core"] as const;

export type PersonRole = (typeof PERSON_ROLES)[number];

export interface Person {
  id: string;
  name: string;
  email: string;
  role: PersonRole;
}
