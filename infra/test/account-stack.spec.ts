import { App } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { beforeAll, describe, expect, it } from "vitest";
import { AccountStack } from "../lib/account-stack";

describe("AccountStack", () => {
  let template: Template;

  beforeAll(() => {
    const app = new App();
    const stack = new AccountStack(app, "TestAccount", {
      env: { account: "123456789012", region: "us-east-1" },
      alertEmailParameter: "/forge/alert-email",
      monthlyBudgetUsd: 25,
    });
    template = Template.fromStack(stack);
  });

  it("creates the alerts topic with an email subscription", () => {
    template.hasResourceProperties("AWS::SNS::Topic", { TopicName: "forge-alerts" });
    template.hasResourceProperties("AWS::SNS::Subscription", { Protocol: "email" });
  });

  it("reads the email from SSM instead of hard-coding it", () => {
    const json = JSON.stringify(template.toJSON());
    expect(json).not.toMatch(/@[a-z0-9-]+\.[a-z]+/i);
    template.hasParameter("*", {
      Type: "AWS::SSM::Parameter::Value<String>",
      Default: "/forge/alert-email",
    });
  });

  it("creates a $25 monthly cost budget with three alerts", () => {
    template.hasResourceProperties("AWS::Budgets::Budget", {
      Budget: {
        BudgetType: "COST",
        TimeUnit: "MONTHLY",
        BudgetLimit: { Amount: 25, Unit: "USD" },
      },
      NotificationsWithSubscribers: Match.arrayWith([
        Match.objectLike({
          Notification: Match.objectLike({ NotificationType: "FORECASTED", Threshold: 100 }),
        }),
      ]),
    });
    const budget = Object.values(template.findResources("AWS::Budgets::Budget"))[0];
    expect(budget.Properties.NotificationsWithSubscribers).toHaveLength(3);
  });

  it("lets Budgets, pipeline notifications and alarms publish, only from this account", () => {
    template.hasResourceProperties("AWS::SNS::TopicPolicy", {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Principal: {
              Service: [
                "budgets.amazonaws.com",
                "codestar-notifications.amazonaws.com",
                "cloudwatch.amazonaws.com",
              ],
            },
            Action: "sns:Publish",
            Condition: { StringEquals: { "aws:SourceAccount": "123456789012" } },
          }),
        ]),
      },
    });
  });
});
