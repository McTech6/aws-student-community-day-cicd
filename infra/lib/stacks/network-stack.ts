import { Stack, type StackProps, Validations } from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import type { Construct } from "constructs";

export interface NetworkStackProps extends StackProps {
  /** AWS-managed prefix list of CloudFront's origin-facing IPs (same ID in every account per region). */
  readonly cloudFrontPrefixListId: string;
}

/**
 * VPC across 2 AZs with public subnets (load balancer, Fargate tasks) and
 * private isolated subnets (RDS, no route to the internet). No NAT Gateway:
 * it would cost ~$32/month per AZ.
 *
 * All security groups live here so the other stacks only consume them;
 * defining cross-stack rules elsewhere creates dependency cycles.
 */
export class NetworkStack extends Stack {
  readonly vpc: ec2.Vpc;
  readonly albSecurityGroup: ec2.SecurityGroup;
  readonly apiSecurityGroup: ec2.SecurityGroup;
  readonly databaseSecurityGroup: ec2.SecurityGroup;

  /**
   * Fixed AZs instead of a lookup: a lookup writes the account ID into
   * cdk.context.json, and the pipeline's synth step cannot do lookups.
   */
  override get availabilityZones(): string[] {
    return [`${this.region}a`, `${this.region}b`];
  }

  constructor(scope: Construct, id: string, props: NetworkStackProps) {
    super(scope, id, props);
    Validations.of(this).acknowledge({
      id: "CloudFormation-Validate::W3010",
      reason: "AZs are pinned on purpose; see availabilityZones above",
    });

    this.vpc = new ec2.Vpc(this, "Vpc", {
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        { name: "public", subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 },
        { name: "data", subnetType: ec2.SubnetType.PRIVATE_ISOLATED, cidrMask: 24 },
      ],
    });

    this.albSecurityGroup = new ec2.SecurityGroup(this, "AlbSecurityGroup", {
      vpc: this.vpc,
      description: "Load balancer: HTTP from CloudFront only",
    });
    // The prefix list counts as ~55 rules against the 60-rule quota, so keep it the only one.
    this.albSecurityGroup.addIngressRule(
      ec2.Peer.prefixList(props.cloudFrontPrefixListId),
      ec2.Port.tcp(80),
      "CloudFront origin-facing",
    );

    this.apiSecurityGroup = new ec2.SecurityGroup(this, "ApiSecurityGroup", {
      vpc: this.vpc,
      description: "API tasks: traffic from the load balancer only",
    });
    this.apiSecurityGroup.addIngressRule(this.albSecurityGroup, ec2.Port.tcp(3001), "Load balancer");

    this.databaseSecurityGroup = new ec2.SecurityGroup(this, "DatabaseSecurityGroup", {
      vpc: this.vpc,
      description: "PostgreSQL: API tasks only",
      allowAllOutbound: false,
    });
    this.databaseSecurityGroup.addIngressRule(this.apiSecurityGroup, ec2.Port.tcp(5432), "API tasks");
  }
}
