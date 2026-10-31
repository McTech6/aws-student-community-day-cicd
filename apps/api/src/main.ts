import "reflect-metadata";
import { Logger, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

const DEFAULT_PORT = 3001;
const DEFAULT_CORS_ORIGINS = "http://localhost:3000";

function readPort(): number {
  const port = Number(process.env.PORT ?? DEFAULT_PORT);
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`PORT must be a positive integer, got "${process.env.PORT}"`);
  }
  return port;
}

function readCorsOrigins(): string[] {
  return (process.env.CORS_ORIGINS ?? DEFAULT_CORS_ORIGINS)
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

async function bootstrap() {
  const port = readPort();
  const app = await NestFactory.create(AppModule);

  // In AWS the web app and the API share one CloudFront domain, so the
  // browser never makes a cross-origin call. CORS only matters for local
  // setups that skip the Vite proxy.
  app.enableCors({ origin: readCorsOrigins() });
  app.setGlobalPrefix("api");
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  // ECS sends SIGTERM before stopping a task; this lets Prisma disconnect.
  app.enableShutdownHooks();

  await app.listen(port);
  Logger.log(`Forge API listening on http://localhost:${port}/api`, "Bootstrap");
}

bootstrap();
