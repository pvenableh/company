/**
 * Per-platform best-practice specs for social posts.
 *
 * Pure data — no fetch, no auth. Used by the compose screen's
 * recommendation panel to show image dimensions, hashtag ranges,
 * caption length caps, and other heuristics for each selected
 * platform + post type combo.
 *
 * Sourced from each platform's official guidance as of 2026-Q2.
 * Update when platforms change requirements.
 */

import type { SocialPlatform, PostType } from './social';

export interface PostTypeSpec {
	dimensions: string;
	aspectRatio: string;
	notes?: string;
	maxDurationSeconds?: number;
}

export interface PlatformSpec {
	displayName: string;
	captionMaxChars: number;
	hashtagRange: { min: number; max: number; ideal: number };
	supportsAltText: boolean;
	bestPostingTimes: string;
	postTypes: Partial<Record<PostType, PostTypeSpec>>;
	tips: string[];
}

export const PLATFORM_SPECS: Record<SocialPlatform, PlatformSpec> = {
	instagram: {
		displayName: 'Instagram',
		captionMaxChars: 2200,
		hashtagRange: { min: 3, max: 30, ideal: 8 },
		supportsAltText: true,
		bestPostingTimes: 'Mon–Fri, 11am or 7–9pm local',
		postTypes: {
			image: { dimensions: '1080×1350', aspectRatio: '4:5 (portrait) or 1:1 (square)', notes: 'Portrait fills more of the feed' },
			carousel: { dimensions: '1080×1350', aspectRatio: '4:5 — all slides should match', notes: 'Up to 10 slides; first slide drives swipe-rate' },
			reel: { dimensions: '1080×1920', aspectRatio: '9:16', notes: 'Hook in first 1.5s; safe-zone padding for UI overlays', maxDurationSeconds: 90 },
			story: { dimensions: '1080×1920', aspectRatio: '9:16', notes: '24h ephemeral; tap-throughs > views', maxDurationSeconds: 60 },
			video: { dimensions: '1080×1920', aspectRatio: '9:16 preferred', notes: 'Vertical performs better than landscape', maxDurationSeconds: 60 },
		},
		tips: [
			'First line is the hook — Instagram truncates after ~125 chars in feed',
			'Hashtags work best in the first comment, not the caption',
			'Tag location + people for extra reach',
		],
	},
	linkedin: {
		displayName: 'LinkedIn',
		captionMaxChars: 3000,
		hashtagRange: { min: 1, max: 5, ideal: 3 },
		supportsAltText: true,
		bestPostingTimes: 'Tue–Thu, 8–10am or 5–6pm local',
		postTypes: {
			image: { dimensions: '1200×627', aspectRatio: '1.91:1 (landscape) or 1:1', notes: 'Single image gets ~2× engagement vs link previews' },
			carousel: { dimensions: '1080×1080', aspectRatio: '1:1', notes: 'PDF-document style; max 300 slides via document upload' },
			video: { dimensions: '1920×1080', aspectRatio: '16:9 or 1:1', notes: 'Captions essential — 80% watch on mute', maxDurationSeconds: 600 },
			article: { dimensions: '1200×627', aspectRatio: '1.91:1 hero image', notes: 'Long-form drives profile visits more than impressions' },
			text: { dimensions: 'n/a', aspectRatio: 'n/a', notes: 'Text-only posts get strong reach when starting with a "stop-scroll" line' },
		},
		tips: [
			'Lead with a personal POV — LinkedIn rewards opinion + experience',
			'Avoid outbound links in the post body; put them in a comment',
			'@-mention people sparingly; over-tagging suppresses reach',
		],
	},
	facebook: {
		displayName: 'Facebook',
		captionMaxChars: 63206,
		hashtagRange: { min: 0, max: 3, ideal: 1 },
		supportsAltText: true,
		bestPostingTimes: 'Wed–Fri, 1–4pm local',
		postTypes: {
			image: { dimensions: '1200×630', aspectRatio: '1.91:1 or 1:1', notes: 'Square images claim more vertical real-estate' },
			video: { dimensions: '1280×720', aspectRatio: '16:9, 1:1, or 4:5', notes: 'Native video outperforms embedded', maxDurationSeconds: 240 },
			carousel: { dimensions: '1080×1080', aspectRatio: '1:1', notes: 'Up to 10 cards; each can have its own URL' },
			story: { dimensions: '1080×1920', aspectRatio: '9:16', maxDurationSeconds: 20 },
		},
		tips: [
			'Hashtags barely move reach on Facebook — keep them minimal',
			'Engagement-bait language ("comment Yes") is suppressed',
			'Posts with a question in the first line get ~30% more comments',
		],
	},
	tiktok: {
		displayName: 'TikTok',
		captionMaxChars: 4000,
		hashtagRange: { min: 3, max: 8, ideal: 5 },
		supportsAltText: false,
		bestPostingTimes: 'Tue/Thu, 6–10pm local',
		postTypes: {
			video: { dimensions: '1080×1920', aspectRatio: '9:16', notes: 'Hook in 0.5s; no static intros', maxDurationSeconds: 180 },
			reel: { dimensions: '1080×1920', aspectRatio: '9:16', notes: 'Trending audio boosts reach' },
		},
		tips: [
			'Mix 2 broad + 3 niche hashtags — pure niche underperforms',
			'Captions ≥ 100 chars correlate with higher avg watch time',
			'Replying to comments with video extends post lifespan',
		],
	},
	threads: {
		displayName: 'Threads',
		captionMaxChars: 500,
		hashtagRange: { min: 0, max: 1, ideal: 1 },
		supportsAltText: true,
		bestPostingTimes: 'Mon–Fri, 9am or 8pm local',
		postTypes: {
			text: { dimensions: 'n/a', aspectRatio: 'n/a', notes: 'Pure-text threads outperform image posts on reach' },
			image: { dimensions: '1080×1350', aspectRatio: '4:5 or 1:1' },
			video: { dimensions: '1080×1920', aspectRatio: '9:16 preferred', maxDurationSeconds: 300 },
		},
		tips: [
			'One topic-tag per post — Threads doesn\'t use # the same as IG',
			'Reply chains drive surface — keep posts short and serial',
			'Cross-post from Instagram via "Show on Threads" — saves a post',
		],
	},
};

// ── Heuristic recommendations engine ─────────────────────────────────

export type RecSeverity = 'tip' | 'warn' | 'error';
export type RecCategory = 'caption' | 'hashtag' | 'media' | 'cta' | 'timing' | 'platform';

export interface PostRecommendation {
	id: string;
	severity: RecSeverity;
	category: RecCategory;
	platform?: SocialPlatform;
	title: string;
	detail: string;
}

export interface PostDraftSnapshot {
	caption: string;
	mediaCount: number;
	mediaTypes: ('image' | 'video')[];
	postType: PostType;
	platforms: SocialPlatform[];
	ctaUrl: string;
	ctaLabel: string;
	scheduledAt?: string;
}

function countHashtags(caption: string): number {
	return (caption.match(/(^|\s)#[\w-]+/g) || []).length;
}

function severityRank(s: RecSeverity): number {
	if (s === 'error') return 0;
	if (s === 'warn') return 1;
	return 2;
}

export function analyzePostDraft(draft: PostDraftSnapshot): PostRecommendation[] {
	const recs: PostRecommendation[] = [];
	const captionLen = draft.caption.trim().length;
	const tagCount = countHashtags(draft.caption);

	// Caption-level
	if (captionLen === 0) {
		recs.push({
			id: 'caption-empty',
			severity: 'error',
			category: 'caption',
			title: 'Add a caption',
			detail: 'Posts without text get suppressed across every platform.',
		});
	} else if (captionLen < 50 && draft.platforms.includes('linkedin')) {
		recs.push({
			id: 'caption-short-linkedin',
			severity: 'tip',
			category: 'caption',
			platform: 'linkedin',
			title: 'LinkedIn likes longer captions',
			detail: 'Posts of 800–1500 chars dominate the LinkedIn feed. Add context, story, or POV.',
		});
	}

	// Per-platform caption cap
	for (const platform of draft.platforms) {
		const spec = PLATFORM_SPECS[platform];
		if (captionLen > spec.captionMaxChars) {
			recs.push({
				id: `caption-overlimit-${platform}`,
				severity: 'error',
				category: 'caption',
				platform,
				title: `Over ${spec.displayName}'s ${spec.captionMaxChars.toLocaleString()}-char limit`,
				detail: `You're at ${captionLen.toLocaleString()} chars. ${spec.displayName} will reject the post.`,
			});
		}
	}

	// Hashtag heuristics
	for (const platform of draft.platforms) {
		const spec = PLATFORM_SPECS[platform];
		const r = spec.hashtagRange;
		if (tagCount < r.min) {
			recs.push({
				id: `hashtag-too-few-${platform}`,
				severity: 'warn',
				category: 'hashtag',
				platform,
				title: `${spec.displayName}: ${tagCount} hashtag${tagCount === 1 ? '' : 's'} — add ${r.ideal - tagCount} more`,
				detail: `${spec.displayName} works best with ${r.min}–${r.max} hashtags (sweet spot ≈ ${r.ideal}).`,
			});
		} else if (tagCount > r.max) {
			recs.push({
				id: `hashtag-too-many-${platform}`,
				severity: 'warn',
				category: 'hashtag',
				platform,
				title: `${spec.displayName}: ${tagCount} hashtags — trim back`,
				detail: `${spec.displayName} caps useful hashtags around ${r.max}; more starts to look spammy.`,
			});
		}
	}

	// Media checks per post type
	const needsMedia: PostType[] = ['image', 'carousel', 'reel', 'video', 'story'];
	if (needsMedia.includes(draft.postType) && draft.mediaCount === 0) {
		recs.push({
			id: 'media-missing',
			severity: 'error',
			category: 'media',
			title: `${draft.postType} post needs media`,
			detail: `Add at least one ${draft.postType === 'reel' || draft.postType === 'video' ? 'video' : 'image'} before scheduling.`,
		});
	}

	if (draft.postType === 'carousel' && draft.mediaCount === 1) {
		recs.push({
			id: 'carousel-single',
			severity: 'warn',
			category: 'media',
			title: 'Carousel with one slide',
			detail: 'Add 2–10 slides — carousels outperform single images by 1.4× on Instagram.',
		});
	}

	if (draft.postType === 'carousel' && draft.mediaCount > 10) {
		recs.push({
			id: 'carousel-overlimit',
			severity: 'error',
			category: 'media',
			title: 'Too many slides',
			detail: 'Instagram & LinkedIn both cap carousels at 10 slides.',
		});
	}

	// CTA cohesion
	if (draft.ctaUrl && !draft.ctaLabel) {
		recs.push({
			id: 'cta-no-label',
			severity: 'tip',
			category: 'cta',
			title: 'Add a CTA label',
			detail: 'A short label ("Visit Website") makes the link feel intentional vs. tacked-on.',
		});
	}
	if (draft.ctaUrl && (draft.platforms.includes('instagram') || draft.platforms.includes('tiktok'))) {
		recs.push({
			id: 'cta-platform-warn',
			severity: 'tip',
			category: 'cta',
			title: 'Instagram/TikTok don\'t make caption links clickable',
			detail: 'Mention "link in bio" instead, or save the URL for LinkedIn/Facebook posts.',
		});
	}

	// Timing
	if (draft.scheduledAt) {
		const d = new Date(draft.scheduledAt);
		const hour = d.getHours();
		if (hour >= 22 || hour < 6) {
			recs.push({
				id: 'timing-late-night',
				severity: 'tip',
				category: 'timing',
				title: 'Late-night send window',
				detail: 'Most platforms peak 9am–9pm local. Consider rescheduling unless your audience is global.',
			});
		}
	}

	// Reel/Video without 9:16 hint
	if ((draft.postType === 'reel' || draft.postType === 'video' || draft.postType === 'story') && draft.platforms.includes('instagram')) {
		recs.push({
			id: 'video-vertical',
			severity: 'tip',
			category: 'media',
			platform: 'instagram',
			title: 'Use 9:16 vertical video',
			detail: 'Reels in 1080×1920 fill the screen and perform 30–40% better than landscape.',
		});
	}

	// Sort: errors → warns → tips, then category
	return recs.sort((a, b) => severityRank(a.severity) - severityRank(b.severity));
}
