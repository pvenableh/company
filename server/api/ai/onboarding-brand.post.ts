/**
 * AI Onboarding Brand Draft.
 *
 * Drafts `brand_direction` + `target_audience` for a BRAND-NEW org during the
 * signup wizard — before the org row exists. Unlike ai/brand-suggestions (which
 * needs a saved entityId), this works from raw wizard inputs: name, industry,
 * an optional website (which we actually read), and 1–2 optional sharpening
 * answers. Returns editable prose the user refines, not a locked value.
 *
 * No org token enforcement: there is no org yet, and this is a single low-cost
 * onboarding call gated by an authenticated session.
 */
import { getLLMProvider } from '~~/server/utils/llm/factory';
import { readWebsite } from '~~/server/utils/read-website';
import type { ChatMessage } from '~~/server/utils/llm/types';

interface OnboardingBrandRequest {
	name?: string;
	industry?: string; // industry name (free text)
	website?: string;
	answers?: {
		idealClient?: string;
		differentiator?: string;
	};
}

interface OnboardingBrandResponse {
	brand_direction: string;
	target_audience: string;
	/** Whether the website was successfully read (for UI messaging). */
	readWebsite: boolean;
}

export default defineEventHandler(async (event): Promise<OnboardingBrandResponse> => {
	const session = await requireUserSession(event);
	if (!(session as any).user?.id) {
		throw createError({ statusCode: 401, message: 'Authentication required' });
	}

	const body = await readBody<OnboardingBrandRequest>(event);
	const name = String(body?.name || '').trim();
	const industry = String(body?.industry || '').trim();
	const website = String(body?.website || '').trim();

	if (!name && !industry && !website) {
		throw createError({ statusCode: 400, message: 'Provide at least a name, industry, or website.' });
	}

	// Read the website when provided — this is the strongest signal.
	let siteExcerpt = '';
	let readSite = false;
	if (website) {
		const site = await readWebsite(website);
		if (site.ok) {
			readSite = true;
			siteExcerpt = [
				site.title ? `Page title: ${site.title}` : '',
				site.description ? `Meta description: ${site.description}` : '',
				site.text ? `Page content: ${site.text}` : '',
			].filter(Boolean).join('\n');
		}
	}

	const contextLines = [
		name ? `Business name: ${name}` : '',
		industry ? `Industry: ${industry}` : '',
		website ? `Website: ${website}` : '',
		body?.answers?.idealClient ? `Who they described as their ideal client: ${body.answers.idealClient}` : '',
		body?.answers?.differentiator ? `What they say makes them different: ${body.answers.differentiator}` : '',
		siteExcerpt ? `\n--- Website content (read live) ---\n${siteExcerpt}` : '',
	].filter(Boolean).join('\n');

	const systemPrompt = `You are a brand strategist helping a new customer set up their workspace. From the details below, write two short, specific fields that will be used as persistent context for every future AI action in their account, so make them genuinely useful — grounded in the real business, not generic filler.

${contextLines}

Return ONLY valid JSON (no markdown fences, no commentary) in this exact shape:
{
  "brand_direction": "2-4 sentences describing this brand's positioning, voice/tone, and how it should come across. Written in second person ('Your brand is...') or descriptive prose.",
  "target_audience": "2-4 sentences describing the ideal customer — who they are, what they care about, and the pain points this business solves."
}

RULES:
- Base everything on the ACTUAL details provided (especially the website content when present). Do not invent facts that contradict them.
- If signal is thin (e.g. only an industry), write a sensible, industry-appropriate starting point the user can refine — never say you lack information.
- Be concrete and free of buzzword soup. No "leverage synergies" filler.
- Do not include the business name as a heading; write natural prose.`;

	const messages: ChatMessage[] = [{
		role: 'user',
		content: 'Draft the brand_direction and target_audience for this business.',
	}];

	try {
		const provider = getLLMProvider();
		const response = await provider.chat(messages, {
			systemPrompt,
			maxTokens: 900,
			temperature: 0.7,
		});

		let content = response.content.trim();
		if (content.startsWith('```')) {
			content = content.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
		}
		const parsed = JSON.parse(content) as { brand_direction?: string; target_audience?: string };

		return {
			brand_direction: String(parsed.brand_direction || '').trim(),
			target_audience: String(parsed.target_audience || '').trim(),
			readWebsite: readSite,
		};
	} catch (error: any) {
		if (error?.statusCode) throw error;
		console.error('[ai/onboarding-brand] LLM error:', error?.message || error);
		throw createError({ statusCode: 502, message: 'Could not draft your brand voice. You can write it yourself or try again.' });
	}
});
