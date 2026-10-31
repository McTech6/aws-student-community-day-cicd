import { ConflictException, NotFoundException } from "@nestjs/common";
import { Prisma, Role, type Person as PersonRow } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../prisma/prisma.service";
import { PeopleService } from "./people.service";

function prismaError(code: string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("Prisma error", {
    code,
    clientVersion: "test",
  });
}

function row(overrides: Partial<PersonRow> = {}): PersonRow {
  return {
    id: "p1",
    name: "Ada",
    email: "ada@forge.test",
    role: Role.INTERN,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

describe("PeopleService", () => {
  const person = {
    findMany: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
  };
  let service: PeopleService;

  beforeEach(() => {
    vi.resetAllMocks();
    service = new PeopleService({ person } as unknown as PrismaService);
  });

  describe("findAll", () => {
    it("returns people oldest first, in the API shape", async () => {
      person.findMany.mockResolvedValue([
        row(),
        row({ id: "p2", email: "grace@forge.test", role: Role.CORE }),
      ]);

      await expect(service.findAll()).resolves.toEqual([
        { id: "p1", name: "Ada", email: "ada@forge.test", role: "intern" },
        { id: "p2", name: "Ada", email: "grace@forge.test", role: "core" },
      ]);
      expect(person.findMany).toHaveBeenCalledWith({
        orderBy: { createdAt: "asc" },
      });
    });
  });

  describe("create", () => {
    it("trims the name and stores the email trimmed and lowercased", async () => {
      person.create.mockResolvedValue(row());

      await service.create({ name: "  Ada  ", email: "  ADA@Forge.TEST " });

      expect(person.create).toHaveBeenCalledWith({
        data: { name: "Ada", email: "ada@forge.test", role: Role.INTERN },
      });
    });

    it("defaults the role to intern and keeps an explicit role", async () => {
      person.create.mockResolvedValue(row());

      await service.create({ name: "Ada", email: "ada@forge.test" });
      await service.create({ name: "Grace", email: "grace@forge.test", role: "core" });

      expect(person.create.mock.calls[0][0].data.role).toBe(Role.INTERN);
      expect(person.create.mock.calls[1][0].data.role).toBe(Role.CORE);
    });

    it("turns a duplicate email into a 409 Conflict", async () => {
      person.create.mockRejectedValue(prismaError("P2002"));

      await expect(
        service.create({ name: "Ada", email: "ada@forge.test" }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it("rethrows any other database error", async () => {
      const failure = new Error("connection lost");
      person.create.mockRejectedValue(failure);

      await expect(
        service.create({ name: "Ada", email: "ada@forge.test" }),
      ).rejects.toBe(failure);
    });
  });

  describe("remove", () => {
    it("deletes the person by id", async () => {
      person.delete.mockResolvedValue(row());

      await service.remove("p1");

      expect(person.delete).toHaveBeenCalledWith({ where: { id: "p1" } });
    });

    it("turns an unknown id into a 404 Not Found", async () => {
      person.delete.mockRejectedValue(prismaError("P2025"));

      await expect(service.remove("missing")).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it("rethrows any other database error", async () => {
      const failure = new Error("connection lost");
      person.delete.mockRejectedValue(failure);

      await expect(service.remove("p1")).rejects.toBe(failure);
    });
  });
});
