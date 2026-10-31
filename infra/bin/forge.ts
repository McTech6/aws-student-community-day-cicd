import { existsSync } from "node:fs";
import * as path from "node:path";
import { App, Tags } from "aws-cdk-lib";
import { AccountStack } from "../lib/account-stack";
import { ForgeStage } from "../lib/forge-stage";

const app = new App();

const region = app.node.getContext("forge:region") as string;
const env = { account: process.env.CDK_DEFAULT_ACCOUNT, region };
const repoRoot = path.resolve(__dirname, "../..");
const webDistPath = path.join(repoRoot, "apps/web/dist");

if (!existsSync(path.join(webDistPath, "index.html"))) {
  throw new Error("apps/web/dist is missing. Build the web app first: npm run build:web");
}

new AccountStack(app, "ForgeAccount", {
  env,
  description: "Forge: alerts topic and monthly cost budget",
  alertEmailParameter: app.node.getContext("forge:alertEmailParameter") as string,
  monthlyBudgetUsd: Number(app.node.getContext("forge:monthlyBudgetUsd")),
});

new ForgeStage(app, "ForgeStaging", {
  env,
  envName: "staging",
  backupRetentionDays: 1,
  cloudFrontPrefixListId: app.node.getContext("forge:cloudFrontPrefixListId") as string,
  repoRoot,
  webDistPath,
});

Tags.of(app).add("project", "forge");
Tags.of(app).add("managed-by", "cdk");
