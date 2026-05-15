/**
 * Goal Templates — Stage 8.
 *
 * Built-in shapes for the most common goal patterns. Each template
 * pre-fills the GoalCreateModal AND carries a `reflection_prompts`
 * array that the AI sidebar / weekly check-in / retrospective use
 * to ground the coach in the user's chosen shape.
 *
 * Why static, not a Directus collection: templates are pattern-DNA,
 * not user data. They change with the product, not with the org. A
 * static module lets us iterate on prompts in code review without a
 * schema migration.
 */

import type { GoalCategory, GoalScope } from './directus';

export type GoalTimeframe = 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'custom';
export type GoalPriority = 'low' | 'medium' | 'high';

export interface GoalTemplatePrefill {
	title?: string;
	description?: string;
	scope?: GoalScope;
	category?: GoalCategory;
	target_unit?: string;
	timeframe?: GoalTimeframe;
	priority?: GoalPriority;
}

export interface GoalTemplate {
	id: string;
	name: string;
	icon: string;
	tagline: string;
	description: string;
	/** Prefill values applied to the form when the template is selected. */
	prefill: GoalTemplatePrefill;
	/**
	 * Coaching prompts shown when:
	 *  - creating a goal from this template (initial framing)
	 *  - the user opens the Coach Me chat (system context)
	 *  - the AI generates a weekly reflection
	 *
	 * Phrased as questions; the AI uses them as scaffolding, not script.
	 */
	reflection_prompts: string[];
	/** Optional accent color (HSL) for the picker card. */
	accent?: string;
}

export const GOAL_TEMPLATES: GoalTemplate[] = [
	{
		id: 'stretch',
		name: 'Stretch goal',
		icon: 'lucide:mountain',
		tagline: 'Beyond what feels safe',
		description: 'A target that scares you a little. Tracks honestly even if you fall short — the point is the climb.',
		prefill: {
			scope: 'user',
			category: 'growth',
			timeframe: 'quarterly',
			priority: 'high',
		},
		reflection_prompts: [
			'What fear or risk does this goal carry — name the worst-case so it loses some power?',
			'What\'s the smallest credible step you can take this week?',
			'Who could help if you stalled — have you told them?',
			'If you only make it 60% of the way, what was still worth doing?',
		],
		accent: 'hsl(217, 91%, 60%)',
	},
	{
		id: 'habit',
		name: 'Habit',
		icon: 'lucide:repeat',
		tagline: 'Cadence over outcomes',
		description: 'Build a recurring practice. Wins are measured in consistency — completion percentage = the right metric.',
		prefill: {
			scope: 'user',
			category: 'wellbeing',
			timeframe: 'monthly',
			target_unit: 'percent',
			priority: 'medium',
		},
		reflection_prompts: [
			'What signal triggers this behavior — when exactly does it start?',
			'What did you do on the days you missed? What pattern made it harder?',
			'Have you adjusted the bar so it\'s small enough to never skip?',
			'What\'s the next habit that this one unlocks?',
		],
		accent: 'hsl(173, 78%, 45%)',
	},
	{
		id: 'milestone',
		name: 'Milestone',
		icon: 'lucide:flag',
		tagline: 'One clear gate, by a date',
		description: 'A binary outcome with a hard deadline. Best for shipping, certifications, launches.',
		prefill: {
			scope: 'user',
			category: 'delivery',
			timeframe: 'monthly',
			priority: 'high',
		},
		reflection_prompts: [
			'What\'s the single most important blocker between now and the gate?',
			'If the deadline slipped by 2 weeks, what would have caused it?',
			'What "done" means — can you describe the demo in one sentence?',
			'Who owns the next decision that has to be made?',
		],
		accent: 'hsl(43, 95%, 55%)',
	},
	{
		id: 'okr',
		name: 'OKR',
		icon: 'lucide:target',
		tagline: 'Objective + measurable result',
		description: 'A directional objective paired with one quantitative key result. Hits hard for team/org-level goals.',
		prefill: {
			scope: 'organization',
			category: 'growth',
			timeframe: 'quarterly',
			priority: 'high',
		},
		reflection_prompts: [
			'Is the key result an output the team controls, or a market outcome that depends on luck?',
			'What initiatives most plausibly move the number this quarter?',
			'What would you cancel to free up time for the highest-leverage initiative?',
			'If the KR is way ahead at mid-quarter, what\'s the next ambitious move?',
		],
		accent: 'hsl(308, 80%, 52%)',
	},
	{
		id: 'revenue',
		name: 'Revenue target',
		icon: 'lucide:trending-up',
		tagline: 'Top-line growth',
		description: 'A dollar number you\'re committing to. Tracks invoice + Stripe revenue automatically.',
		prefill: {
			scope: 'organization',
			category: 'revenue',
			timeframe: 'quarterly',
			target_unit: 'USD',
			priority: 'high',
		},
		reflection_prompts: [
			'What\'s the realistic pipeline coverage ratio you need — and do you have it?',
			'Which deal in the current pipeline most needs your attention this week?',
			'Are you closer to the number by selling more or by raising prices?',
			'If you exceed the target, what unlocks for the next quarter?',
		],
		accent: 'hsl(142, 71%, 45%)',
	},
	{
		id: 'learning',
		name: 'Learning project',
		icon: 'lucide:book-open',
		tagline: 'Skill, not output',
		description: 'Acquire a capability. Tracks effort hours; success is artifact + post-mortem, not metric.',
		prefill: {
			scope: 'user',
			category: 'learning',
			timeframe: 'quarterly',
			target_unit: 'tasks',
			priority: 'medium',
		},
		reflection_prompts: [
			'What\'s the artifact you\'ll show at the end — a talk, a writeup, a working demo?',
			'What\'s the hardest part you\'re avoiding because it\'s uncomfortable?',
			'Who would benefit from a 30-min sync to teach back what you\'ve learned?',
			'If you stopped now, what was the most expensive thing you learned?',
		],
		accent: 'hsl(199, 89%, 55%)',
	},
];

export function getGoalTemplate(id: string): GoalTemplate | undefined {
	return GOAL_TEMPLATES.find((t) => t.id === id);
}
