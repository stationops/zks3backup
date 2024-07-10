package com.myorg;

import software.amazon.awscdk.Duration;
import software.amazon.awscdk.RemovalPolicy;
import software.amazon.awscdk.services.events.Rule;
import software.amazon.awscdk.services.events.Schedule;
import software.amazon.awscdk.services.events.targets.LambdaFunction;
import software.amazon.awscdk.services.iam.*;
import software.amazon.awscdk.services.lambda.Code;
import software.amazon.awscdk.services.lambda.Runtime;
import software.amazon.awscdk.services.logs.RetentionDays;
import software.amazon.awscdk.services.s3.BlockPublicAccess;
import software.amazon.awscdk.services.s3.Bucket;
import software.constructs.Construct;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.StackProps;

import java.util.List;
import java.util.Map;
// import software.amazon.awscdk.Duration;
// import software.amazon.awscdk.services.sqs.Queue;

public class ZkBackupStack extends Stack {
    public ZkBackupStack(final Construct scope, final String id) {
        this(scope, id, null);
    }

    public ZkBackupStack(final Construct scope, final String id, final StackProps props) {
        super(scope, id, props);

        Bucket bucket = Bucket.Builder.create(this, "ZkBackupFolder")
                .blockPublicAccess(BlockPublicAccess.BLOCK_ALL)
                .publicReadAccess(false)
                .removalPolicy(RemovalPolicy.RETAIN)
                .enforceSsl(true)
                .build();

        PolicyStatement policyStatement = new PolicyStatement(PolicyStatementProps.builder()
                .effect(Effect.ALLOW)
                .actions(List.of(
                        "logs:CreateLogGroup",
                        "logs:CreateLogStream",
                        "logs:PutLogEvents",
                        "s3:PutObject",
                        "s3:ListBucket",
                        "s3:DeleteObject"
                ))
                .resources(List.of("*"))
                .build());


        Role executionRole = Role.Builder.create(this, "ZkBackupRole")
                .assumedBy(new ServicePrincipal("lambda.amazonaws.com"))
                .managedPolicies(List.of(
                        ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaVPCAccessExecutionRole")
                ))
                .build();

        executionRole.addToPolicy(policyStatement);


        software.amazon.awscdk.services.lambda.Function callbackFunction = software.amazon.awscdk.services.lambda.Function.Builder.create(this, "ZkBackupCallback")
                .runtime(Runtime.NODEJS_18_X)
                .role(executionRole)
                .code(Code.fromAsset("callbacks"))
                .handler("src/backup.backup")
                .timeout(Duration.seconds(5))
                .retryAttempts(2)
                .environment(Map.of(
                        "ZK_ADMIN_URL", System.getenv("ZK_ADMIN_URL"),
                        "REGION", System.getenv("REGION"),
                        "ZK_BACK_FOLDER_NAME", bucket.getBucketName()
                ))
                .logRetention(RetentionDays.ONE_DAY)
                .build();


        Rule everyMinuteRule = Rule.Builder.create(this, "ZkBackupRule")
                .schedule(Schedule.rate(Duration.days(1)))
                .targets(List.of(new LambdaFunction(callbackFunction)))
                .build();

    }
}
