// S3-compatible client for MinIO (maps to Azure Blob via the same SDK shape).
// Presigning is a local HMAC computation, so we point the client at the
// browser-reachable public endpoint; no server->MinIO network call is needed.
const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

const s3 = new S3Client({
  region: "us-east-1",
  endpoint: process.env.MINIO_PUBLIC_ENDPOINT || "http://localhost:9000",
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.MINIO_ROOT_USER,
    secretAccessKey: process.env.MINIO_ROOT_PASSWORD,
  },
});

const BUCKET = process.env.MINIO_BUCKET || "audio";

async function presignAudio(key, expiresIn = 3600) {
  const cmd = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  return getSignedUrl(s3, cmd, { expiresIn });
}

module.exports = { presignAudio };
