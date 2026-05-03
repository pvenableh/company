import type {
	MarketingRecommendation,
	MarketingTouchKind,
	MarketingTouchAudienceTarget,
	SocialChannel,
	EmailCTA,
	AudienceFilter,
} from '~~/shared/marketing-persistence';

/**
 * A snapshot of a touch's content — written into regenerate_history before
 * each regenerate so the user can one-click undo back to the prior version.
 */
export interface TouchHistoryEntry {
	saved_at: string;
	email_subject: string | null;
	email_preview_text: string | null;
	email_body_markdown: string | null;
	email_cta: EmailCTA | null;
	social_channel: SocialChannel | null;
	social_caption: string | null;
	social_image_brief: string | null;
	audience_filter: AudienceFilter;
	send_offset_hours: number;
}

/**
 * A drafted touch — once persisted (after Generate), `id` and
 * `regenerate_history` are present. The drawer reads `id` to wire
 * per-touch regenerate/restore, and shows the restore affordance when
 * regenerate_history has at least one entry.
 */
export interface DraftedTouch {
	id?: number;
	kind: MarketingTouchKind;
	send_offset_hours: number;
	audience_target: MarketingTouchAudienceTarget;
	audience_filter: AudienceFilter;
	// email
	email_subject: string | null;
	email_preview_text: string | null;
	email_body_markdown: string | null;
	email_cta: EmailCTA | null;
	// social
	social_channel: SocialChannel | null;
	social_caption: string | null;
	social_image_brief: string | null;
	// persisted-only
	regenerate_history?: TouchHistoryEntry[] | null;
}

export interface DraftedCampaign {
	campaign_id?: number;
	touches: DraftedTouch[];
	phase_strategy: string | null;
	cadence_rationale: string;
	facts_used: { id: string; label: string; kind: string }[];
	tokens_spent: number;
	duration_ms: number;
	voice_signals: string[];
	audience_summary: { size: number; sample_names: string[] };
}

/**
 * Generator client.
 *
 * `generate(rec)` calls the real server endpoint
 *   POST /api/marketing/recommendations/[id]/generate
 * which runs the Anthropic generator, deducts tokens, and flips the
 * recommendation to `drafted`.
 *
 * `generateStub(rec)` is a no-AI fallback that returns realistic drafted
 * touches in the same DraftedCampaign shape — used for unwired card types
 * (server returns 501) and when you want to preview the drawer UX without
 * burning tokens (?stub=1 query param).
 */
export function useMarketingDrafts() {
	async function generate(rec: MarketingRecommendation): Promise<DraftedCampaign> {
		// Dev toggle: ?stub=1 forces the stub path (skip API + tokens).
		if (import.meta.client && new URLSearchParams(window.location.search).get('stub') === '1') {
			return generateStub(rec);
		}

		try {
			const res = await $fetch<DraftedCampaign>(
				`/api/marketing/recommendations/${rec.id}/generate`,
				{ method: 'POST' },
			);
			return res;
		} catch (err: any) {
			// Server returns 501 for card types we haven't wired yet — fall back
			// to the stub so the demo flow stays usable.
			const status = err?.response?.status ?? err?.statusCode;
			if (status === 501) {
				console.info(`[useMarketingDrafts] using stub for unwired card_type "${rec.card_type}"`);
				return generateStub(rec);
			}
			throw err;
		}
	}

	async function generateStub(rec: MarketingRecommendation): Promise<DraftedCampaign> {
		const data = (rec.candidate_data || {}) as any;

		// Simulate generator latency for the loading state.
		await new Promise((resolve) => setTimeout(resolve, 600));

		switch (rec.card_type) {
			case 'dormant_clients':
				return draftDormantClients(rec, data);
			case 'project_complete':
				return draftProjectComplete(rec, data);
			case 'lead_reengagement':
				return draftLeadReengagement(rec, data);
			default:
				return {
					touches: [],
					phase_strategy: null,
					cadence_rationale: '',
					facts_used: [],
					tokens_spent: 0,
					duration_ms: 0,
					voice_signals: [],
					audience_summary: { size: 0, sample_names: [] },
				};
		}
	}

	return { generate, generateStub };
}

// ─── Stub bodies ────────────────────────────────────────────────────────────

function draftDormantClients(rec: MarketingRecommendation, data: any): DraftedCampaign {
	const samples: string[] = data?.audience?.sample_names ?? [];
	const size: number = data?.audience?.size ?? 0;

	return {
		phase_strategy:
			'Open with the Awwwards moment as the hook — gives every recipient a reason to read past the first line that isn\'t "it\'s been a while."',
		touches: [
			{
				kind: 'email',
				send_offset_hours: 0,
				audience_target: 'lookalike_audience',
				audience_filter: 'all',
				email_subject: 'Terra Wellness just hit Awwwards',
				email_preview_text: 'Made me think about what we\'d do for you next.',
				email_body_markdown: `Hi {{first_name}},

Quick note — Terra Wellness, a project we wrapped in March, picked up Awwwards Site of the Day last week. Their booking conversion is up 22% since launch.

It felt like the kind of moment to reach out. We've been heads-down on a few things in the same vein as what we built together, and I'm genuinely curious what's on your plate this quarter.

No pitch — even just 15 minutes to compare notes would be worth a look. Up for a quick call?`,
				email_cta: 'book_call',
				social_channel: null,
				social_caption: null,
				social_image_brief: null,
			},
			{
				kind: 'email',
				send_offset_hours: 96,
				audience_target: 'lookalike_audience',
				audience_filter: 'unopened_previous',
				email_subject: 'One more thought',
				email_preview_text: 'On what holds up and what drifts.',
				email_body_markdown: `Hi {{first_name}},

My last note may have slipped past — fair, inboxes are inboxes.

If I had to pick one thing to bring up: the kind of brand work we did together holds up best when it gets a light look every 18-24 months. Not a full refresh — more a check on what's drifting.

Reply if that's interesting and I'll send over what that usually looks like.`,
				email_cta: 'reply',
				social_channel: null,
				social_caption: null,
				social_image_brief: null,
			},
			{
				kind: 'social',
				send_offset_hours: 48,
				audience_target: 'public',
				audience_filter: 'all',
				email_subject: null,
				email_preview_text: null,
				email_body_markdown: null,
				email_cta: null,
				social_channel: 'linkedin',
				social_caption: `Quietly thrilled — Terra Wellness, a website we shipped earlier this year, just picked up Awwwards Site of the Day.

The part that's genuinely satisfying: their booking conversion is up 22% since launch. Pretty designs are good. Pretty designs that move the number are the kind of thing we set out to make.

If you're sitting on a brand or site that's done its job and is starting to feel a little stale — worth a look together. The second pass is usually where we do our best work: there's already a working business, and the question is just how to sharpen it.

#branddesign`,
				social_image_brief:
					'Hero crop of the Terra Wellness website on a laptop, with the Awwwards Site of the Day badge composed into the corner.',
			},
		],
		cadence_rationale:
			'Open Tuesday morning with a value-first hook (the Terra Awwwards win). Follow up to non-openers four days later with a softer, more abstract angle. Run the social post in parallel on Thursday — different audience, complementary tone.',
		facts_used: [
			{ id: 'proj_terra', kind: 'project', label: 'Terra Wellness rebrand' },
			{ id: 'win_awwwards', kind: 'win', label: 'Awwwards Site of the Day' },
			{ id: 'svc_brand', kind: 'service', label: 'Brand Strategy' },
		],
		tokens_spent: 1840,
		duration_ms: 18420,
		voice_signals: [
			'em-dash openers ("Quick note —")',
			'"genuinely" — your phrase',
			'length and warmth match your sent emails',
		],
		audience_summary: { size, sample_names: samples },
	};
}

function draftProjectComplete(rec: MarketingRecommendation, data: any): DraftedCampaign {
	const contact: string = data?.signal?.primary_contact_name ?? 'Sarah Chen';
	const project: string = data?.signal?.project_title ?? 'Terra Wellness rebrand';

	return {
		phase_strategy:
			'Single warm email to the contact, anchored on the Awwwards win as the moment to come back to her, asking three short questions she can answer in any depth she has time for.',
		touches: [
			{
				kind: 'email',
				send_offset_hours: 0,
				audience_target: 'project_contact',
				audience_filter: 'all',
				email_subject: 'Terra hitting Awwwards made our week',
				email_preview_text: 'Three quick questions, if you have a sec.',
				email_body_markdown: `Hi ${contact.split(' ')[0]},

Quick note — Terra picked up Awwwards Site of the Day a couple of days ago. Genuinely the best thing that's happened around here in a while, and it felt right to come back to you with it.

As we start writing about the project for our own work, would you be up for answering three short questions? Even one-line answers help:

- What did booking look like before the new site, in your own words?
- What's surprised you most since launch?
- If you were recommending us to another founder, what would you tell them?

No rush — reply when it's easy. Happy to jump on 15 minutes if it's faster to talk through.`,
				email_cta: 'reply_with_question',
				social_channel: null,
				social_caption: null,
				social_image_brief: null,
			},
		],
		cadence_rationale:
			'One touch. The Awwwards win is a strong, specific anchor — asking once with a real moment beats a sequence. If she doesn\'t reply within 10 days, the recommendation re-surfaces next week.',
		facts_used: [
			{ id: 'proj_terra', kind: 'project', label: project },
			{ id: 'win_awwwards', kind: 'win', label: 'Awwwards Site of the Day' },
		],
		tokens_spent: 720,
		duration_ms: 9810,
		voice_signals: [
			'em-dash opener ("Quick note —")',
			'"genuinely" — your phrase',
			'soft three-question structure matches your sent style',
		],
		audience_summary: { size: 1, sample_names: [contact] },
	};
}

function draftLeadReengagement(rec: MarketingRecommendation, data: any): DraftedCampaign {
	const samples: string[] = data?.audience?.sample_names ?? [];
	const size: number = data?.cluster?.size ?? data?.audience?.size ?? 0;
	const topic: string = data?.cluster?.label ?? 'Brand strategy';

	return {
		phase_strategy: `Open with the Terra Wellness case as a concrete proof point of ${topic.toLowerCase()} work landing — exactly the topic these leads originally asked about. Single email, soft reply CTA.`,
		touches: [
			{
				kind: 'email',
				send_offset_hours: 0,
				audience_target: 'lookalike_audience',
				audience_filter: 'cluster:brand_strategy',
				email_subject: 'What changed when Terra Wellness redid their brand',
				email_preview_text: 'Plus the part the founder didn\'t expect.',
				email_body_markdown: `Hi {{first_name}},

Quick note with something relevant — a ${topic.toLowerCase()} project we wrapped this spring landed in a way worth sharing.

Terra Wellness, a wellness studio we worked with, rebuilt their identity and site. Booking conversion is up 22% post-launch, and the site picked up Awwwards Site of the Day last week.

The part their founder didn't expect: her team got more confident in customer conversations because the brand finally matched who they actually were. That second-order effect — internal alignment from external work — is the kind of result we tend to see on second-pass projects, where there's already a working business and the question is sharpening rather than starting over.

If this is roughly the territory you were thinking about when we first connected, happy to share more — even just the rough sketch of what that engagement looked like. Reply if interesting.`,
				email_cta: 'reply',
				social_channel: null,
				social_caption: null,
				social_image_brief: null,
			},
		],
		cadence_rationale:
			'One touch. At 41 days inactive on average, this cluster is past the easy-reply window — a sequence here is more likely to damage reputation than recover the lead. One specific email lands or it doesn\'t.',
		facts_used: [
			{ id: 'proj_terra', kind: 'project', label: 'Terra Wellness rebrand' },
			{ id: 'result_22pct', kind: 'win', label: 'Booking conversion +22%' },
			{ id: 'win_awwwards', kind: 'win', label: 'Awwwards Site of the Day' },
			{ id: 'svc_brand', kind: 'service', label: 'Brand Strategy' },
		],
		tokens_spent: 1410,
		duration_ms: 14290,
		voice_signals: [
			'em-dash opener ("Quick note —")',
			'"genuinely" / "worth a look" — your phrases',
			'opener avoids forbidden phrases ("circling back", "still interested")',
		],
		audience_summary: { size, sample_names: samples },
	};
}
