import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  jsonb,
  pgEnum,
  decimal,
  unique,
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'

export const assetTypeEnum = pgEnum('asset_type', ['original', 'generated', 'export'])
export const generationStatusEnum = pgEnum('generation_status', [
  'pending',
  'processing',
  'done',
  'error',
])
export const messageRoleEnum = pgEnum('message_role', ['user', 'assistant', 'tool'])

export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  clerkUserId: text('clerk_user_id'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

export const assets = pgTable('assets', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id')
    .notNull()
    .references(() => sessions.id, { onDelete: 'cascade' }),
  r2Key: text('r2_key').notNull(),
  r2SignedUrl: text('r2_signed_url'),
  signedUrlExpiresAt: timestamp('signed_url_expires_at'),
  type: assetTypeEnum('type').notNull().default('original'),
  mimeType: text('mime_type').notNull(),
  width: integer('width'),
  height: integer('height'),
  detectedProductType: text('detected_product_type'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export const generations = pgTable('generations', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id')
    .notNull()
    .references(() => sessions.id, { onDelete: 'cascade' }),
  parentGenerationId: uuid('parent_generation_id'),
  prompt: text('prompt').notNull(),
  model: text('model').notNull(),
  tool: text('tool').notNull(),
  inputAssetId: uuid('input_asset_id').references(() => assets.id, { onDelete: 'set null' }),
  outputAssetId: uuid('output_asset_id').references(() => assets.id, { onDelete: 'set null' }),
  status: generationStatusEnum('status').notNull().default('pending'),
  errorMessage: text('error_message'),
  latencyMs: integer('latency_ms'),
  costUsd: decimal('cost_usd', { precision: 10, scale: 6 }),
  promptHash: text('prompt_hash').notNull(),
  idempotencyKey: text('idempotency_key').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  idempotencyKeyUnique: unique('generations_idempotency_key_unique').on(table.idempotencyKey),
}))

export const messages = pgTable('messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id')
    .notNull()
    .references(() => sessions.id, { onDelete: 'cascade' }),
  role: messageRoleEnum('role').notNull(),
  content: text('content').notNull(),
  toolCallId: text('tool_call_id'),
  toolName: text('tool_name'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export const canvasStates = pgTable('canvas_states', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id')
    .notNull()
    .references(() => sessions.id, { onDelete: 'cascade' }),
  stateJson: jsonb('state_json').notNull(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  sessionIdUnique: unique('canvas_states_session_id_unique').on(table.sessionId),
}))

export const brandKits = pgTable('brand_kits', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id')
    .notNull()
    .references(() => sessions.id, { onDelete: 'cascade' }),
  brandName: text('brand_name'),
  primaryColor: text('primary_color').default('#E8D5B0'),
  secondaryColor: text('secondary_color').default('#0A0A0B'),
  fontFamily: text('font_family').default('DM Sans'),
  logoAssetId: uuid('logo_asset_id').references(() => assets.id, { onDelete: 'set null' }),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  sessionIdUnique: unique('brand_kits_session_id_unique').on(table.sessionId),
}))

export const shareLinks = pgTable('share_links', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id')
    .notNull()
    .references(() => sessions.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export const sessionsRelations = relations(sessions, ({ many, one }) => ({
  assets: many(assets),
  generations: many(generations),
  messages: many(messages),
  canvasState: one(canvasStates, {
    fields: [sessions.id],
    references: [canvasStates.sessionId],
  }),
  brandKit: one(brandKits, {
    fields: [sessions.id],
    references: [brandKits.sessionId],
  }),
  shareLinks: many(shareLinks),
}))

export const assetsRelations = relations(assets, ({ one }) => ({
  session: one(sessions, {
    fields: [assets.sessionId],
    references: [sessions.id],
  }),
}))

export const generationsRelations = relations(generations, ({ one }) => ({
  session: one(sessions, {
    fields: [generations.sessionId],
    references: [sessions.id],
  }),
  inputAsset: one(assets, {
    fields: [generations.inputAssetId],
    references: [assets.id],
  }),
  outputAsset: one(assets, {
    fields: [generations.outputAssetId],
    references: [assets.id],
  }),
}))

export const messagesRelations = relations(messages, ({ one }) => ({
  session: one(sessions, {
    fields: [messages.sessionId],
    references: [sessions.id],
  }),
}))
