import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from "@nestjs/common";
import { CreatePersonDto } from "./dto/create-person.dto";
import { PeopleService } from "./people.service";

@Controller("people")
export class PeopleController {
  constructor(private readonly peopleService: PeopleService) {}

  @Get()
  findAll() {
    return this.peopleService.findAll();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() draft: CreatePersonDto) {
    return this.peopleService.create(draft);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param("id") id: string) {
    return this.peopleService.remove(id);
  }
}
