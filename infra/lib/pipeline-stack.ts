import { Duration, RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib";
import * as codebuild from "aws-cdk-lib/aws-codebuild";
import * as codepipeline from "aws-cdk-lib/aws-codepipeline";
import * as notifications from "aws-cdk-lib/aws-codestarnotifications";
import * as iam from "aws-cdk-lib/aws-iam";
import * as logs from "aws-cdk-lib/aws-logs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as sns from "aws-cdk-lib/aws-sns";
import * as ssm from "aws-cdk-lib/aws-ssm";
import * as pipelines from "aws-cdk-lib/pipelines";
import type { Construct } from "constructs";
import { ForgeStage } from "./forge-stage";

export interface PipelineStackProps extends StackProps {
  /** GitHub repository as "owner/name". */
  readonly repository: string;
  readonly branch: string;
  /** SSM parameter holding the CodeConnections connection ARN (kept out of the repo). */
  readonly connectionArnParameter: string;
  readonly alertsTopicName: string;
  readonly cloudFrontPrefixListId: string;
  readonly repoRoot: string;
  readonly webDistPath: string;
}

const BUILD_IMAGE = codebuild.LinuxBuildImage.STANDARD_8_0;

/** JUnit files written by Vitest when CI=true; CodeBuild shows them under "Reports". */
const TEST_REPORTS = {
  tests: {
    files: ["apps/api/reports/junit.xml", "apps/web/reports/junit.xml", "infra/reports/junit.xml"],
    "file-format": "JUNITXML",
  },
};

/**
 * Continuous delivery for Forge, all on AWS:
 *
 *   push to main -> Source -> Build (secret scan, lint, typecheck, test, audit,
 *   build, cdk synth) -> UpdatePipeline (self-mutation) -> Assets (Docker image,
 *   web files) -> Staging (deploy, smoke test) -> approval -> Production
 *   (deploy, smoke test)
 *
 * Plus a CodeBuild project that runs the same checks on every pull request and
 * reports a status back to GitHub.
 */
export class PipelineStack extends Stack {
  constructor(scope: Construct, id: string, props: PipelineStackProps) {
    super(scope, id, props);

    const connectionArn = ssm.StringParameter.valueForStringParameter(
      this,
      props.connectionArnParameter,
    );
    const alertsTopic = sns.Topic.fromTopicArn(
      this,
      "AlertsTopic",
      this.formatArn({ service: "sns", resource: props.alertsTopicName }),
    );

    const logGroup = new logs.LogGroup(this, "BuildLogs", {
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const artifactBucket = new s3.Bucket(this, "Artifacts", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      lifecycleRules: [{ expiration: Duration.days(30) }],
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const source = pipelines.CodePipelineSource.connection(props.repository, props.branch, {
      connectionArn,
    });

    const synth = new pipelines.CodeBuildStep("Synth", {
      input: source,
      env: { CI: "true" },
      installCommands: ["bash scripts/secret-scan.sh", "npm ci --no-audit --no-fund"],
      commands: ["npm run ci", "cd infra", "npx cdk synth"],
      primaryOutputDirectory: "infra/cdk.out",
      partialBuildSpec: codebuild.BuildSpec.fromObject({ reports: TEST_REPORTS }),
    });

    const pipeline = new pipelines.CodePipeline(this, "Pipeline", {
      pipelineName: "forge",
      pipelineType: codepipeline.PipelineType.V2,
      synth,
      artifactBucket,
      // Single account: no KMS key for cross-account artifacts (saves $1/month).
      crossAccountKeys: false,
      codeBuildDefaults: {
        buildEnvironment: { buildImage: BUILD_IMAGE, computeType: codebuild.ComputeType.MEDIUM },
        partialBuildSpec: codebuild.BuildSpec.fromObject({
          phases: { install: { "runtime-versions": { nodejs: 22 } } },
        }),
        logging: { cloudWatch: { logGroup } },
        timeout: Duration.minutes(30),
      },
    });

    const stageProps = {
      env: { account: this.account, region: this.region },
      cloudFrontPrefixListId: props.cloudFrontPrefixListId,
      repoRoot: props.repoRoot,
      webDistPath: props.webDistPath,
    };

    const staging = new ForgeStage(this, "Staging", {
      ...stageProps,
      envName: "staging",
      backupRetentionDays: 1,
    });
    pipeline.addStage(staging, { post: [smokeTest(source, staging)] });

    const production = new ForgeStage(this, "Production", {
      ...stageProps,
      envName: "production",
      backupRetentionDays: 7,
    });
    pipeline.addStage(production, {
      pre: [
        new pipelines.ManualApprovalStep("PromoteToProduction", {
          comment: "Staging is deployed and its smoke tests passed. Approve to release to production.",
        }),
      ],
      post: [smokeTest(source, production)],
    });

    pipeline.buildPipeline();

    new notifications.NotificationRule(this, "PipelineNotifications", {
      notificationRuleName: "forge-pipeline",
      source: pipeline.pipeline,
      events: [
        "codepipeline-pipeline-pipeline-execution-failed",
        "codepipeline-pipeline-manual-approval-needed",
        "codepipeline-pipeline-pipeline-execution-succeeded",
      ],
      targets: [alertsTopic],
      detailType: notifications.DetailType.BASIC,
    });

    this.createPullRequestChecks(props, connectionArn, logGroup);
  }

  /**
   * Runs on every pull request into the main branch and reports a status back
   * to GitHub. The buildspec lives here, not in the repo, so a pull request
   * cannot change which checks run. The role has no AWS permissions beyond
   * logs and reports, so code in a pull request has nothing to steal.
   */
  private createPullRequestChecks(
    props: PipelineStackProps,
    connectionArn: string,
    logGroup: logs.ILogGroup,
  ) {
    const [owner, repo] = props.repository.split("/");

    const project = new codebuild.Project(this, "PullRequestChecks", {
      projectName: "forge-pr-checks",
      description: "Lint, typecheck, test, audit, secret scan and build for pull requests",
      source: codebuild.Source.gitHub({
        owner,
        repo,
        webhook: true,
        reportBuildStatus: true,
        webhookFilters: [
          codebuild.FilterGroup.inEventOf(
            codebuild.EventAction.PULL_REQUEST_CREATED,
            codebuild.EventAction.PULL_REQUEST_UPDATED,
            codebuild.EventAction.PULL_REQUEST_REOPENED,
          ).andBaseBranchIs(props.branch),
        ],
      }),
      environment: {
        buildImage: BUILD_IMAGE,
        computeType: codebuild.ComputeType.MEDIUM,
        privileged: true, // docker build
      },
      cache: codebuild.Cache.local(codebuild.LocalCacheMode.DOCKER_LAYER),
      timeout: Duration.minutes(20),
      logging: { cloudWatch: { logGroup } },
      buildSpec: codebuild.BuildSpec.fromObject({
        version: "0.2",
        env: { variables: { CI: "true" } },
        phases: {
          install: {
            "runtime-versions": { nodejs: 22 },
            commands: ["bash scripts/secret-scan.sh", "npm ci --no-audit --no-fund"],
          },
          build: {
            commands: [
              "npm run ci",
              "docker build -f apps/api/Dockerfile -t forge-api:pr .",
              "cd infra && npx cdk synth --quiet",
            ],
          },
        },
        reports: TEST_REPORTS,
      }),
    });

    // Authenticate to GitHub through the CodeConnections GitHub App instead of
    // a personal access token. Pull requests from forks wait for a maintainer
    // to comment before they run.
    const cfnProject = project.node.defaultChild as codebuild.CfnProject;
    cfnProject.addPropertyOverride("Source.Auth", {
      Type: "CODECONNECTIONS",
      Resource: connectionArn,
    });
    cfnProject.addPropertyOverride("Triggers.PullRequestBuildPolicy", {
      RequiresCommentApproval: "FORK_PULL_REQUESTS",
      ApproverRoles: ["GITHUB_WRITE", "GITHUB_MAINTAIN", "GITHUB_ADMIN"],
    });
    project.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          "codeconnections:UseConnection",
          "codeconnections:GetConnectionToken",
          "codestar-connections:UseConnection",
          "codestar-connections:GetConnectionToken",
        ],
        resources: [connectionArn],
      }),
    );
  }
}

function smokeTest(source: pipelines.CodePipelineSource, stage: ForgeStage) {
  return new pipelines.CodeBuildStep("SmokeTest", {
    input: source,
    envFromCfnOutputs: { SITE_URL: stage.siteUrl },
    commands: ['bash scripts/smoke-test.sh "$SITE_URL"'],
  });
}
