import { tool, generateText } from 'ai'
import { z } from 'zod'
import { openai } from '@ai-sdk/openai'
import { anthropic } from '@ai-sdk/anthropic'
import { fal } from '@/lib/fal'
import { db } from '@/db'
import { assets, generations } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { getSignedUrlForAsset, generatePresignedDownloadUrl } from '@/lib/r2'
import { generateIdempotencyKey, generatePromptHash } from '@/lib/idempotency'
import { v4 as uuidv4 } from 'uuid'

interface FalImageResult {
  images?: Array<{ url: string }>
  image?: { url: string }
}

async function saveGeneratedAsset(params: {
  sessionId: string
  r2Key: string
  mimeType: string
  width?: number
  height?: number
}): Promise<string> {
  const [asset] = await db
    .insert(assets)
    .values({
      sessionId: params.sessionId,
      r2Key: params.r2Key,
      type: 'generated',
      mimeType: params.mimeType,
      width: params.width,
      height: params.height,
    })
    .returning({ id: assets.id })
  return asset!.id
}

async function saveGeneration(params: {
  sessionId: string
  prompt: string
  model: string
  tool: string
  inputAssetId?: string
  outputAssetId?: string
  status: 'done' | 'error'
  latencyMs: number
  costUsd: string
  promptHash: string
  idempotencyKey: string
  errorMessage?: string
}) {
  await db.insert(generations).values({
    sessionId: params.sessionId,
    prompt: params.prompt,
    model: params.model,
    tool: params.tool,
    inputAssetId: params.inputAssetId,
    outputAssetId: params.outputAssetId,
    status: params.status,
    latencyMs: params.latencyMs,
    costUsd: params.costUsd,
    promptHash: params.promptHash,
    idempotencyKey: params.idempotencyKey,
    errorMessage: params.errorMessage,
  })
}

export function buildAgentTools(sessionId: string) {
  return {
    detectProductType: tool({
      description:
        'Analyzes an uploaded product image and identifies the product type, generates a description and 4 creative prompt suggestions.',
      inputSchema: z.object({
        assetId: z.string().uuid().describe('The asset ID of the uploaded product image'),
      }),
      execute: async (input) => { const assetId = (input as { assetId: string }).assetId
        const signedUrl = await getSignedUrlForAsset(assetId)

        const { text } = await generateText({
          model: openai('gpt-4o'),
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'image',
                  image: new URL(signedUrl),
                },
                {
                  type: 'text',
                  text: 'What product is in this image? Respond with JSON only (no markdown): { "productType": string, "description": string, "suggestedPrompts": string[] (exactly 4 items, each in format "Setting · Lighting style") }',
                },
              ],
            },
          ],
        })

        const result = JSON.parse(text) as {
          productType: string
          description: string
          suggestedPrompts: string[]
        }

        await db
          .update(assets)
          .set({ detectedProductType: result.productType })
          .where(eq(assets.id, assetId))

        return result
      },
    }),

    suggestPrompts: tool({
      description:
        'Generates 4 creative ad background prompt suggestions for a given product type.',
      inputSchema: z.object({
        productType: z.string().describe('The type of product (e.g. sneaker, perfume, food)'),
        userContext: z
          .string()
          .optional()
          .describe('Optional user context about brand or campaign'),
      }),
      execute: async (input) => {
        const { productType, userContext } = input as { productType: string; userContext?: string | undefined }
        const { text } = await generateText({
          model: anthropic('claude-3-5-haiku-20241022'),
          prompt: `Generate exactly 4 creative ad background prompt suggestions for a ${productType} product${userContext ? `. Brand context: ${userContext}` : ''}. 
Each suggestion should be in format "Setting · Lighting style" (e.g. "Marble countertop · Studio softbox").
Return a JSON array of exactly 4 strings, no markdown, no explanation.`,
        })

        const prompts = JSON.parse(text) as string[]
        return { suggestedPrompts: prompts }
      },
    }),

    removeBackground: tool({
      description: 'Removes the background from a product image using AI.',
      inputSchema: z.object({
        assetId: z.string().uuid().describe('The asset ID of the image to process'),
      }),
      execute: async (input) => { const assetId = (input as { assetId: string }).assetId
        const start = Date.now()
        const signedUrl = await getSignedUrlForAsset(assetId)
        const idempotencyKey = generateIdempotencyKey(sessionId, 'removeBackground', assetId)
        const promptHash = generatePromptHash(assetId)

        const result = await fal.subscribe('fal-ai/birefnet', {
          input: { image_url: signedUrl },
        })

        const data = result.data as FalImageResult
        const imageUrl = data.image?.url ?? data.images?.[0]?.url ?? ''

        const r2Key = `generated/${sessionId}/${uuidv4()}-rmbg.png`
        const outputAssetId = await saveGeneratedAsset({
          sessionId,
          r2Key,
          mimeType: 'image/png',
        })

        const latencyMs = Date.now() - start
        await saveGeneration({
          sessionId,
          prompt: assetId,
          model: 'fal-ai/birefnet',
          tool: 'removeBackground',
          inputAssetId: assetId,
          outputAssetId,
          status: 'done',
          latencyMs,
          costUsd: '0.001000',
          promptHash,
          idempotencyKey,
        })

        return { assetId: outputAssetId, signedUrl: imageUrl }
      },
    }),

    generateBackground: tool({
      description:
        'Generates a professional ad background for a product using FLUX.1-schnell.',
      inputSchema: z.object({
        prompt: z
          .string()
          .describe(
            'Description of the background scene (e.g. "Marble countertop · Studio softbox")',
          ),
        aspectRatio: z
          .enum(['1:1', '4:5', '9:16', '16:9'])
          .describe('Canvas format / aspect ratio'),
        productAssetId: z.string().uuid().describe('The asset ID of the product image'),
      }),
      execute: async (input) => {
        const { prompt, aspectRatio, productAssetId } = input as { prompt: string; aspectRatio: '1:1' | '4:5' | '9:16' | '16:9'; productAssetId: string }
        const start = Date.now()
        const idempotencyKey = generateIdempotencyKey(
          sessionId,
          'generateBackground',
          `${productAssetId}:${prompt}:${aspectRatio}`,
        )
        const promptHash = generatePromptHash(prompt)

        const imageSizeMap: Record<string, string> = {
          '1:1': 'square_hd',
          '9:16': 'portrait_16_9',
          '16:9': 'landscape_16_9',
          '4:5': 'portrait_4_3',
        }

        const enhancedPrompt = `Professional product advertisement background: ${prompt}. Clean, high-end commercial photography style. No products, no people, just the background scene.`

        const result = await fal.subscribe('fal-ai/flux/schnell', {
          input: {
            prompt: enhancedPrompt,
            image_size: (imageSizeMap[aspectRatio] ?? 'square_hd') as 'square_hd' | 'portrait_16_9' | 'landscape_16_9' | 'portrait_4_3',
            num_inference_steps: 4,
            num_images: 1,
          },
        })

        const data = result.data as FalImageResult
        const imageUrl = data.images?.[0]?.url ?? ''

        const r2Key = `generated/${sessionId}/${uuidv4()}-bg.jpg`
        const outputAssetId = await saveGeneratedAsset({
          sessionId,
          r2Key,
          mimeType: 'image/jpeg',
        })

        const latencyMs = Date.now() - start
        await saveGeneration({
          sessionId,
          prompt,
          model: 'fal-ai/flux/schnell',
          tool: 'generateBackground',
          inputAssetId: productAssetId,
          outputAssetId,
          status: 'done',
          latencyMs,
          costUsd: '0.003000',
          promptHash,
          idempotencyKey,
        })

        return {
          backgroundAssetId: outputAssetId,
          backgroundUrl: imageUrl,
          productAssetId,
        }
      },
    }),

    inpaintBackground: tool({
      description:
        'Modifies an existing generated image using image-to-image (e.g. "make it warmer", "add snow").',
      inputSchema: z.object({
        assetId: z.string().uuid().describe('The asset ID of the image to modify'),
        prompt: z.string().describe('Description of the desired modification'),
      }),
      execute: async (input) => {
        const { assetId, prompt } = input as { assetId: string; prompt: string }
        const start = Date.now()
        const signedUrl = await getSignedUrlForAsset(assetId)
        const idempotencyKey = generateIdempotencyKey(
          sessionId,
          'inpaintBackground',
          `${assetId}:${prompt}`,
        )
        const promptHash = generatePromptHash(prompt)

        const result = await fal.subscribe('fal-ai/flux/dev/image-to-image', {
          input: {
            image_url: signedUrl,
            prompt,
            strength: 0.6,
            num_inference_steps: 28,
          },
        })

        const data = result.data as FalImageResult
        const imageUrl = data.images?.[0]?.url ?? ''

        const r2Key = `generated/${sessionId}/${uuidv4()}-inpaint.jpg`
        const outputAssetId = await saveGeneratedAsset({
          sessionId,
          r2Key,
          mimeType: 'image/jpeg',
        })

        const latencyMs = Date.now() - start
        await saveGeneration({
          sessionId,
          prompt,
          model: 'fal-ai/flux/dev/image-to-image',
          tool: 'inpaintBackground',
          inputAssetId: assetId,
          outputAssetId,
          status: 'done',
          latencyMs,
          costUsd: '0.006000',
          promptHash,
          idempotencyKey,
        })

        return { assetId: outputAssetId, signedUrl: imageUrl }
      },
    }),

    addHeadline: tool({
      description:
        'Adds a text headline layer to the canvas. Returns structured text data — rendered client-side.',
      inputSchema: z.object({
        text: z.string().describe('The headline text to display'),
        style: z
          .enum(['bold', 'elegant', 'minimal'])
          .optional()
          .default('bold')
          .describe('Visual style of the headline'),
        color: z.string().optional().default('#FAFAF9').describe('Hex color code'),
      }),
      execute: async (input) => {
        const { text, style, color } = input as { text: string; style?: 'bold' | 'elegant' | 'minimal'; color?: string }
        const styleMap: Record<string, { fontFamily: string; fontSize: number; fontWeight: string }> =
          {
            bold: { fontFamily: 'DM Sans', fontSize: 72, fontWeight: '700' },
            elegant: { fontFamily: 'Instrument Serif', fontSize: 64, fontWeight: '400' },
            minimal: { fontFamily: 'DM Sans', fontSize: 48, fontWeight: '300' },
          }

        const styles = styleMap[style ?? 'bold'] ?? styleMap['bold']!

        return {
          text,
          fontFamily: styles.fontFamily,
          fontSize: styles.fontSize,
          fontWeight: styles.fontWeight,
          color: color ?? '#FAFAF9',
        }
      },
    }),

    upscaleImage: tool({
      description: 'Upscales an image 4x using AI super-resolution.',
      inputSchema: z.object({
        assetId: z.string().uuid().describe('The asset ID of the image to upscale'),
      }),
      execute: async (input) => { const assetId = (input as { assetId: string }).assetId
        const start = Date.now()
        const signedUrl = await getSignedUrlForAsset(assetId)
        const idempotencyKey = generateIdempotencyKey(sessionId, 'upscaleImage', assetId)
        const promptHash = generatePromptHash(assetId)

        const result = await fal.subscribe('fal-ai/esrgan', {
          input: { image_url: signedUrl },
        })

        const data = result.data as FalImageResult
        const imageUrl = data.image?.url ?? data.images?.[0]?.url ?? ''

        const r2Key = `generated/${sessionId}/${uuidv4()}-upscaled.png`
        const outputAssetId = await saveGeneratedAsset({
          sessionId,
          r2Key,
          mimeType: 'image/png',
        })

        const latencyMs = Date.now() - start
        await saveGeneration({
          sessionId,
          prompt: assetId,
          model: 'fal-ai/esrgan',
          tool: 'upscaleImage',
          inputAssetId: assetId,
          outputAssetId,
          status: 'done',
          latencyMs,
          costUsd: '0.002000',
          promptHash,
          idempotencyKey,
        })

        return { assetId: outputAssetId, signedUrl: imageUrl }
      },
    }),

    generateCopy: tool({
      description: 'Generates advertising copy (headline, tagline, CTA) for a product.',
      inputSchema: z.object({
        productType: z.string().describe('Type of product'),
        tone: z.string().describe('Brand tone (e.g. luxury, playful, minimal, bold)'),
        platform: z
          .enum(['instagram', 'facebook', 'general'])
          .describe('Target ad platform'),
      }),
      execute: async (input) => {
        const { productType, tone, platform } = input as { productType: string; tone: string; platform: 'instagram' | 'facebook' | 'general' }
        const { text } = await generateText({
          model: anthropic('claude-3-5-haiku-20241022'),
          prompt: `Write advertising copy for a ${productType} ad on ${platform} with a ${tone} tone.
Return JSON only (no markdown): { "headline": string (max 8 words), "tagline": string (max 15 words), "cta": string (max 4 words) }`,
        })

        const copy = JSON.parse(text) as {
          headline: string
          tagline: string
          cta: string
        }

        return copy
      },
    }),
  }
}
