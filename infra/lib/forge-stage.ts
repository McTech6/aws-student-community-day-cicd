import { type CfnOutput, Stage, type StageProps, Tags } from "aws-cdk-lib";
import type { Construct } from "constructs";
import { ApiStack } from "./stacks/api-stack";
import { DatabaseStack } from "./stacks/database-stack";
import { NetworkStack } from "./stacks/network-stack";
import { WebStack } from "./stacks/web-stack";

export interface ForgeStageProps extends StageProps {
  /** Lowercase environment name, used in stack names and tags. */
  readonly envName: "staging" | "production";
  readonly backupRetentionDays: number;
  readonly cloudFrontPrefixListId: string;
  /** Docker build context for the API image. */
  readonly repoRoot: string;
  /** The built React app (apps/web/dist). */
  readonly webDistPath: string;
}

/**
 * One complete environment of Forge. The pipeline deploys the same Stage
 * twice (staging, then production); only the props differ.
 */
export class ForgeStage extends Stage {
  readonly siteUrl: CfnOutput;

  constructor(scope: Construct, id: string, props: ForgeStageProps) {
    super(scope, id, props);

    // Fixed stack names so a stage deployed by hand and the same stage
    // deployed by the pipeline update the same CloudFormation stacks.
    const name = (stack: string) => `forge-${props.envName}-${stack}`;

    const network = new NetworkStack(this, "Network", {
      stackName: name("network"),
      cloudFrontPrefixListId: props.cloudFrontPrefixListId,
    });

    const database = new DatabaseStack(this, "Database", {
      stackName: name("database"),
      vpc: network.vpc,
      securityGroup: network.databaseSecurityGroup,
      backupRetentionDays: props.backupRetentionDays,
    });

    const api = new ApiStack(this, "Api", {
      stackName: name("api"),
      vpc: network.vpc,
      albSecurityGroup: network.albSecurityGroup,
      apiSecurityGroup: network.apiSecurityGroup,
      database: database.instance,
      repoRoot: props.repoRoot,
    });

    const web = new WebStack(this, "Web", {
      stackName: name("web"),
      loadBalancer: api.loadBalancer,
      originVerifySecret: api.originVerifySecret,
      webDistPath: props.webDistPath,
    });

    this.siteUrl = web.siteUrl;

    Tags.of(this).add("env", props.envName);
  }
}
