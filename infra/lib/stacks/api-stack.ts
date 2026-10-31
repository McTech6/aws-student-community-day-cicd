import { Duration, RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import { Platform } from "aws-cdk-lib/aws-ecr-assets";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as logs from "aws-cdk-lib/aws-logs";
import type * as rds from "aws-cdk-lib/aws-rds";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import type { Construct } from "constructs";
import { DATABASE_NAME } from "./database-stack";

export interface ApiStackProps extends StackProps {
  readonly vpc: ec2.IVpc;
  readonly albSecurityGroup: ec2.ISecurityGroup;
  readonly apiSecurityGroup: ec2.ISecurityGroup;
  readonly database: rds.DatabaseInstance;
  /** Docker build context: the repo root (the API image needs the workspace manifests). */
  readonly repoRoot: string;
}

export const ORIGIN_VERIFY_HEADER = "X-Origin-Verify";

/**
 * The NestJS API on ECS Fargate behind an Application Load Balancer.
 * The load balancer only answers requests that come through CloudFront
 * (prefix list on the security group plus a secret header on the listener).
 */
export class ApiStack extends Stack {
  readonly loadBalancer: elbv2.ApplicationLoadBalancer;
  readonly originVerifySecret: secretsmanager.Secret;
  readonly service: ecs.FargateService;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    const dbSecret = props.database.secret;
    if (!dbSecret) throw new Error("The database must have a generated secret");

    const cluster = new ecs.Cluster(this, "Cluster", { vpc: props.vpc });

    const taskDefinition = new ecs.FargateTaskDefinition(this, "TaskDefinition", {
      cpu: 256,
      memoryLimitMiB: 512,
      runtimePlatform: {
        cpuArchitecture: ecs.CpuArchitecture.X86_64,
        operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
      },
    });

    const logGroup = new logs.LogGroup(this, "Logs", {
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    taskDefinition.addContainer("api", {
      image: ecs.ContainerImage.fromAsset(props.repoRoot, {
        file: "apps/api/Dockerfile",
        platform: Platform.LINUX_AMD64,
      }),
      portMappings: [{ containerPort: 3001 }],
      environment: {
        PORT: "3001",
        DB_HOST: props.database.dbInstanceEndpointAddress,
        DB_PORT: props.database.dbInstanceEndpointPort,
        DB_NAME: DATABASE_NAME,
      },
      // ECS reads these from Secrets Manager when the task starts; they never
      // appear in the template, the task definition or the console.
      secrets: {
        DB_USER: ecs.Secret.fromSecretsManager(dbSecret, "username"),
        DB_PASSWORD: ecs.Secret.fromSecretsManager(dbSecret, "password"),
      },
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: "api", logGroup }),
    });

    this.service = new ecs.FargateService(this, "Service", {
      cluster,
      taskDefinition,
      desiredCount: 1,
      minHealthyPercent: 100,
      maxHealthyPercent: 200,
      // Public subnets with a public IP instead of a NAT Gateway; the security
      // group still only accepts traffic from the load balancer.
      assignPublicIp: true,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      securityGroups: [props.apiSecurityGroup],
      circuitBreaker: { enable: true, rollback: true },
      // New tasks run `prisma migrate deploy` before the server starts listening.
      healthCheckGracePeriod: Duration.seconds(120),
      enableExecuteCommand: true,
    });

    this.loadBalancer = new elbv2.ApplicationLoadBalancer(this, "LoadBalancer", {
      vpc: props.vpc,
      internetFacing: true,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      securityGroup: props.albSecurityGroup,
      dropInvalidHeaderFields: true,
    });

    this.originVerifySecret = new secretsmanager.Secret(this, "OriginVerifySecret", {
      description: "Header value CloudFront sends so the load balancer can reject direct traffic",
      generateSecretString: { excludePunctuation: true, passwordLength: 32 },
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const listener = this.loadBalancer.addListener("Http", {
      port: 80,
      open: false,
      defaultAction: elbv2.ListenerAction.fixedResponse(403, {
        contentType: "text/plain",
        messageBody: "Forbidden",
      }),
    });

    listener.addTargets("Api", {
      priority: 10,
      conditions: [
        elbv2.ListenerCondition.httpHeader(ORIGIN_VERIFY_HEADER, [
          this.originVerifySecret.secretValue.unsafeUnwrap(),
        ]),
      ],
      port: 3001,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targets: [this.service],
      healthCheck: {
        path: "/api/health",
        healthyThresholdCount: 2,
        interval: Duration.seconds(15),
      },
      // Old tasks drain quickly so a deploy finishes in minutes, not 5+.
      deregistrationDelay: Duration.seconds(30),
    });
  }
}
