import { CfnOutput, RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import type * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import type * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import type { Construct } from "constructs";
import { ORIGIN_VERIFY_HEADER } from "./api-stack";

export interface WebStackProps extends StackProps {
  readonly loadBalancer: elbv2.IApplicationLoadBalancer;
  readonly originVerifySecret: secretsmanager.ISecret;
  /** The built React app (apps/web/dist). */
  readonly webDistPath: string;
}

/**
 * One CloudFront URL for everything: the React build from a private S3
 * bucket, and `/api/*` forwarded to the load balancer. Same origin means no
 * CORS, free HTTPS without a domain, and one web build for every environment.
 */
export class WebStack extends Stack {
  readonly siteUrl: CfnOutput;

  constructor(scope: Construct, id: string, props: WebStackProps) {
    super(scope, id, props);

    const bucket = new s3.Bucket(this, "SiteBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // SPA fallback on the default behavior only. Distribution-wide 403/404
    // error pages would also turn API 404s into "200 index.html".
    const spaRewrite = new cloudfront.Function(this, "SpaRewrite", {
      runtime: cloudfront.FunctionRuntime.JS_2_0,
      code: cloudfront.FunctionCode.fromInline(`
function handler(event) {
  var request = event.request;
  var lastSegment = request.uri.split("/").pop();
  if (lastSegment.indexOf(".") === -1) {
    request.uri = "/index.html";
  }
  return request;
}`),
    });

    const distribution = new cloudfront.Distribution(this, "Distribution", {
      comment: `Forge ${this.stackName}`,
      defaultRootObject: "index.html",
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        responseHeadersPolicy: cloudfront.ResponseHeadersPolicy.SECURITY_HEADERS,
        functionAssociations: [
          { function: spaRewrite, eventType: cloudfront.FunctionEventType.VIEWER_REQUEST },
        ],
      },
      additionalBehaviors: {
        "/api/*": {
          // HTTP to the load balancer: without a domain there is no
          // certificate for it. With a domain, make this HTTPS end to end.
          origin: new origins.LoadBalancerV2Origin(props.loadBalancer, {
            protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
            customHeaders: {
              [ORIGIN_VERIFY_HEADER]: props.originVerifySecret.secretValue.unsafeUnwrap(),
            },
          }),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
          responseHeadersPolicy: cloudfront.ResponseHeadersPolicy.SECURITY_HEADERS,
        },
      },
    });

    new s3deploy.BucketDeployment(this, "DeploySite", {
      sources: [s3deploy.Source.asset(props.webDistPath)],
      destinationBucket: bucket,
      distribution,
      distributionPaths: ["/*"],
    });

    this.siteUrl = new CfnOutput(this, "SiteUrl", {
      value: `https://${distribution.distributionDomainName}`,
    });
  }
}
