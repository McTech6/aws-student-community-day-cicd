import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { App } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { beforeAll, describe, expect, it } from "vitest";
import { PipelineStack } from "../lib/pipeline-stack";

describe("PipelineStack", () => {
  let template: Template;
  let stages: { Name: string; Actions: { Name: string; RunOrder: number }[] }[];

  beforeAll(() => {
    const webDistPath = mkdtempSync(path.join(tmpdir(), "forge-web-"));
    writeFileSync(path.join(webDistPath, "index.html"), "<!doctype html>");

    const app = new App();
    const stack = new PipelineStack(app, "TestPipeline", {
      env: { account: "123456789012", region: "us-east-1" },
      repository: "octocat/forge",
      branch: "main",
      connectionArnParameter: "/forge/github-connection-arn",
      alertsTopicName: "forge-alerts",
      cloudFrontPrefixListId: "pl-3b927c52",
      repoRoot: path.resolve(__dirname, "../.."),
      webDistPath,
    });
    template = Template.fromStack(stack);
    const pipeline = Object.values(template.findResources("AWS::CodePipeline::Pipeline"))[0];
    stages = pipeline.Properties.Stages;
  }, 60_000);

  const actionNames = (stage: string) =>
    stages
      .find((s) => s.Name === stage)!
      .Actions.sort((a, b) => a.RunOrder - b.RunOrder)
      .map((a) => a.Name);

  it("is a V2 pipeline that goes source, build, self-update, assets, staging, production", () => {
    template.hasResourceProperties("AWS::CodePipeline::Pipeline", { PipelineType: "V2" });
    expect(stages.map((s) => s.Name)).toEqual([
      "Source",
      "Build",
      "UpdatePipeline",
      "Assets",
      "Staging",
      "Production",
    ]);
  });

  it("smoke tests staging after deploying it", () => {
    expect(actionNames("Staging").at(-1)).toBe("SmokeTest");
  });

  it("waits for a manual approval before touching production, then smoke tests it", () => {
    const production = actionNames("Production");
    expect(production[0]).toBe("PromoteToProduction");
    expect(production.at(-1)).toBe("SmokeTest");
  });

  it("reads the GitHub connection from SSM instead of hard-coding it", () => {
    template.hasParameter("*", {
      Type: "AWS::SSM::Parameter::Value<String>",
      Default: "/forge/github-connection-arn",
    });
    expect(JSON.stringify(template.toJSON())).not.toMatch(/arn:aws:code(star-)?connections/);
  });

  it("does not create a KMS key (single account)", () => {
    template.resourceCountIs("AWS::KMS::Key", 0);
  });

  it("emails on failure, success and when approval is needed", () => {
    template.hasResourceProperties("AWS::CodeStarNotifications::NotificationRule", {
      EventTypeIds: Match.arrayWith([
        "codepipeline-pipeline-pipeline-execution-failed",
        "codepipeline-pipeline-manual-approval-needed",
      ]),
    });
  });

  describe("pull request checks", () => {
    it("run on pull requests into main and report back to GitHub", () => {
      template.hasResourceProperties("AWS::CodeBuild::Project", {
        Name: "forge-pr-checks",
        Source: Match.objectLike({
          Type: "GITHUB",
          ReportBuildStatus: true,
          Auth: Match.objectLike({ Type: "CODECONNECTIONS" }),
        }),
        Triggers: Match.objectLike({
          Webhook: true,
          FilterGroups: [
            Match.arrayWith([
              { Type: "EVENT", Pattern: Match.stringLikeRegexp("PULL_REQUEST_CREATED") },
              { Type: "BASE_REF", Pattern: "refs/heads/main" },
            ]),
          ],
        }),
      });
    });

    it("require a maintainer's approval for pull requests from forks", () => {
      template.hasResourceProperties("AWS::CodeBuild::Project", {
        Name: "forge-pr-checks",
        Triggers: Match.objectLike({
          PullRequestBuildPolicy: Match.objectLike({ RequiresCommentApproval: "FORK_PULL_REQUESTS" }),
        }),
      });
    });

    it("are created only after their role may use the GitHub connection", () => {
      const project = Object.values(template.findResources("AWS::CodeBuild::Project")).find(
        (p) => p.Properties.Name === "forge-pr-checks",
      )!;
      const policies = template.findResources("AWS::IAM::Policy");
      const connectionPolicyId = Object.keys(policies).find((id) =>
        JSON.stringify(policies[id].Properties.PolicyDocument).includes(
          "codeconnections:GetConnectionToken",
        ),
      );
      expect(connectionPolicyId).toBeDefined();
      expect(project.DependsOn).toContain(connectionPolicyId);
    });

    it("scan for secrets before installing anything", () => {
      const project = Object.values(template.findResources("AWS::CodeBuild::Project")).find(
        (p) => p.Properties.Name === "forge-pr-checks",
      )!;
      const buildSpec = JSON.parse(project.Properties.Source.BuildSpec);
      expect(buildSpec.phases.install.commands[0]).toBe("bash scripts/secret-scan.sh");
    });
  });
});
