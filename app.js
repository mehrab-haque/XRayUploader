require('dotenv').config()
const chokidar = require('chokidar');
const dicomParser = require('dicom-parser');
const AWS = require('aws-sdk');
const fs = require('fs');
const path = require('path');


AWS.config.update({
    accessKeyId: process.env.DCM4CHEE_ACCESS_KEY,
    secretAccessKey: process.env.DCM4CHEE_SECRET_KEY,
    region: process.env.DCM4CHEE_REGION
});

const s3 = new AWS.S3();
const bucketName = process.env.DCM4CHEE_BUCKET

const watchFolder = process.env.TARGET_FOLDER;
const watcher = chokidar.watch(watchFolder, {
    ignored: /(^|[\/\\])\../,
    persistent: true,
    depth: 99
});

const logFilePath = process.env.LOG_FILE;

function isFileUploaded(filePath) {
    if (!fs.existsSync(logFilePath)) {
        return false;
    }

    const uploadedFiles = fs.readFileSync(logFilePath, 'utf8');
    return uploadedFiles.includes(filePath);
}

function logFileUpload(filePath) {
    fs.appendFileSync(logFilePath, filePath + '\n');
}

function processDicomFile(filePath) {
    console.log(`New DICOM file detected: ${filePath}`);
    if (isFileUploaded(filePath)) {
        console.log(`Skipping ${filePath}, already uploaded.`);
        return;
    }
    fs.readFile(filePath, (err, data) => {
        if (err) {
            console.error(`Error reading DICOM file: ${filePath}`, err)
            return
        }
        try {
            const dataSet = dicomParser.parseDicom(data)
            const patientName = dataSet.string('x00100010').replace(/\^/g, ' ')
            var originalFileName = path.basename(filePath);
            originalFileName = originalFileName.split('_')[originalFileName.split('_').length - 1]
            const newFileName = `${patientName}-${originalFileName}`;
            const params = {
                Bucket: bucketName,
                Key: newFileName,
                Body: data
            };

            s3.upload(params, function (s3Err, data) {
                if (s3Err) throw s3Err;
                console.log(`File uploaded successfully to DCM4CHEE`);
                logFileUpload(filePath);
            });
            console.log(`Patient's Name in ${path.basename(filePath)}:`, newFileName)
        } catch (e) {
            console.error(`Error parsing DICOM file: ${filePath}`, e)
        }
    });
}

watcher.on('add', (filePath) => {
    if (path.extname(filePath).toLowerCase() === '.dcm')
        setTimeout(() => processDicomFile(filePath), 5000)
});

console.log(`Watching for DCM files in: ${watchFolder}`);