import { PrismaClient, ProjectStatus, Role, TaskStatus } from "@prisma/client";

const prisma = new PrismaClient();

const PEOPLE = [
  { name: "Tidding Binda", email: "tidding@forge.test", role: Role.CORE },
  { name: "Ramsey Binda", email: "ramsey@forge.test", role: Role.INTERN },
  { name: "Tidding Ramsey Binda", email: "binda@forge.test", role: Role.INTERN },
] as const;

const PROJECT_ID = "seed-project-forge-onboarding";
const TASK_ID = "seed-task-people-api";

async function main(): Promise<void> {
  for (const person of PEOPLE) {
    await prisma.person.upsert({
      where: { email: person.email },
      update: { name: person.name, role: person.role },
      create: person,
    });
  }

  const project = await prisma.project.upsert({
    where: { id: PROJECT_ID },
    update: {},
    create: {
      id: PROJECT_ID,
      name: "Forge onboarding",
      status: ProjectStatus.ACTIVE,
    },
  });

  await prisma.task.upsert({
    where: { id: TASK_ID },
    update: {},
    create: {
      id: TASK_ID,
      title: "Wire People to Prisma",
      status: TaskStatus.DOING,
      project: { connect: { id: project.id } },
      assignee: { connect: { email: "ramsey@forge.test" } },
    },
  });
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
