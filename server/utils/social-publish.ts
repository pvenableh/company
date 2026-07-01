/**
 * Social publish helper
 *
 * Shared between the scheduled-publish cron and the "Post Now" route.
 * Loads a social_posts row, calls the appropriate platform adapter for each
 * target account, then writes per-platform results back to publish_results
 * and flips post_status to published / failed.
 *
 * Caller is responsible for tenancy — this util trusts that organization
 * scoping was already enforced upstream.
 */

import {
  getSocialPostById,
  updateSocialPost,
  getSocialAccountById,
  getDecryptedAccessToken,
  logSocialActivity,
} from './social-directus'
import { isSocialPublishingEnabled } from './social-publishing'
import { publishLinkedInPost } from '~~/server/adapters/linkedin'
import {
  publishFacebookTextPost,
  publishFacebookPhoto,
  publishFacebookVideo,
} from '~~/server/adapters/facebook'
import {
  publishInstagramImage,
  publishInstagramReel,
  publishInstagramCarousel,
  publishInstagramStory,
} from '~~/server/adapters/instagram'
import {
  publishThreadsText,
  publishThreadsImage,
  publishThreadsVideo,
  publishThreadsCarousel,
} from '~~/server/adapters/threads'
import type { SocialAccount, SocialPost, SocialPostTarget, SocialPlatform, PublishResult } from '~~/shared/social'

/**
 * Resolve the caption that should publish to a specific platform.
 * Looks up a per-platform variant from the master-variant composer
 * (`caption_variants[platform]`) and falls back to the master `caption` when
 * the platform is in sync.
 */
function resolveCaptionForPlatform(post: SocialPost, platform: SocialPlatform): string {
  const variant = post.caption_variants?.[platform]
  if (typeof variant === 'string') return variant
  return post.caption
}

/**
 * Append the optional CTA URL + label to the body that goes out to the
 * platform. Long-form platforms (LinkedIn / Facebook / Threads) auto-fetch OG
 * tags from the URL — we just need the URL in the text. Instagram and TikTok
 * don't make caption links clickable, but the URL is still useful as
 * reference text.
 */
function buildPublishedText(post: SocialPost, platform: SocialPlatform): string {
  const caption = resolveCaptionForPlatform(post, platform)
  if (!post.cta_url) return caption
  const label = post.cta_label?.trim()
  const suffix = label ? `${label}: ${post.cta_url}` : post.cta_url
  return `${caption}\n\n${suffix}`
}

async function publishToTarget(
  post: SocialPost,
  account: SocialAccount,
  target: SocialPostTarget,
): Promise<PublishResult> {
  const accessToken = await getDecryptedAccessToken(account.id)
  if (!accessToken) {
    return {
      platform: target.platform,
      account_id: account.id,
      success: false,
      error: 'Missing or invalid access token',
    }
  }

  const text = buildPublishedText(post, target.platform)
  const mediaUrls = post.media_urls || []
  const mediaTypes = post.media_types || []

  try {
    let res: { id: string; permalink?: string }

    switch (target.platform) {
      case 'linkedin': {
        const meta = (account.metadata as Record<string, any>) || {}
        const authorUrn = meta.authorUrn
        if (!authorUrn) throw new Error('LinkedIn account missing authorUrn metadata')
        const opts = (target.options as { visibility?: 'PUBLIC' | 'CONNECTIONS' }) || {}
        res = await publishLinkedInPost(authorUrn, accessToken, {
          text,
          mediaUrls,
          mediaTypes,
          visibility: opts.visibility || 'PUBLIC',
          articleUrl: post.cta_url || undefined,
        })
        break
      }

      case 'facebook': {
        const pageId = account.platform_user_id
        if (post.post_type === 'story') {
          throw new Error('Facebook Page Stories require additional permissions and are not yet supported. Use Instagram for cross-posted Stories.')
        }
        if (!mediaUrls.length) {
          res = await publishFacebookTextPost(pageId, accessToken, text, post.cta_url || undefined)
        } else if (mediaTypes[0] === 'video') {
          res = await publishFacebookVideo(pageId, accessToken, mediaUrls[0]!, text)
        } else {
          res = await publishFacebookPhoto(pageId, accessToken, mediaUrls[0]!, text)
        }
        break
      }

      case 'instagram': {
        const igUserId = account.platform_user_id
        if (!mediaUrls.length) {
          throw new Error('Instagram requires at least one image or video')
        }
        if (post.post_type === 'story') {
          if (mediaUrls.length > 1) {
            throw new Error('Instagram Stories accept one image or video at a time')
          }
          const storyRes = await publishInstagramStory(
            igUserId,
            accessToken,
            mediaUrls[0]!,
            (mediaTypes[0] === 'video' ? 'video' : 'image') as 'image' | 'video',
          )
          res = { id: storyRes.id }
        } else if (post.post_type === 'carousel' || mediaUrls.length > 1) {
          res = await publishInstagramCarousel(
            igUserId,
            accessToken,
            mediaUrls.map((url, i) => ({
              url,
              type: (mediaTypes[i] || 'image') as 'image' | 'video',
            })),
            text,
          )
        } else if (post.post_type === 'reel' || mediaTypes[0] === 'video') {
          res = await publishInstagramReel(igUserId, accessToken, mediaUrls[0]!, text)
        } else {
          res = await publishInstagramImage(igUserId, accessToken, mediaUrls[0]!, text)
        }
        break
      }

      case 'threads': {
        const userId = account.platform_user_id
        if (!mediaUrls.length) {
          res = await publishThreadsText(userId, accessToken, text)
        } else if (mediaUrls.length > 1) {
          res = await publishThreadsCarousel(
            userId,
            accessToken,
            mediaUrls.map((url, i) => ({
              url,
              type: (mediaTypes[i] || 'image') as 'image' | 'video',
            })),
            text,
          )
        } else if (mediaTypes[0] === 'video') {
          res = await publishThreadsVideo(userId, accessToken, mediaUrls[0]!, text)
        } else {
          res = await publishThreadsImage(userId, accessToken, mediaUrls[0]!, text)
        }
        break
      }

      case 'tiktok': {
        // TikTok publishing requires the direct-post job flow + status polling
        // and is beyond the synchronous fast-path used by the cron worker. The
        // dedicated TikTok composer at /social/* handles this — for now, mark
        // as failed so it surfaces in the calendar instead of silently looping.
        throw new Error('TikTok publishing is not yet wired into the scheduled-publish worker')
      }

      default:
        throw new Error(`Unsupported platform: ${target.platform}`)
    }

    return {
      platform: target.platform,
      account_id: account.id,
      success: true,
      platform_post_id: res.id,
      published_at: new Date().toISOString(),
    }
  } catch (err: any) {
    return {
      platform: target.platform,
      account_id: account.id,
      success: false,
      error: err?.data?.message || err?.message || 'Unknown publishing error',
    }
  }
}

export interface PublishOutcome {
  postId: string
  status: 'published' | 'failed' | 'partial'
  results: PublishResult[]
}

/**
 * Publish a single post to all its targets and persist the results.
 */
export async function publishSocialPost(postId: string): Promise<PublishOutcome> {
  // Defense-in-depth kill-switch. The two entry points (publish-now route,
  // publish-scheduled cron) already refuse when publishing is disabled, but we
  // guard the choke point too so NO caller — a future worker, Directus flow, or
  // new endpoint — can post externally while the Meta/LinkedIn app credentials
  // aren't approved. The post's state is left untouched (never flips to
  // publishing/published). See isSocialPublishingEnabled + the kill-switch memo.
  if (!isSocialPublishingEnabled()) {
    throw new Error('Social publishing is disabled (kill-switch); no external post was made.')
  }

  const post = await getSocialPostById(postId)
  if (!post) throw new Error(`Post ${postId} not found`)
  if (post.status === 'published') {
    return { postId, status: 'published', results: post.publish_results || [] }
  }

  await updateSocialPost(postId, { status: 'publishing' })

  const results: PublishResult[] = []
  for (const target of post.platforms) {
    if (!target.account_id) continue
    const account = await getSocialAccountById(target.account_id)
    if (!account) {
      results.push({
        platform: target.platform,
        account_id: target.account_id,
        success: false,
        error: 'Connected account no longer exists',
      })
      continue
    }
    results.push(await publishToTarget(post, account, target))
  }

  const successCount = results.filter((r) => r.success).length
  const finalStatus: 'published' | 'failed' | 'partial' =
    successCount === 0
      ? 'failed'
      : successCount === results.length
        ? 'published'
        : 'partial'

  await updateSocialPost(postId, {
    status: finalStatus === 'partial' ? 'published' : finalStatus,
    publish_results: results,
    published_at: successCount > 0 ? new Date().toISOString() : null,
    error_message: finalStatus === 'failed'
      ? results.map((r) => `${r.platform}: ${r.error}`).filter(Boolean).join('; ')
      : null,
  })

  await logSocialActivity({
    action: successCount > 0 ? 'post_published' : 'post_failed',
    entity_type: 'post',
    entity_id: postId,
    details: { results },
  })

  return { postId, status: finalStatus, results }
}
