import { App, Tags } from "aws-cdk-lib";
import { AccountStack } from "../lib/account-stack";

const app = new App();

const region = app.node.getContext("forge:region") as string;
const env = { account: process.env.CDK_DEFAULT_ACCOUNT, region };

new AccountStack(app, "ForgeAccount", {
  env,
  description: "Forge: alerts topic and monthly cost budget",
  alertEmailParameter: app.node.getContext("forge:alertEmailParameter") as string,
  monthlyBudgetUsd: Number(app.node.getContext("forge:monthlyBudgetUsd")),
});

Tags.of(app).add("project", "forge");
Tags.of(app).add("managed-by", "cdk");
