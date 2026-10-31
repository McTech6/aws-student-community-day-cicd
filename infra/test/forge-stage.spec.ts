import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { App, type Stack } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { beforeAll, describe, expect, it } from "vitest";
import { ForgeStage } from "../lib/forge-stage";

describe("ForgeStage", () => {
  const templates: Record<string, Template> = {};
  const stackNames: Record<string, string> = {};

  beforeAll(() => {
    // Tests run before the web build in `npm run ci`, so use a stand-in.
    const webDistPath = mkdtempSync(path.join(tmpdir(), "forge-web-"));
    writeFileSync(path.join(webDistPath, "index.html"), "<!doctype html>");

    const app = new App();
    const stage = new ForgeStage(app, "TestStaging", {
      env: { account: "123456789012", region: "us-east-1" },
      envName: "staging",
      backupRetentionDays: 1,
      cloudFrontPrefixListId: "pl-3b927c52",
      repoRoot: path.resolve(__dirname, "../.."),
      webDistPath,
    });
    for (const id of ["Network", "Database", "Api", "Web"]) {
      const stack = stage.node.findChild(id) as Stack;
      templates[id] = Template.fromStack(stack);
      stackNames[id] = stack.stackName;
    }
  }, 60_000);

  it("uses fixed stack names so the pipeline updates the same stacks", () => {
    expect(Object.values(stackNames)).toEqual([
      "forge-staging-network",
      "forge-staging-database",
      "forge-staging-api",
      "forge-staging-web",
    ]);
  });

  describe("network", () => {
    it("has no NAT Gateway", () => {
      templates.Network.resourceCountIs("AWS::EC2::NatGateway", 0);
    });

    it("only lets CloudFront reach the load balancer, and only the API reach the database", () => {
      const rules = Object.values(
        templates.Network.findResources("AWS::EC2::SecurityGroupIngress"),
      ).map((r) => r.Properties);
      expect(rules).toHaveLength(3);
      expect(rules).toContainEqual(
        expect.objectContaining({ FromPort: 80, SourcePrefixListId: "pl-3b927c52" }),
      );
      expect(rules).toContainEqual(expect.objectContaining({ FromPort: 3001 }));
      expect(rules).toContainEqual(expect.objectContaining({ FromPort: 5432 }));
      expect(rules.some((r) => r.CidrIp === "0.0.0.0/0")).toBe(false);
    });
  });

  describe("database", () => {
    it("is a private, encrypted PostgreSQL 17 db.t4g.micro", () => {
      templates.Database.hasResourceProperties("AWS::RDS::DBInstance", {
        Engine: "postgres",
        EngineVersion: "17",
        DBInstanceClass: "db.t4g.micro",
        PubliclyAccessible: false,
        StorageEncrypted: true,
      });
    });

    it("has RDS generate a URL-safe password into Secrets Manager", () => {
      const secret = Object.values(
        templates.Database.findResources("AWS::SecretsManager::Secret"),
      )[0];
      const excluded: string = secret.Properties.GenerateSecretString.ExcludeCharacters;
      for (const ch of [":", "/", "@", "?", "#", "%", "&", "+", "=", " "]) {
        expect(excluded).toContain(ch);
      }
    });
  });

  describe("api", () => {
    it("injects database credentials from Secrets Manager, not as plain environment variables", () => {
      const taskDef = Object.values(
        templates.Api.findResources("AWS::ECS::TaskDefinition"),
      )[0];
      const container = taskDef.Properties.ContainerDefinitions[0];
      expect(container.Secrets.map((s: { Name: string }) => s.Name).sort()).toEqual([
        "DB_PASSWORD",
        "DB_USER",
      ]);
      const envNames = container.Environment.map((e: { Name: string }) => e.Name);
      expect(envNames).not.toContain("DB_PASSWORD");
      expect(envNames).not.toContain("DATABASE_URL");
    });

    it("rolls back failed deployments and gives migrations time to run", () => {
      templates.Api.hasResourceProperties("AWS::ECS::Service", {
        DeploymentConfiguration: {
          DeploymentCircuitBreaker: { Enable: true, Rollback: true },
        },
        HealthCheckGracePeriodSeconds: 120,
      });
    });

    it("health-checks /api/health", () => {
      templates.Api.hasResourceProperties("AWS::ElasticLoadBalancingV2::TargetGroup", {
        HealthCheckPath: "/api/health",
      });
    });

    it("rejects requests to the load balancer that lack the CloudFront header", () => {
      templates.Api.hasResourceProperties("AWS::ElasticLoadBalancingV2::Listener", {
        DefaultActions: [
          Match.objectLike({
            Type: "fixed-response",
            FixedResponseConfig: Match.objectLike({ StatusCode: "403" }),
          }),
        ],
      });
      templates.Api.hasResourceProperties("AWS::ElasticLoadBalancingV2::ListenerRule", {
        Conditions: [
          Match.objectLike({
            Field: "http-header",
            HttpHeaderConfig: Match.objectLike({ HttpHeaderName: "X-Origin-Verify" }),
          }),
        ],
      });
    });
  });

  describe("web", () => {
    it("keeps the bucket private", () => {
      templates.Web.hasResourceProperties("AWS::S3::Bucket", {
        PublicAccessBlockConfiguration: {
          BlockPublicAcls: true,
          BlockPublicPolicy: true,
          IgnorePublicAcls: true,
          RestrictPublicBuckets: true,
        },
      });
    });

    it("routes /api/* to the load balancer without caching", () => {
      templates.Web.hasResourceProperties("AWS::CloudFront::Distribution", {
        DistributionConfig: Match.objectLike({
          CacheBehaviors: [
            Match.objectLike({
              PathPattern: "/api/*",
              CachePolicyId: "4135ea2d-6df8-44a3-9df3-4b5a84be39ad", // Managed-CachingDisabled
              AllowedMethods: Match.arrayWith(["POST", "DELETE"]),
            }),
          ],
        }),
      });
    });

    it("does not use distribution-wide error pages (they would hide API 404s)", () => {
      const dist = Object.values(
        templates.Web.findResources("AWS::CloudFront::Distribution"),
      )[0];
      expect(dist.Properties.DistributionConfig.CustomErrorResponses).toBeUndefined();
    });

    it("outputs the site URL", () => {
      templates.Web.hasOutput("SiteUrl", {});
    });
  });

  it("never puts a password or secret value in a template", () => {
    for (const template of Object.values(templates)) {
      const json = JSON.stringify(template.toJSON());
      expect(json).not.toMatch(/"(MasterUserPassword|Password)":\s*"[^{]/);
      expect(json).not.toMatch(/postgresql:\/\//);
    }
  });
});
