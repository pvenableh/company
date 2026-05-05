#!/usr/bin/env npx tsx
/**
 * Directus Social Media Collections Setup Script
 *
 * Creates all required collections and fields for the social media module.
 * Run once during initial setup:
 *
 *   pnpm tsx scripts/setup-social-collections.ts
 *
 * Or with custom env:
 *   DIRECTUS_URL=https://your-directus.com DIRECTUS_SERVER_TOKEN=your-token pnpm tsx scripts/setup-social-collections.ts
 *
 * Prerequisites:
 *   - Directus instance running
 *   - Admin static token with schema write permissions
 *
 * After running, regenerate your TypeScript types:
 *   pnpm generate:types
 */

import 'dotenv/config'

// ══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ══════════════════════════════════════════════════════════════════════════════

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055'
const DIRECTUS_TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || ''

if (!DIRECTUS_TOKEN) {
  console.error('❌ Error: DIRECTUS_SERVER_TOKEN or DIRECTUS_ADMIN_TOKEN environment variable is required')
  process.exit(1)
}

// ══════════════════════════════════════════════════════════════════════════════
// API HELPERS
// ══════════════════════════════════════════════════════════════════════════════

async function directusRequest<T = unknown>(
  path: string,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'GET',
  body?: unknown
): Promise<{ data: T | null; error: string | null }> {
  try {
    const response = await fetch(`${DIRECTUS_URL}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${DIRECTUS_TOKEN}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    })

    if (!response.ok) {
      const errorText = await response.text()
      let errorMessage: string
      try {
        const errorJson = JSON.parse(errorText)
        errorMessage = errorJson.errors?.[0]?.message || errorJson.message || errorText
      } catch {
        errorMessage = errorText
      }
      return { data: null, error: `${response.status}: ${errorMessage}` }
    }

    const json = await response.json()
    return { data: json.data as T, error: null }
  } catch (err) {
    return { data: null, error: String(err) }
  }
}

async function collectionExists(collection: string): Promise<boolean> {
  const { data } = await directusRequest(`/collections/${collection}`)
  return data !== null
}

async function createCollection(
  collection: string,
  meta: Record<string, unknown>,
  fields: Array<Record<string, unknown>>
): Promise<boolean> {
  // Check if already exists
  if (await collectionExists(collection)) {
    console.log(`  ⏭️  Collection "${collection}" already exists, skipping...`)
    return true
  }

  console.log(`  📦 Creating collection: ${collection}`)

  const { error } = await directusRequest('/collections', 'POST', {
    collection,
    meta: {
      icon: meta.icon || 'folder',
      note: meta.note || null,
      display_template: meta.display_template || null,
      hidden: meta.hidden || false,
      singleton: meta.singleton || false,
      sort_field: meta.sort_field || null,
      archive_field: meta.archive_field || null,
      archive_value: meta.archive_value || null,
      unarchive_value: meta.unarchive_value || null,
      ...meta,
    },
    fields: [
      // Primary key
      {
        field: 'id',
        type: 'uuid',
        meta: {
          hidden: true,
          readonly: true,
          interface: 'input',
          special: ['uuid'],
        },
        schema: {
          is_primary_key: true,
          is_nullable: false,
          has_auto_increment: false,
        },
      },
      // Created timestamp
      {
        field: 'date_created',
        type: 'timestamp',
        meta: {
          special: ['date-created'],
          interface: 'datetime',
          readonly: true,
          hidden: true,
          width: 'half',
        },
        schema: {
          is_nullable: true,
        },
      },
      // Updated timestamp
      {
        field: 'date_updated',
        type: 'timestamp',
        meta: {
          special: ['date-updated'],
          interface: 'datetime',
          readonly: true,
          hidden: true,
          width: 'half',
        },
        schema: {
          is_nullable: true,
        },
      },
      ...fields,
    ],
  })

  if (error) {
    console.error(`  ❌ Failed to create ${collection}: ${error}`)
    return false
  }

  console.log(`  ✅ Created ${collection}`)
  return true
}

// ══════════════════════════════════════════════════════════════════════════════
// COLLECTION DEFINITIONS
// ══════════════════════════════════════════════════════════════════════════════

const COLLECTIONS = {
  // ─────────────────────────────────────────────────────────────────────────────
  // Social Clients (Agency client management)
  // ─────────────────────────────────────────────────────────────────────────────
  social_clients: {
    meta: {
      icon: 'business',
      note: 'Agency clients — group social accounts by brand/client',
      display_template: '{{name}}',
      sort_field: 'name',
    },
    fields: [
      {
        field: 'name',
        type: 'string',
        meta: {
          interface: 'input',
          width: 'half',
          required: true,
        },
        schema: { is_nullable: false, max_length: 255 },
      },
      {
        field: 'logo_url',
        type: 'string',
        meta: {
          interface: 'input',
          width: 'half',
          note: 'URL to client logo image',
        },
        schema: { is_nullable: true, max_length: 500 },
      },
      {
        field: 'contact_email',
        type: 'string',
        meta: {
          interface: 'input',
          width: 'half',
        },
        schema: { is_nullable: true, max_length: 255 },
      },
      {
        field: 'brand_color',
        type: 'string',
        meta: {
          interface: 'select-color',
          width: 'half',
          note: 'Primary brand color for UI',
        },
        schema: { is_nullable: true, max_length: 20 },
      },
      {
        field: 'notes',
        type: 'text',
        meta: {
          interface: 'input-multiline',
          width: 'full',
        },
        schema: { is_nullable: true },
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // Social Accounts
  // ─────────────────────────────────────────────────────────────────────────────
  social_accounts: {
    meta: {
      icon: 'account_circle',
      note: 'Connected Instagram and TikTok accounts with OAuth tokens',
      display_template: '{{account_name}} ({{platform}})',
      sort_field: 'account_name',
    },
    fields: [
      {
        field: 'platform',
        type: 'string',
        meta: {
          interface: 'select-dropdown',
          width: 'half',
          required: true,
          options: {
            choices: [
              { text: 'Instagram', value: 'instagram' },
              { text: 'TikTok', value: 'tiktok' },
            ],
          },
        },
        schema: { is_nullable: false, max_length: 20 },
      },
      {
        field: 'platform_user_id',
        type: 'string',
        meta: {
          interface: 'input',
          width: 'half',
          note: 'Platform-specific user/account ID',
        },
        schema: { is_nullable: false, max_length: 100 },
      },
      {
        field: 'account_name',
        type: 'string',
        meta: {
          interface: 'input',
          width: 'half',
          required: true,
        },
        schema: { is_nullable: false, max_length: 255 },
      },
      {
        field: 'account_handle',
        type: 'string',
        meta: {
          interface: 'input',
          width: 'half',
          note: '@username',
        },
        schema: { is_nullable: true, max_length: 100 },
      },
      {
        field: 'profile_picture_url',
        type: 'string',
        meta: {
          interface: 'input',
          width: 'full',
        },
        schema: { is_nullable: true, max_length: 500 },
      },
      {
        field: 'access_token',
        type: 'text',
        meta: {
          interface: 'input-multiline',
          hidden: true,
          note: 'AES-256-GCM encrypted OAuth access token',
        },
        schema: { is_nullable: false },
      },
      {
        field: 'refresh_token',
        type: 'text',
        meta: {
          interface: 'input-multiline',
          hidden: true,
          note: 'Encrypted refresh token (TikTok)',
        },
        schema: { is_nullable: true },
      },
      {
        field: 'token_expires_at',
        type: 'timestamp',
        meta: {
          interface: 'datetime',
          width: 'half',
        },
        schema: { is_nullable: true },
      },
      {
        field: 'status',
        type: 'string',
        meta: {
          interface: 'select-dropdown',
          width: 'half',
          options: {
            choices: [
              { text: 'Active', value: 'active' },
              { text: 'Token Expired', value: 'expired' },
              { text: 'Revoked', value: 'revoked' },
            ],
          },
        },
        schema: { is_nullable: false, default_value: 'active', max_length: 20 },
      },
      {
        field: 'metadata',
        type: 'json',
        meta: {
          interface: 'input-code',
          options: { language: 'json' },
          special: ['cast-json'],
          note: 'Platform-specific metadata (page_id, scopes, etc.)',
        },
        schema: { is_nullable: true },
      },
      {
        field: 'client_id',
        type: 'uuid',
        meta: {
          interface: 'select-dropdown-m2o',
          special: ['m2o'],
          width: 'half',
          note: 'Associated client/brand',
          options: { template: '{{name}}' },
        },
        schema: { is_nullable: true, foreign_key_table: 'social_clients' },
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // Social Posts
  // ─────────────────────────────────────────────────────────────────────────────
  social_posts: {
    meta: {
      icon: 'dynamic_feed',
      note: 'Scheduled and published social media posts',
      display_template: '{{status}} — {{caption}}',
      sort_field: 'scheduled_at',
      archive_field: 'status',
      archive_value: 'archived',
      unarchive_value: 'draft',
    },
    fields: [
      {
        field: 'caption',
        type: 'text',
        meta: {
          interface: 'input-rich-text-md',
          width: 'full',
          required: true,
          note: 'Post caption / description',
        },
        schema: { is_nullable: false },
      },
      {
        field: 'media_urls',
        type: 'json',
        meta: {
          interface: 'list',
          special: ['cast-json'],
          width: 'full',
          note: 'Array of CDN URLs for images/videos',
          options: {
            template: '{{url}}',
            addLabel: 'Add Media URL',
          },
        },
        schema: { is_nullable: true },
      },
      {
        field: 'media_types',
        type: 'json',
        meta: {
          interface: 'input-code',
          special: ['cast-json'],
          width: 'half',
          note: 'Array of media types: ["image", "video"]',
        },
        schema: { is_nullable: true },
      },
      {
        field: 'thumbnail_url',
        type: 'string',
        meta: {
          interface: 'input',
          width: 'half',
        },
        schema: { is_nullable: true, max_length: 500 },
      },
      {
        field: 'platforms',
        type: 'json',
        meta: {
          interface: 'input-code',
          options: { language: 'json' },
          special: ['cast-json'],
          width: 'full',
          note: 'Target platforms with account IDs and options',
        },
        schema: { is_nullable: false },
      },
      {
        field: 'post_type',
        type: 'string',
        meta: {
          interface: 'select-dropdown',
          width: 'half',
          required: true,
          options: {
            choices: [
              { text: 'Image', value: 'image' },
              { text: 'Video', value: 'video' },
              { text: 'Carousel', value: 'carousel' },
              { text: 'Reel', value: 'reel' },
              { text: 'Story', value: 'story' },
            ],
          },
        },
        schema: { is_nullable: false, max_length: 20 },
      },
      {
        field: 'scheduled_at',
        type: 'timestamp',
        meta: {
          interface: 'datetime',
          width: 'half',
          required: true,
        },
        schema: { is_nullable: false },
      },
      {
        field: 'status',
        type: 'string',
        meta: {
          interface: 'select-dropdown',
          width: 'half',
          options: {
            choices: [
              { text: 'Draft', value: 'draft' },
              { text: 'Scheduled', value: 'scheduled' },
              { text: 'Publishing', value: 'publishing' },
              { text: 'Published', value: 'published' },
              { text: 'Failed', value: 'failed' },
            ],
          },
        },
        schema: { is_nullable: false, default_value: 'draft', max_length: 20 },
      },
      {
        field: 'publish_results',
        type: 'json',
        meta: {
          interface: 'input-code',
          options: { language: 'json' },
          special: ['cast-json'],
          width: 'full',
          note: 'Publishing results per platform',
        },
        schema: { is_nullable: true },
      },
      {
        field: 'created_by',
        type: 'uuid',
        meta: {
          interface: 'select-dropdown-m2o',
          special: ['m2o'],
          width: 'half',
          options: { template: '{{first_name}} {{last_name}}' },
        },
        schema: { is_nullable: true, foreign_key_table: 'directus_users' },
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // Social Analytics Snapshots
  // ─────────────────────────────────────────────────────────────────────────────
  social_analytics_snapshots: {
    meta: {
      icon: 'insights',
      note: 'Periodic analytics snapshots for accounts and posts',
      sort_field: 'captured_at',
    },
    fields: [
      {
        field: 'social_account',
        type: 'uuid',
        meta: {
          interface: 'select-dropdown-m2o',
          special: ['m2o'],
          width: 'half',
          required: true,
          options: { template: '{{account_name}} ({{platform}})' },
        },
        schema: { is_nullable: false, foreign_key_table: 'social_accounts' },
      },
      {
        field: 'snapshot_type',
        type: 'string',
        meta: {
          interface: 'select-dropdown',
          width: 'half',
          options: {
            choices: [
              { text: 'Account', value: 'account' },
              { text: 'Post', value: 'post' },
            ],
          },
        },
        schema: { is_nullable: false, max_length: 20 },
      },
      {
        field: 'platform_post_id',
        type: 'string',
        meta: {
          interface: 'input',
          width: 'half',
          note: 'For post-level snapshots',
        },
        schema: { is_nullable: true, max_length: 100 },
      },
      {
        field: 'metrics',
        type: 'json',
        meta: {
          interface: 'input-code',
          options: { language: 'json' },
          special: ['cast-json'],
          width: 'full',
          note: 'Platform-specific metrics object',
        },
        schema: { is_nullable: false },
      },
      {
        field: 'captured_at',
        type: 'timestamp',
        meta: {
          interface: 'datetime',
          width: 'half',
        },
        schema: { is_nullable: false },
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // Social Comments
  // ─────────────────────────────────────────────────────────────────────────────
  social_comments: {
    meta: {
      icon: 'chat_bubble',
      note: 'Synced comments from social platforms',
      sort_field: 'commented_at',
    },
    fields: [
      {
        field: 'social_account',
        type: 'uuid',
        meta: {
          interface: 'select-dropdown-m2o',
          special: ['m2o'],
          width: 'half',
          required: true,
        },
        schema: { is_nullable: false, foreign_key_table: 'social_accounts' },
      },
      {
        field: 'platform',
        type: 'string',
        meta: {
          interface: 'select-dropdown',
          width: 'half',
          options: {
            choices: [
              { text: 'Instagram', value: 'instagram' },
              { text: 'TikTok', value: 'tiktok' },
            ],
          },
        },
        schema: { is_nullable: false, max_length: 20 },
      },
      {
        field: 'platform_comment_id',
        type: 'string',
        meta: { interface: 'input', width: 'half' },
        schema: { is_nullable: false, max_length: 100 },
      },
      {
        field: 'platform_post_id',
        type: 'string',
        meta: { interface: 'input', width: 'half' },
        schema: { is_nullable: false, max_length: 100 },
      },
      {
        field: 'platform_post_url',
        type: 'string',
        meta: { interface: 'input', width: 'full' },
        schema: { is_nullable: true, max_length: 500 },
      },
      {
        field: 'author_username',
        type: 'string',
        meta: { interface: 'input', width: 'half' },
        schema: { is_nullable: false, max_length: 100 },
      },
      {
        field: 'author_profile_url',
        type: 'string',
        meta: { interface: 'input', width: 'half' },
        schema: { is_nullable: true, max_length: 500 },
      },
      {
        field: 'text',
        type: 'text',
        meta: {
          interface: 'input-multiline',
          width: 'full',
        },
        schema: { is_nullable: false },
      },
      {
        field: 'like_count',
        type: 'integer',
        meta: { interface: 'input', width: 'quarter' },
        schema: { is_nullable: false, default_value: 0 },
      },
      {
        field: 'reply_count',
        type: 'integer',
        meta: { interface: 'input', width: 'quarter' },
        schema: { is_nullable: false, default_value: 0 },
      },
      {
        field: 'is_hidden',
        type: 'boolean',
        meta: { interface: 'boolean', width: 'quarter' },
        schema: { is_nullable: false, default_value: false },
      },
      {
        field: 'is_reply',
        type: 'boolean',
        meta: { interface: 'boolean', width: 'quarter' },
        schema: { is_nullable: false, default_value: false },
      },
      {
        field: 'parent_comment_id',
        type: 'string',
        meta: { interface: 'input', width: 'half' },
        schema: { is_nullable: true, max_length: 100 },
      },
      {
        field: 'sentiment',
        type: 'string',
        meta: {
          interface: 'select-dropdown',
          width: 'half',
          options: {
            choices: [
              { text: 'Positive', value: 'positive' },
              { text: 'Neutral', value: 'neutral' },
              { text: 'Negative', value: 'negative' },
            ],
            allowNone: true,
          },
        },
        schema: { is_nullable: true, max_length: 20 },
      },
      {
        field: 'commented_at',
        type: 'timestamp',
        meta: { interface: 'datetime', width: 'half' },
        schema: { is_nullable: false },
      },
      {
        field: 'synced_at',
        type: 'timestamp',
        meta: { interface: 'datetime', width: 'half' },
        schema: { is_nullable: false },
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // Social Activity Log
  // ─────────────────────────────────────────────────────────────────────────────
  social_activity_log: {
    meta: {
      icon: 'history',
      note: 'Audit trail for social media actions',
      sort_field: 'date_created',
    },
    fields: [
      {
        field: 'action',
        type: 'string',
        meta: {
          interface: 'select-dropdown',
          width: 'half',
          options: {
            choices: [
              { text: 'Post Created', value: 'post_created' },
              { text: 'Post Scheduled', value: 'post_scheduled' },
              { text: 'Post Published', value: 'post_published' },
              { text: 'Post Failed', value: 'post_failed' },
              { text: 'Post Deleted', value: 'post_deleted' },
              { text: 'Account Connected', value: 'account_connected' },
              { text: 'Account Disconnected', value: 'account_disconnected' },
              { text: 'Token Refreshed', value: 'account_token_refreshed' },
              { text: 'Token Expired', value: 'account_token_expired' },
              { text: 'Comment Replied', value: 'comment_replied' },
              { text: 'Comment Hidden', value: 'comment_hidden' },
              { text: 'Comment Deleted', value: 'comment_deleted' },
              { text: 'Analytics Synced', value: 'analytics_synced' },
            ],
          },
        },
        schema: { is_nullable: false, max_length: 50 },
      },
      {
        field: 'entity_type',
        type: 'string',
        meta: {
          interface: 'select-dropdown',
          width: 'half',
          options: {
            choices: [
              { text: 'Post', value: 'post' },
              { text: 'Account', value: 'account' },
              { text: 'Comment', value: 'comment' },
            ],
          },
        },
        schema: { is_nullable: false, max_length: 20 },
      },
      {
        field: 'entity_id',
        type: 'string',
        meta: { interface: 'input', width: 'half' },
        schema: { is_nullable: false, max_length: 100 },
      },
      {
        field: 'platform',
        type: 'string',
        meta: {
          interface: 'select-dropdown',
          width: 'half',
          options: {
            choices: [
              { text: 'Instagram', value: 'instagram' },
              { text: 'TikTok', value: 'tiktok' },
            ],
            allowNone: true,
          },
        },
        schema: { is_nullable: true, max_length: 20 },
      },
      {
        field: 'details',
        type: 'json',
        meta: {
          interface: 'input-code',
          options: { language: 'json' },
          special: ['cast-json'],
        },
        schema: { is_nullable: true },
      },
      {
        field: 'performed_by',
        type: 'uuid',
        meta: {
          interface: 'select-dropdown-m2o',
          special: ['m2o'],
          width: 'half',
        },
        schema: { is_nullable: true, foreign_key_table: 'directus_users' },
      },
    ],
  },
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN SETUP FUNCTION
// ══════════════════════════════════════════════════════════════════════════════

async function setup() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗')
  console.log('║     SOCIAL MEDIA MODULE — DIRECTUS COLLECTIONS SETUP        ║')
  console.log('╚══════════════════════════════════════════════════════════════╝\n')
  console.log(`🔗 Directus URL: ${DIRECTUS_URL}\n`)

  // Test connection
  console.log('🔍 Testing Directus connection...')
  const { data: serverInfo, error: connError } = await directusRequest('/server/info')
  if (connError) {
    console.error(`❌ Failed to connect to Directus: ${connError}`)
    console.error('   Check your DIRECTUS_URL and DIRECTUS_SERVER_TOKEN')
    process.exit(1)
  }
  console.log('✅ Connected to Directus\n')

  // Create collections in order (respecting foreign key dependencies)
  const collectionOrder = [
    'social_clients',
    'social_accounts',
    'social_posts',
    'social_analytics_snapshots',
    'social_comments',
    'social_activity_log',
  ]

  let successCount = 0
  let skipCount = 0
  let failCount = 0

  for (const collectionName of collectionOrder) {
    const config = COLLECTIONS[collectionName as keyof typeof COLLECTIONS]
    const success = await createCollection(collectionName, config.meta, config.fields)

    if (success) {
      if (await collectionExists(collectionName)) {
        successCount++
      } else {
        skipCount++
      }
    } else {
      failCount++
    }
  }

  // Summary
  console.log('\n══════════════════════════════════════════════════════════════')
  console.log('                         SUMMARY')
  console.log('══════════════════════════════════════════════════════════════')
  console.log(`  ✅ Created/verified: ${successCount} collections`)
  if (skipCount > 0) console.log(`  ⏭️  Skipped (existing): ${skipCount} collections`)
  if (failCount > 0) console.log(`  ❌ Failed: ${failCount} collections`)
  console.log('')

  if (failCount === 0) {
    console.log('🎉 Setup complete!')
    console.log('')
    console.log('📝 Next steps:')
    console.log('   1. Regenerate TypeScript types:')
    console.log('      pnpm generate:types')
    console.log('')
    console.log('   2. Add runtime config to nuxt.config.ts (see README)')
    console.log('')
    console.log('   3. Set environment variables for Instagram/TikTok API')
    console.log('')
  } else {
    console.log('⚠️  Some collections failed to create. Check errors above.')
    process.exit(1)
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// RUN
// ══════════════════════════════════════════════════════════════════════════════

setup().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
