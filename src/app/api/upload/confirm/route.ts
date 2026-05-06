import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { db } from '@/db'
import { assets } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { headObject, generatePresignedDownloadUrl, getR2Client } from '@/lib/r2'
import { GetObjectCommand } from '@aws-sdk/client-s3'
import sharp from 'sharp'

const bodySchema = z.object({
  assetId: z.string().uuid(),
})

const MAGIC_BYTES = {
  png: [0x89, 0x50, 0x4e, 0x71] as number[],
  jpeg: [0xff, 0xd8, 0xff] as number[],
  webp: [0x52, 0x49, 0x46, 0x46] as number[],
}

function detectMimeFromMagicBytes(bytes: Uint8Array): string | null {
  const matches = (signature: number[]) =>
    signature.every((byte, i) => bytes[i] === byte)

  if (matches(MAGIC_BYTES.png)) return 'image/png'
  if (matches(MAGIC_BYTES.jpeg)) return 'image/jpeg'
  if (matches(MAGIC_BYTES.webp)) return 'image/webp'
  return null
}

export async function POST(req: Request): Promise<Response> {
  const { userId } = await auth()
  if (!userId) return new Response('Unauthorized', { status: 401 })

  const raw = await req.json().catch(() => null)
  const parsed = bodySchema.safeParse(raw)
  if (!parsed.success) {
    return new Response(JSON.stringify(parsed.error), { status: 400 })
  }

  const { assetId } = parsed.data

  const [asset] = await db
    .select()
    .from(assets)
    .where(eq(assets.id, assetId))
    .limit(1)

  if (!asset) return new Response('Asset not found', { status: 404 })

  await headObject(asset.r2Key)

  const client = getR2Client()
  const obj = await client.send(
    new GetObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME!,
      Key: asset.r2Key,
    }),
  )

  const chunks: Uint8Array[] = []
  for await (const chunk of obj.Body as AsyncIterable<Uint8Array>) {
    chunks.push(chunk)
  }
  const buffer = Buffer.concat(chunks)

  const first12 = new Uint8Array(buffer.slice(0, 12))
  const detectedMime = detectMimeFromMagicBytes(first12)

  if (!detectedMime) {
    return new Response('Invalid file type', { status: 400 })
  }

  const metadata = await sharp(buffer).metadata()
  const width = metadata.width ?? null
  const height = metadata.height ?? null

  const signedUrl = await generatePresignedDownloadUrl(asset.r2Key)
  const expiresAt = new Date(Date.now() + 3600 * 1000)

  await db
    .update(assets)
    .set({
      r2SignedUrl: signedUrl,
      signedUrlExpiresAt: expiresAt,
      width,
      height,
      mimeType: detectedMime,
    })
    .where(eq(assets.id, assetId))

  return Response.json({ assetId, signedUrl })
}
