/**
 * useEarnestDraft — headless state for the inline "Draft with Earnest"
 * affordance (see app/components/AI/EarnestDraftButton.vue).
 *
 * Keeps the network shape out of the trigger component so the same button can
 * front different generators per surface. Today it wraps the social caption
 * generator (`/api/social/ai-generate`); document + generic text generators can
 * be added here as sibling methods without touching the component.
 *
 * All generation is optional + non-blocking — a failed call throws for the
 * caller to toast; it never mutates the field on its own.
 */
import type {
  SocialAIGenerateResponse,
  SocialAIGeneratedPost,
  SocialPlatform,
  SocialContentType,
  SocialTone,
  SocialAudience,
} from '~~/shared/social';

export interface EarnestDraftSocialContext {
  /** The user's free-text brief / topic for the post. */
  brief: string;
  /** Platforms to tailor variants for. May be empty (master-only draft). */
  platforms: SocialPlatform[];
  organizationId?: string | null;
  clientId?: string | null;
  contentType?: SocialContentType;
  tone?: SocialTone;
  audience?: SocialAudience;
}

export function useEarnestDraft() {
  const isGenerating = ref(false);

  /**
   * Generate platform-tailored post copy from a brief. Returns the per-platform
   * posts; the caller decides how to map them onto its field(s). When no
   * platforms are supplied we still ask for one (instagram) so there's a master
   * caption to seed — the caller can drop the per-platform variants.
   */
  async function generateSocialPosts(
    ctx: EarnestDraftSocialContext,
  ): Promise<SocialAIGeneratedPost[]> {
    const platforms = ctx.platforms.length ? ctx.platforms : (['instagram'] as SocialPlatform[]);
    isGenerating.value = true;
    try {
      const res = await $fetch<SocialAIGenerateResponse>('/api/social/ai-generate', {
        method: 'POST',
        body: {
          topic: ctx.brief,
          platforms,
          contentType: ctx.contentType ?? 'announcement',
          tone: ctx.tone ?? 'professional',
          audience: ctx.audience ?? 'clients',
          organizationId: ctx.organizationId ?? undefined,
          clientId: ctx.clientId ?? undefined,
        },
      });
      return res?.posts ?? [];
    } finally {
      isGenerating.value = false;
    }
  }

  return { isGenerating, generateSocialPosts };
}
