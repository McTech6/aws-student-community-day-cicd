import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CreatePersonDto } from "./dto/create-person.dto";
import { Person } from "./person";
import { toDbRole, toPerson } from "./person.mapper";

const UNIQUE_CONSTRAINT_FAILED = "P2002";
const RECORD_NOT_FOUND = "P2025";

function isPrismaError(error: unknown, code: string): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === code
  );
}

@Injectable()
export class PeopleService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<Person[]> {
    const rows = await this.prisma.person.findMany({
      orderBy: { createdAt: "asc" },
    });
    return rows.map(toPerson);
  }

  async create(draft: CreatePersonDto): Promise<Person> {
    try {
      const row = await this.prisma.person.create({
        data: {
          name: draft.name.trim(),
          email: draft.email.trim().toLowerCase(),
          role: toDbRole(draft.role ?? "intern"),
        },
      });
      return toPerson(row);
    } catch (error) {
      if (isPrismaError(error, UNIQUE_CONSTRAINT_FAILED)) {
        throw new ConflictException("That email is already on the roster.");
      }
      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    try {
      await this.prisma.person.delete({ where: { id } });
    } catch (error) {
      if (isPrismaError(error, RECORD_NOT_FOUND)) {
        throw new NotFoundException("That person is not on the roster.");
      }
      throw error;
    }
  }
}
