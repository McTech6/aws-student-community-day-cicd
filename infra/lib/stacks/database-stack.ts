import { Duration, RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as rds from "aws-cdk-lib/aws-rds";
import type { Construct } from "constructs";

export interface DatabaseStackProps extends StackProps {
  readonly vpc: ec2.IVpc;
  readonly securityGroup: ec2.ISecurityGroup;
  readonly backupRetentionDays: number;
}

export const DATABASE_NAME = "forge";

/**
 * RDS PostgreSQL in the isolated subnets. RDS generates the password and
 * stores it in Secrets Manager; nobody ever types or sees it.
 */
export class DatabaseStack extends Stack {
  readonly instance: rds.DatabaseInstance;

  constructor(scope: Construct, id: string, props: DatabaseStackProps) {
    super(scope, id, props);

    this.instance = new rds.DatabaseInstance(this, "Postgres", {
      engine: rds.DatabaseInstanceEngine.postgres({ version: rds.PostgresEngineVersion.VER_17 }),
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.MICRO),
      vpc: props.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [props.securityGroup],
      publiclyAccessible: false,
      multiAz: false,
      allocatedStorage: 20,
      storageType: rds.StorageType.GP3,
      storageEncrypted: true,
      databaseName: DATABASE_NAME,
      // The entrypoint puts the password in a postgresql:// URL, so only
      // letters, digits and "-._" are allowed.
      credentials: rds.Credentials.fromGeneratedSecret("forge", {
        excludeCharacters: " !\"#$%&'()*+,/:;<=>?@[\\]^`{|}~",
      }),
      backupRetention: Duration.days(props.backupRetentionDays),
      // Workshop settings so `cdk destroy` leaves nothing behind. A real
      // production database would use SNAPSHOT and deletion protection.
      removalPolicy: RemovalPolicy.DESTROY,
      deletionProtection: false,
      deleteAutomatedBackups: true,
    });
  }
}
