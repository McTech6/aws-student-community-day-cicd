import { existsSync } from "node:fs";
import * as path from "node:path";
import { App, Tags } from "aws-cdk-lib";
import { ALERTS_TOPIC_NAME, AccountStack } from "../lib/account-stack";
import { PipelineStack } from "../lib/pipeline-stack";

const app = new App();

const context = (key: string) => app.node.getContext(`forge:${key}`) as string;
const env = { account: process.env.CDK_DEFAULT_ACCOUNT, region: context("region") };
const repoRoot = path.resolve(__dirname, "../..");
const webDistPath = path.join(repoRoot, "apps/web/dist");

if (!existsSync(path.join(webDistPath, "index.html"))) {
  throw new Error("apps/web/dist is missing. Build the web app first: npm run build:web");
}

// Deployed by hand, once per account.
new AccountStack(app, "ForgeAccount", {
  env,
  description: "Forge: alerts topic and monthly cost budget",
  alertEmailParameter: context("alertEmailParameter"),
  monthlyBudgetUsd: Number(context("monthlyBudgetUsd")),
});

// Deployed by hand once; after that it updates itself and deploys staging
// and production on every push to the branch.
new PipelineStack(app, "ForgePipeline", {
  env,
  description: "Forge: CI/CD pipeline and pull request checks",
  repository: context("repository"),
  branch: context("branch"),
  connectionArnParameter: context("connectionArnParameter"),
  alertsTopicName: ALERTS_TOPIC_NAME,
  cloudFrontPrefixListId: context("cloudFrontPrefixListId"),
  repoRoot,
  webDistPath,
});

Tags.of(app).add("project", "forge");
Tags.of(app).add("managed-by", "cdk");
