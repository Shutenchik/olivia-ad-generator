# Olivia Take-Home — AI Product Ad Generator

> Built for the Olivia take-home challenge · 48-hour sprint

## 30-Second Pitch

Upload a product photo, and an AI creative director automatically removes the background, generates professional ad scenes with FLUX.1-schnell, writes copy, and composes everything on a fully editable canvas — all via natural language chat.

## Features

- **Canvas editor** — layers, drag/resize/rotate, undo/redo, multi-format export (1:1 · 4:5 · 9:16 · 16:9)
- **Agentic AI** — auto-detects product type on upload, suggests prompts, picks the right model automatically
- **Chat iterations** — "make it warmer", "add a bold headline", "try outdoor" — streamed responses update the canvas live
- **Brand kit** — store colors, font, logo; agent applies them automatically
- **Generation history** — all versions in a drawer, with cost/latency per generation
- **Share links** — read-only public URLs with 7-day expiry

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     Next.js 15 App Router               │
├───────────────┬─────────────────────────┬───────────────┤
│  Left Panel   │    Canvas (react-konva) │  Chat Panel   │
│  Upload Zone  │    Layers: bg / product │  useChat      │
│  Layer Panel  │    Text / shape layers  │  (AI SDK v6)  │
│  Brand Kit    │    Transformer handles  │  Streaming    │
└───────────────┴─────────────────────────┴───────────────┘
         │                                       │
         ▼                                       ▼
  /api/upload/presign              /api/agent (streamText)
  /api/upload/confirm                ├── detectProductType (gpt-4o vision)
         │                           ├── generateBackground (fal FLUX.1-schnell)
         ▼                           ├── removeBackground (fal birefnet)
  Cloudflare R2 (signed URLs)        ├── inpaintBackground (fal flux/dev img2img)
         │                           ├── addHeadline (canvas tool, no AI cost)
         ▼                           ├── upscaleImage (fal esrgan)
  Neon Postgres (Drizzle ORM)        └── generateCopy (claude-3-5-haiku)
```

## Key Decisions

| Decision | Why |
|----------|-----|
| **fal.ai over Replicate** | 3x faster cold starts, typed SDK, streaming progress events |
| **Konva over tldraw** | Fine-grained layer control, no opinionated data model, easy R2 integration |
| **Vercel AI SDK v6 tool-calling** | Type-safe multi-step tool execution with `stopWhen: stepCountIs(5)` |
| **Clerk over Auth.js** | 2-hour integration vs 8 hours; needed feature velocity |
| **Neon + Drizzle over Prisma** | Drizzle's type inference is sharper; Neon serverless driver has zero cold-start penalty |
| **FLUX.1-schnell** | 4 inference steps, ~$0.003/image, 3–5s generation time |
| **TextStreamChatTransport** | Our `/api/agent` returns a text stream (not UI message stream), matching the simple streaming protocol |

## Security

- [x] All API keys server-side only (`src/app/api/*/route.ts`)
- [x] Rate limiting: 20 gen/hour per user (Upstash Redis sliding window)
- [x] Session cost cap: $1.00 hard limit (`SessionCostCapError` → 402)
- [x] Input validation: zod on every route before any business logic
- [x] File validation: MIME whitelist + magic bytes check (PNG/JPEG/WebP)
- [x] Prompt injection defense in system prompt
- [x] CSP + security headers (`next.config.ts`)
- [x] Signed R2 URLs (1h TTL, refreshed on read, never public bucket)
- [x] Idempotency keys on all generations (SHA256 of sessionId+tool+prompt)
- [x] Error boundaries + Sentry
- [x] Strict TypeScript (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`)

## Cost Analysis

| Operation | Model | Est. Cost |
|-----------|-------|-----------|
| Product detection | GPT-4o Vision | ~$0.003 |
| Background removal | fal birefnet | ~$0.001 |
| Background generation | FLUX.1-schnell | ~$0.003 |
| Image-to-image | FLUX dev img2img | ~$0.006 |
| Copy generation | Claude 3.5 Haiku | ~$0.0003 |
| **Typical session (5 gens)** | | **~$0.04** |

## Running Locally

```bash
git clone <repo>
cd olivia-test
npm install
cp .env.example .env.local
# Fill in your keys in .env.local
npm run db:push  # push schema to Neon
npm run dev
```

Required env vars: `DATABASE_URL`, `OPENAI_API_KEY`, `FAL_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`.

Optional: `ANTHROPIC_API_KEY`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `NEXT_PUBLIC_SENTRY_DSN`.

## Testing

```bash
npm test           # Vitest unit tests (16 tests)
npm run test:e2e   # Playwright e2e (requires running server)
```

## What I'd Build Next

1. **Video ads** — FLUX-video for 3-second product clips
2. **Multi-product sessions** — A/B test different products on the same background
3. **Figma plugin** — export directly to design handoff
4. **Batch processing** — upload 50 products, generate all overnight
5. **Custom LoRA fine-tuning** — brand-specific model trained on customer's product photos
6. **Team workspaces** — shared brand kit, comment on generations, approval workflow
7. **Analytics** — which ad variations perform best (connect to Meta/Google Ads API)
