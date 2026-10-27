export type PersonRole = "intern" | "core";

export type CreatePerson = {
  name: string;
  email: string;
  role?: PersonRole;
};

export type ProjectStatus = "idea" | "active" | "done";
export type TaskStatus = "todo" | "doing" | "done";
