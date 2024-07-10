import { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import https from 'https';
import { createWriteStream, promises as fsPromises, unlink } from 'fs';

// Initialize the S3 client
const s3Client = new S3Client({ region: process.env.REGION });

export const backup = async (event, context) => {
    const zookeeperSnapshotUrl = process.env.ZK_ADMIN_URL + '/commands/snapshot?streaming=true';

    const snapshotFilePath = '/tmp/zookeeper-snapshot.tgz';
    const s3BucketName = process.env.ZK_BACK_FOLDER_NAME;
    const currentDate = getCurrentDate(); // Format: yyyymmdd
    const s3Key = `zookeeper-snapshot-${currentDate}.tgz`;

    try {
        // Step 1: Create Zookeeper Snapshot
        await downloadSnapshot(zookeeperSnapshotUrl, snapshotFilePath);

        // Step 2: Read the snapshot file
        const data = await fsPromises.readFile(snapshotFilePath);

        // Step 3: Upload the snapshot file to S3
        const uploadParams = {
            Bucket: s3BucketName,
            Key: s3Key,
            Body: data
        };

        const uploadCommand = new PutObjectCommand(uploadParams);
        await s3Client.send(uploadCommand);

        console.log(`Snapshot uploaded successfully to S3: ${s3Key}`);

        // Step 4: Clean up the local file after upload
        await unlink(snapshotFilePath);

        // Step 5: Delete old objects in the bucket
        await deleteOldObjects(s3BucketName, 'backups/', 10);

        return {
            statusCode: 200,
            body: JSON.stringify(`Snapshot uploaded successfully to S3: ${s3Key}`),
        };
    } catch (error) {
        console.error(`Error: ${error.message}`);
        return {
            statusCode: 500,
            body: JSON.stringify(`Error: ${error.message}`),
        };
    }
};

// Helper function to download snapshot using https module
const downloadSnapshot = (url, destinationPath) => {
    return new Promise((resolve, reject) => {
        const file = createWriteStream(destinationPath);

        https.get(url, options, (response) => {
            if (response.statusCode !== 200) {
                reject(new Error(`Failed to get snapshot: ${response.statusCode}`));
                return;
            }

            response.pipe(file);

            file.on('finish', () => {
                file.close(resolve);
            });

            file.on('error', (err) => {
                unlink(destinationPath); // Delete the file async if an error occurs
                reject(err);
            });
        }).on('error', (err) => {
            unlink(destinationPath); // Delete the file async if an error occurs
            reject(err);
        });
    });
};

// Helper function to delete old objects in the bucket
const deleteOldObjects = async (bucketName, prefix, daysOld) => {
    const thresholdDate = new Date();
    thresholdDate.setDate(thresholdDate.getDate() - daysOld);
    const listParams = {
        Bucket: bucketName,
        Prefix: prefix
    };

    const listedObjects = await s3Client.send(new ListObjectsV2Command(listParams));

    if (!listedObjects.Contents) {
        return;
    }

    const objectsToDelete = listedObjects.Contents
        .filter(object => new Date(object.LastModified) < thresholdDate)
        .map(object => ({ Key: object.Key }));

    if (objectsToDelete.length === 0) {
        return;
    }

    const deleteParams = {
        Bucket: bucketName,
        Delete: {
            Objects: objectsToDelete,
            Quiet: true
        }
    };

    const deleteCommand = new DeleteObjectsCommand(deleteParams);
    await s3Client.send(deleteCommand);

    console.log(`Deleted ${objectsToDelete.length} objects from ${bucketName}`);
};

// Helper function to get current date in yyyymmdd format
const getCurrentDate = () => {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
};
