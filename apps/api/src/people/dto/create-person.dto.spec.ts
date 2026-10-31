import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { describe, expect, it } from "vitest";
import { CreatePersonDto } from "./create-person.dto";

/** Same options as the global ValidationPipe in main.ts. */
async function check(body: Record<string, unknown>) {
  const dto = plainToInstance(CreatePersonDto, body);
  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  const messages = errors.flatMap((error) => Object.values(error.constraints ?? {}));
  return { dto, messages };
}

describe("CreatePersonDto", () => {
  it("accepts a valid person and normalises name and email", async () => {
    const { dto, messages } = await check({
      name: "  Ada Lovelace ",
      email: " ADA@Forge.Test ",
      role: "core",
    });

    expect(messages).toEqual([]);
    expect(dto.name).toBe("Ada Lovelace");
    expect(dto.email).toBe("ada@forge.test");
  });

  it("allows the role to be left out", async () => {
    const { messages } = await check({ name: "Ada", email: "ada@forge.test" });

    expect(messages).toEqual([]);
  });

  it("rejects a name shorter than 2 characters", async () => {
    const { messages } = await check({ name: " A ", email: "ada@forge.test" });

    expect(messages).toContain("Name must be at least 2 characters.");
  });

  it("rejects a name longer than 80 characters", async () => {
    const { messages } = await check({ name: "A".repeat(81), email: "ada@forge.test" });

    expect(messages).toContain("Name must be at most 80 characters.");
  });

  it("rejects an email that is not an email", async () => {
    const { messages } = await check({ name: "Ada", email: "not-an-email" });

    expect(messages).toContain("Email must look like an email address.");
  });

  it("rejects a role other than intern or core", async () => {
    const { messages } = await check({
      name: "Ada",
      email: "ada@forge.test",
      role: "admin",
    });

    expect(messages).toContain("Role must be intern or core.");
  });

  it("rejects fields the API does not know", async () => {
    const { messages } = await check({
      name: "Ada",
      email: "ada@forge.test",
      isAdmin: true,
    });

    expect(messages).toContain("property isAdmin should not exist");
  });
});
