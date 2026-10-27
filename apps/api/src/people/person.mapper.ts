import { Role, type Person as PersonRow } from "@prisma/client";
import type { Person, PersonRole } from "./person";

const ROLE_TO_DB: Record<PersonRole, Role> = {
  intern: Role.INTERN,
  core: Role.CORE,
};

const ROLE_FROM_DB: Record<Role, PersonRole> = {
  [Role.INTERN]: "intern",
  [Role.CORE]: "core",
};

export function toDbRole(role: PersonRole): Role {
  return ROLE_TO_DB[role];
}

export function toPerson(row: PersonRow): Person {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: ROLE_FROM_DB[row.role],
  };
}
