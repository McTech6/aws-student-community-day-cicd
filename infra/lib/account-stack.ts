import { CfnOutput, Stack, type StackProps } from "aws-cdk-lib";
import * as budgets from "aws-cdk-lib/aws-budgets";
import * as iam from "aws-cdk-lib/aws-iam";
import * as sns from "aws-cdk-lib/aws-sns";
import * as subscriptions from "aws-cdk-lib/aws-sns-subscriptions";
import * as ssm from "aws-cdk-lib/aws-ssm";
import type { Construct } from "constructs";

export const ALERTS_TOPIC_NAME = "forge-alerts";

export interface AccountStackProps extends StackProps {
  /** SSM parameter holding the email address for alerts (kept out of the repo). */
  readonly alertEmailParameter: string;
  /** Monthly cost budget in US dollars. */
  readonly monthlyBudgetUsd: number;
}

/**
 * Account-wide guardrails, deployed once before anything that costs money:
 * an SNS topic for alerts (budget now; pipeline and alarms later) and a
 * monthly cost budget that emails at 40% and 80% of actual spend and when
 * the forecast goes over 100%.
 */
export class AccountStack extends Stack {
  readonly alertsTopic: sns.Topic;

  constructor(scope: Construct, id: string, props: AccountStackProps) {
    super(scope, id, props);

    // Resolved by CloudFormation at deploy time, so the address never
    // appears in the repo or in the synthesized template.
    const alertEmail = ssm.StringParameter.valueForStringParameter(
      this,
      props.alertEmailParameter,
    );

    this.alertsTopic = new sns.Topic(this, "AlertsTopic", {
      topicName: ALERTS_TOPIC_NAME,
      displayName: "Forge alerts",
      enforceSSL: true,
    });
    this.alertsTopic.addSubscription(new subscriptions.EmailSubscription(alertEmail));

    // Budgets, pipeline notifications and CloudWatch alarms publish here.
    // Other stacks import the topic by name, so they cannot add this themselves.
    this.alertsTopic.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: "AllowAwsServicesToPublish",
        principals: [
          new iam.ServicePrincipal("budgets.amazonaws.com"),
          new iam.ServicePrincipal("codestar-notifications.amazonaws.com"),
          new iam.ServicePrincipal("cloudwatch.amazonaws.com"),
        ],
        actions: ["sns:Publish"],
        resources: [this.alertsTopic.topicArn],
        conditions: { StringEquals: { "aws:SourceAccount": this.account } },
      }),
    );

    const notifyTopic = [{ subscriptionType: "SNS", address: this.alertsTopic.topicArn }];
    const notification = (
      notificationType: "ACTUAL" | "FORECASTED",
      threshold: number,
    ): budgets.CfnBudget.NotificationWithSubscribersProperty => ({
      notification: {
        notificationType,
        comparisonOperator: "GREATER_THAN",
        threshold,
        thresholdType: "PERCENTAGE",
      },
      subscribers: notifyTopic,
    });

    const budget = new budgets.CfnBudget(this, "MonthlyBudget", {
      budget: {
        budgetName: "forge-monthly",
        budgetType: "COST",
        timeUnit: "MONTHLY",
        budgetLimit: { amount: props.monthlyBudgetUsd, unit: "USD" },
      },
      notificationsWithSubscribers: [
        notification("ACTUAL", 40),
        notification("ACTUAL", 80),
        notification("FORECASTED", 100),
      ],
    });
    // Budgets checks it can publish when the budget is created.
    budget.node.addDependency(this.alertsTopic);

    new CfnOutput(this, "AlertsTopicArn", { value: this.alertsTopic.topicArn });
  }
}
