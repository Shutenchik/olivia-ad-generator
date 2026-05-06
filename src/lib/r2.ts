import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { db } from '@/db'
import { assets } from '@/db/schema'
import { eq } from 'drizzle-orm'

const DOWNLOAD_TTL_SECONDS = 3600
const UPLOAD_TTL_SECONDS = 300
const SIGNED_URL_REFRESH_THRESHOLD_MS = 5 * 60 * 1000

export function getR2Client(): S3Client {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID!}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  })
}

export async function generatePresignedUploadUrl(
  key: string,
  contentType: string,
  maxBytes: number,
): Promise<string> {
  const client = getR2Client()
  const command = new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME!,
    Key: key,
    ContentType: contentType,
    ContentLength: maxBytes,
  })
  return getSignedUrl(client, command, { expiresIn: UPLOAD_TTL_SECONDS })
}

export async function generatePresignedDownloadUrl(key: string): Promise<string> {
  const client = getR2Client()
  const command = new GetObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME!,
    Key: key,
  })
  return getSignedUrl(client, command, { expiresIn: DOWNLOAD_TTL_SECONDS })
}

export async function deleteObject(key: string): Promise<void> {
  const client = getR2Client()
  await client.send(
    new DeleteObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME!,
      Key: key,
    }),
  )
}

export async function headObject(key: string) {
  const client = getR2Client()
  return client.send(
    new HeadObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME!,
      Key: key,
    }),
  )
}

export async function getSignedUrlForAsset(assetId: string): Promise<string> {
  const [asset] = await db.select().from(assets).where(eq(assets.id, assetId)).limit(1)

  if (!asset) {
    throw new Error(`Asset not found: ${assetId}`)
  }

  const isExpiringSoon =
    !asset.signedUrlExpiresAt ||
    asset.signedUrlExpiresAt.getTime() - Date.now() < SIGNED_URL_REFRESH_THRESHOLD_MS

  if (asset.r2SignedUrl && !isExpiringSoon) {
    return asset.r2SignedUrl
  }

  const signedUrl = await generatePresignedDownloadUrl(asset.r2Key)
  const expiresAt = new Date(Date.now() + DOWNLOAD_TTL_SECONDS * 1000)

  await db
    .update(assets)
    .set({ r2SignedUrl: signedUrl, signedUrlExpiresAt: expiresAt })
    .where(eq(assets.id, assetId))

  return signedUrl
}
