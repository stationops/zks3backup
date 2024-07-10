package com.myorg;

import software.amazon.awscdk.App;
import software.amazon.awscdk.StackProps;

public class ZkBackupApp {
    public static void main(final String[] args) {
        App app = new App();

        new ZkBackupStack(app, "ZkBackupStack", StackProps.builder()
                .build());

        app.synth();
    }
}

