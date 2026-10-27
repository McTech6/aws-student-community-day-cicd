import { Transform } from "class-transformer";
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";
import { PERSON_ROLES, type PersonRole } from "../person";

function trimString(value: unknown): unknown {
  return typeof value === "string" ? value.trim() : value;
}

export class CreatePersonDto {
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(2, { message: "Name must be at least 2 characters." })
  @MaxLength(80, { message: "Name must be at most 80 characters." })
  name!: string;

  @Transform(({ value }) => {
    const trimmed = trimString(value);
    return typeof trimmed === "string" ? trimmed.toLowerCase() : trimmed;
  })
  @IsEmail({}, { message: "Email must look like an email address." })
  @MaxLength(254, { message: "Email must be at most 254 characters." })
  email!: string;

  @IsOptional()
  @IsIn(PERSON_ROLES, { message: "Role must be intern or core." })
  role?: PersonRole;
}
