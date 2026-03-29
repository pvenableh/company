<template>
	<div class="sell-sheet">
		<!-- Top Nav -->
		<nav class="sell-nav">
			<nuxt-link to="/" class="sell-nav-brand">
				<LogoEarnest size="sm" />
			</nuxt-link>
			<nuxt-link to="/auth/signin" class="sell-nav-login">
				Sign In
			</nuxt-link>
		</nav>

		<!-- Hero -->
		<section ref="heroRef" class="earnest-hero">
			<p class="hero-kicker opacity-0">The AI-powered business operating system</p>
			<h1 class="hero-wordmark opacity-0">
				Earnest
				<span class="hero-period">.</span>
			</h1>
			<p class="hero-tagline opacity-0">
				Do
				<span class="hero-cycle-wrap"><span ref="heroCycleRef" class="hero-cycle">good</span></span>
				work
				<span class="bp">.</span>
			</p>
			<p class="hero-sub opacity-0">
				Intuitive movement
				<span class="bp">.</span>
				Actionable experiences
				<span class="bp">.</span>
				AI that sees everything
				<span class="bp">.</span>
			</p>
			<div class="hero-actions opacity-0">
				<nuxt-link to="/register" class="btn-ink">Start for free</nuxt-link>
				<nuxt-link to="#features" class="btn-ghost">See how it works</nuxt-link>
			</div>
		</section>

		<!-- Marquee -->
		<div class="marquee-wrap" aria-hidden="true">
			<div class="marquee-track">
				<span v-for="(item, i) in [...marqueeItems, ...marqueeItems]" :key="i" class="marquee-item">
					<UIcon :name="item.icon" class="marquee-icon" />
					{{ item.label }}
					<span class="marquee-dot">&middot;</span>
				</span>
			</div>
		</div>

		<!-- Replaces Section (before Truth) -->
		<section ref="replacesRef" class="replaces-section">
			<p class="replaces-kicker opacity-0">One platform replaces</p>
			<div class="replaces-grid">
				<div v-for="(tool, index) in replacedTools" :key="index" class="replaces-item opacity-0">
					<UIcon :name="tool.icon" class="replaces-icon" />
					<span class="replaces-name">{{ tool.name }}</span>
					<span class="replaces-for">{{ tool.replaces }}</span>
				</div>
			</div>
			<p class="replaces-cta opacity-0">
				All of this.
				<em>
					One login
					<span class="bp">.</span>
				</em>
			</p>
		</section>

		<!-- Truth Section -->
		<section ref="truthRef" class="truth-section">
			<div class="truth-label opacity-0">The honest case</div>
			<div class="truth-body">
				<h2 class="truth-title opacity-0">
					Your business runs on {{ toolCountWord }} tools. It should run on
					<span class="truth-one">one source of truth</span>
					<span class="bp">.</span>
				</h2>
				<p class="truth-text opacity-0">
					You have a project tool. An invoice tool. A social tool. A phone system. A shared inbox. A calendar. A goal
					tracker. And Slack to hold it all together. {{ toolCountWord }} tools. {{ toolCountWord }} logins. Zero
					collective knowledge.
				</p>

				<p class="truth-text opacity-0">
					<strong>EARNEST replaces the pile.</strong>
					One platform, one login, one source of truth where the work actually lives &mdash; from the first conversation to the
					final payment. Nothing to integrate. Nothing to re-explain. Every page is an actionable experience &mdash; not a report you read, but a surface you work from.
				</p>

				<p class="truth-text opacity-0">
					And because everything is in one place,
					<strong>AI can see the whole business</strong>
					&mdash; not just a slice of it. It reads your contacts, clients, projects, revenue, deals, goals, campaigns,
					and brand direction together, then connects the dots to build strategies, forecasts, and plans that no
					isolated tool can produce. Your marketing plan knows your pipeline. Your CRM analysis knows your brand voice.
					Your goal suggestions know your financials.
					<em>That</em>
					is the difference.
				</p>

				<p class="truth-text opacity-0">
					Intuitive movement between every module. Financials surface who owes you money. Your CRM shows who needs attention. Goals show you one number &mdash; your progress &mdash; and what to do next. Two companion apps &mdash; CardDesk for networking and E&sup2; for mobile &mdash; keep everything connected on the go.
				</p>
			</div>
		</section>

		<!-- AI Reveal -->
		<section ref="aiRef" class="ai-reveal">
			<div class="ai-reveal-inner">
				<p class="ai-kicker opacity-0">What one platform makes possible</p>
				<h2 class="ai-headline opacity-0">
					Your data talks
					<span class="bp">.</span>
					<br />
					<em>
						AI listens
						<span class="bp">.</span>
					</em>
				</h2>
				<p class="ai-lede opacity-0">
					Most tools bolt AI onto one channel. EARNEST gives AI the full picture &mdash; people, companies, projects,
					revenue, conversations, campaigns, financials, and goals &mdash; layered with brand direction and target
					audience for every client. The result is CRM intelligence, marketing plans, pipeline forecasts, and goal
					suggestions that are uniquely yours. Not generic advice. Your business, analyzed whole.
				</p>

				<div class="ai-cap opacity-0">
					<span class="ai-cap-number">01</span>
					<h3 class="ai-cap-title">Connected intelligence</h3>
					<p class="ai-cap-desc">
						Every other platform analyzes its own data in isolation. EARNEST connects AI to your entire operation —
						people, companies, projects, revenue, conversations, campaigns, and goals — simultaneously. The result is
						insight no single-purpose tool can produce.
					</p>
				</div>
				<div class="ai-cap opacity-0">
					<span class="ai-cap-number">02</span>
					<h3 class="ai-cap-title">Brand awareness</h3>
					<p class="ai-cap-desc">
						Set brand direction, goals, target audience, and positioning per client, per team, per organization. Every
						AI feature reads this context. Social posts, email campaigns, CRM strategies, and marketing plans all sound
						like your business &mdash; not a generic template.
					</p>
				</div>
				<div class="ai-cap opacity-0">
					<span class="ai-cap-number">03</span>
					<h3 class="ai-cap-title">Marketing intelligence</h3>
					<p class="ai-cap-desc">
						Feed EARNEST a client. It reads their brand direction, pipeline stage, contact history, email and social
						performance, and stated goals &mdash; then generates a complete multi-channel marketing plan with email
						sequences, social cadence, content themes, KPIs, and a 4-week action calendar. Written in their voice.
					</p>
				</div>
				<div class="ai-cap opacity-0">
					<span class="ai-cap-number">04</span>
					<h3 class="ai-cap-title">Productivity engine</h3>
					<p class="ai-cap-desc">
						Scans every module in real time &mdash; tickets, projects, tasks, invoices, deals, channels, social, and
						goals &mdash; then surfaces prioritized actions instantly. No AI tokens. Pure algorithmic intelligence that
						loads the moment you open EARNEST.
					</p>
				</div>
			</div>
		</section>

		<!-- Divider -->
		<div class="section-rule"></div>

		<!-- Features -->
		<section ref="featuresRef" id="features" class="features-section">
			<div class="features-header">
				<p class="features-hero-word opacity-0">Everything</p>
				<h2 class="features-title opacity-0">
					your business needs
					<span class="bp">.</span>
					<br />
					<em class="features-nothing">Nothing</em>
					it doesn't
					<span class="bp">.</span>
				</h2>
				<p class="features-sub opacity-0">
					Built for teams who are serious about their work
					<span class="bp">.</span>
				</p>
			</div>

			<div class="feature-list">
				<div v-for="(feature, index) in features" :key="index" class="feature-item opacity-0">
					<span class="feature-number">{{ String(index + 1).padStart(2, '0') }}</span>
					<div class="feature-name">{{ feature.name }}</div>
					<div class="feature-desc">{{ feature.desc }}</div>
				</div>
			</div>
		</section>

		<!-- Quote Break -->
		<div class="quote-break">
			<p class="quote-text opacity-0">
				&ldquo;Design is so simple. That&rsquo;s why it is so
				<em>complicated.</em>
				&rdquo;
			</p>
			<p class="quote-attr opacity-0">&mdash; Paul Rand</p>
			<p class="quote-earnest opacity-0">
				<span class="quote-earnest-brand">EARNEST</span>
				applies the same standard for your business
				<span class="bp">.</span>
			</p>
		</div>

		<!-- Savings Calculator -->
		<section ref="calcRef" class="calc-section">
			<div class="calc-header">
				<h2 class="calc-title opacity-0">
					What are you
					<em class="calc-italic">spending</em>
					today
					<span class="bp">?</span>
				</h2>
				<p class="calc-sub opacity-0">Drag to see how Earnest compares to your current tool stack.</p>
			</div>
			<div class="calc-widget opacity-0">
				<div class="calc-input-row">
					<label class="calc-input-label">
						<span>Number of tools</span>
						<span class="calc-input-value">{{ toolCount }}</span>
					</label>
					<input type="range" :min="3" :max="15" v-model.number="toolCount" class="calc-range" />
				</div>
				<div class="calc-input-row">
					<label class="calc-input-label">
						<span>Avg. cost per tool</span>
						<span class="calc-input-value">${{ avgToolCost }}/mo</span>
					</label>
					<input type="range" :min="10" :max="100" :step="5" v-model.number="avgToolCost" class="calc-range" />
				</div>
				<div class="calc-result">
					<div class="calc-result-current">
						<span class="calc-result-label">Current stack cost</span>
						<span class="calc-result-amount">${{ currentStackCost }}<small>/mo</small></span>
					</div>
					<div class="calc-result-arrow">&rarr;</div>
					<div class="calc-result-earnest">
						<span class="calc-result-label">Earnest Studio</span>
						<span class="calc-result-amount">$149<small>/mo</small></span>
					</div>
				</div>
				<div class="calc-savings" v-if="savings > 0">
					You save <strong>${{ savings }}/mo</strong> &mdash; that&rsquo;s <strong>${{ savings * 12 }}/yr</strong> back in your pocket.
				</div>
				<div class="calc-savings calc-savings-plus" v-else>
					And you get connected AI intelligence that {{ toolCount }} separate tools can never provide.
				</div>
			</div>
		</section>

		<!-- Token Preview -->
		<section class="token-preview-section">
			<div class="token-preview-inner">
				<h3 class="token-preview-title opacity-0">
					Transparent AI costs
					<span class="bp">.</span>
				</h3>
				<p class="token-preview-sub opacity-0">Every feature shows its token cost before you use it. No surprises.</p>
				<div class="token-preview-grid">
					<div v-for="item in tokenCosts" :key="item.name" class="token-item opacity-0">
						<div class="token-item-name">{{ item.name }}</div>
						<div class="token-item-cost">{{ item.tokens }}</div>
						<div class="token-item-real">~{{ item.cost }}</div>
					</div>
				</div>
				<p class="token-preview-note opacity-0">
					Studio plan (400K tokens/mo) supports ~50 marketing reports or ~250 email drafts per month. Need more? Instant self-serve refills.
				</p>
			</div>
		</section>

		<!-- Testimonials -->
		<section ref="testimonialsRef" v-if="testimonials.length" class="testimonials-section">
			<h3 class="testimonials-title opacity-0">
				What people are saying
				<span class="bp">.</span>
			</h3>
			<div class="testimonials-grid">
				<div v-for="t in testimonials" :key="t.id" class="testimonial opacity-0">
					<p class="testimonial-quote">&ldquo;{{ t.quote }}&rdquo;</p>
					<div class="testimonial-author">
						<img v-if="t.avatarUrl" :src="t.avatarUrl" :alt="t.name" loading="lazy" class="testimonial-avatar" />
						<div>
							<div class="testimonial-name">{{ t.name }}</div>
							<div class="testimonial-role">{{ t.role }}</div>
						</div>
					</div>
				</div>
			</div>
		</section>

		<!-- Logo Carousel -->
		<section v-if="logos.length" class="logos-section">
			<p class="logos-label opacity-0">Trusted by</p>
			<div class="logos-track">
				<div class="logos-scroll">
					<img
						v-for="(logo, i) in [...logos, ...logos]"
						:key="i"
						:src="logo.url"
						:alt="logo.name"
						class="logo-img"
					/>
				</div>
			</div>
		</section>

		<!-- Pricing -->
		<section ref="pricingRef" id="pricing" class="pricing-section">
			<div class="pricing-header">
				<h2 class="pricing-title opacity-0">
					<em class="pricing-honest">Honest</em>
					pricing
					<span class="bp">.</span>
					<br />
					No surprises
					<span class="bp">.</span>
				</h2>
				<p class="pricing-sub opacity-0">
					One price. Your whole team. Cancel any time &mdash; we'd rather earn your business than trap it.
				</p>
			</div>

			<div class="plans-grid">
				<div
					v-for="(plan, index) in plans"
					:key="index"
					class="plan opacity-0"
					:class="{ 'plan-featured': plan.featured }"
				>
					<div class="plan-name">{{ plan.name }}</div>
					<div class="plan-price">
						<sup>$</sup>
						{{ plan.price }}
						<span>/ mo</span>
					</div>
					<div class="plan-desc">{{ plan.desc }}</div>
					<ul class="plan-features">
						<li v-for="(feat, fi) in plan.features" :key="fi">{{ feat }}</li>
					</ul>
					<nuxt-link :to="plan.cta.to" class="plan-btn">{{ plan.cta.label }}</nuxt-link>
				</div>
			</div>
		</section>
	</div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const heroRef = ref(null);
const truthRef = ref(null);
const aiRef = ref(null);
const featuresRef = ref(null);
const pricingRef = ref(null);
const replacesRef = ref(null);
const heroCycleRef = ref(null);
const calcRef = ref(null);
const testimonialsRef = ref(null);

// ── A/B Testing ──
const { trackPageView, trackEvent } = useABTest();

// ── Savings Calculator ──
const toolCount = ref(8);
const avgToolCost = ref(40);
const currentStackCost = computed(() => toolCount.value * avgToolCost.value);
const savings = computed(() => currentStackCost.value - 149);

// ── Token Cost Preview ──
const tokenCosts = [
	{ name: 'AI chat reply', tokens: '~500', cost: '$0.001' },
	{ name: 'Social caption', tokens: '~600', cost: '$0.001' },
	{ name: 'Email draft', tokens: '~1,500', cost: '$0.004' },
	{ name: 'Card scan (vision)', tokens: '~2,500', cost: '$0.007' },
	{ name: 'CRM analysis', tokens: '~3,000', cost: '$0.008' },
	{ name: 'Command Center', tokens: '~5,000', cost: '$0.013' },
	{ name: 'Marketing plan', tokens: '~8K–15K', cost: '$0.03–0.06' },
];

// ── Testimonials & Logos (from Directus) ──
const directusUrl = useRuntimeConfig().public.directusUrl || 'https://admin.huestudios.company';

const testimonials = ref([]);
const logos = ref([]);

async function fetchTestimonials() {
	try {
		const items = useDirectusItems('testimonials');
		const data = await items.list({
			filter: { featured: { _eq: true } },
			fields: ['id', 'name', 'role', 'quote', 'avatar', 'rating'],
			sort: ['sort'],
			limit: 6,
		});
		testimonials.value = data.map((t) => ({
			...t,
			avatarUrl: t.avatar ? `${directusUrl}/assets/${t.avatar}?width=80&height=80&fit=cover` : null,
		}));
	} catch {
		// Testimonials not available — hide section
	}
}

async function fetchLogos() {
	try {
		const items = useDirectusItems('partner_logos');
		const data = await items.list({
			filter: { active: { _eq: true } },
			fields: ['id', 'name', 'logo', 'url'],
			sort: ['sort'],
			limit: 12,
		});
		logos.value = data.map((l) => ({
			...l,
			url: `${directusUrl}/assets/${l.logo}?width=160&height=60&fit=contain`,
		}));
	} catch {
		// Logos not available — hide section
	}
}

if (import.meta.client) {
	fetchTestimonials();
	fetchLogos();
}

const cycleWords = ['good', 'great', 'impossible', 'possible', 'simple', 'good'];

const marqueeItems = [
	{ label: 'CRM Intelligence', icon: 'i-lucide-scan-search' },
	{ label: 'Marketing Intelligence', icon: 'i-lucide-bar-chart-3' },
	{ label: 'AI Strategy Engine', icon: 'i-lucide-brain' },
	{ label: 'Productivity Engine', icon: 'i-lucide-zap' },
	{ label: 'Health Snapshots', icon: 'i-lucide-activity' },
	{ label: 'Social AI Generate', icon: 'i-lucide-sparkles' },
	{ label: 'Goal Suggestions', icon: 'i-lucide-target' },
	{ label: 'Brand Awareness AI', icon: 'i-lucide-palette' },
	{ label: 'Unified Gantt Timeline', icon: 'i-lucide-gantt-chart' },
	{ label: 'Spaces · Tabs · Home', icon: 'i-lucide-layout-grid' },
	{ label: 'Projects', icon: 'i-lucide-folder-kanban' },
	{ label: 'Invoicing', icon: 'i-lucide-receipt' },
	{ label: 'People & Companies', icon: 'i-lucide-building-2' },
	{ label: 'Social Scheduling', icon: 'i-lucide-calendar-clock' },
	{ label: 'Team Channels', icon: 'i-lucide-message-square' },
	{ label: 'Video & Phone', icon: 'i-lucide-video' },
	{ label: 'Email Marketing AI', icon: 'i-lucide-mail' },
	{ label: 'Goals & Tracking', icon: 'i-lucide-target' },
	{ label: 'Companion Apps', icon: 'i-lucide-smartphone' },
];

const replacedTools = [
	{ name: 'Asana', replaces: 'Project management', icon: 'i-lucide-folder-kanban' },
	{ name: 'Xero', replaces: 'Invoicing', icon: 'i-lucide-receipt' },
	{ name: 'Mailchimp', replaces: 'Email marketing', icon: 'i-lucide-mail' },
	{ name: 'Hootsuite', replaces: 'Social scheduling', icon: 'i-lucide-calendar-clock' },
	{ name: 'Slack', replaces: 'Team messaging', icon: 'i-lucide-message-square' },
	{ name: 'Dialpad', replaces: 'Phone system', icon: 'i-lucide-phone' },
	{ name: 'Zoom', replaces: 'Video meetings', icon: 'i-lucide-video' },
	{ name: 'Calendly', replaces: 'Scheduling', icon: 'i-lucide-calendar' },
	{ name: 'HubSpot', replaces: 'Unified CRM', icon: 'i-lucide-users' },
	{ name: 'Lattice', replaces: 'Goal tracking', icon: 'i-lucide-target' },
	{ name: 'Isolated AI', replaces: 'AI assistant', icon: 'i-lucide-sparkles' },
];

const numberWords = [
	'zero',
	'one',
	'two',
	'three',
	'four',
	'five',
	'six',
	'seven',
	'eight',
	'nine',
	'ten',
	'eleven',
	'twelve',
];
const toolCountWord = computed(() => {
	const count = replacedTools.length;
	return numberWords[count] || String(count);
});

const features = [
	{
		name: 'Productivity Engine',
		desc: 'Your command center. Scans tickets, projects, tasks, invoices, channels, social, deals, and goals — then surfaces prioritized actions, urgent items, and intelligent suggestions. No AI tokens needed — pure algorithmic intelligence that loads instantly every time you open Earnest.',
	},
	{
		name: 'CRM Intelligence',
		desc: 'AI reads across your entire business — contacts, clients, projects, tickets, invoices, deals, and goals — then generates health scores, pipeline forecasts, growth plans, and contact strategies tailored to your brand positioning and objectives.',
	},
	{
		name: 'Health Snapshots',
		desc: 'Instant CRM and marketing health scores computed from your real data — no AI tokens, no waiting. Algorithmic analysis of contacts, revenue trends, overdue items, and pipeline health gives you a live pulse on your business the moment you open the dashboard.',
	},
	{
		name: 'Marketing AI Analyze',
		desc: 'AI scans your entire business — contacts, social, email, clients, revenue — and returns a marketing health score, actionable insights, and multi-channel campaign plans. Analyze for a specific client or your whole organization. One click.',
	},
	{
		name: 'AI Strategy Engine',
		desc: 'Your data becomes your strategist. AI connects the dots across every module to generate campaigns, spot opportunities, and surface insights no isolated tool can see.',
	},
	{
		name: 'Brand Awareness AI',
		desc: 'Set brand direction, goals, target audience, and location per client. Every AI feature — from CRM analysis to social posts to email campaigns — uses this context to generate suggestions aligned with your positioning. Not generic advice. Your brand, your voice, your market.',
	},
	{
		name: 'Social AI Generate',
		desc: 'Schedule to Instagram, LinkedIn, Facebook, and Threads. AI generates platform-optimized posts, hashtags, and image suggestions — all informed by your brand direction and target audience — in seconds.',
	},
	{
		name: 'Email Marketing AI',
		desc: 'Block-based newsletter builder with AI-powered content generation. Describe your email and get a complete template — subject line, sections, images, and copy — all tuned to your brand voice and audience.',
	},
	{
		name: 'Goal Suggestions',
		desc: 'AI suggests strategic goals based on your actual data, brand direction, and business objectives — financial, networking, performance, marketing, or custom. Track progress with periodic snapshots and let the productivity engine factor your goals into daily priorities.',
	},
	{
		name: 'Project Management',
		desc: "Kanban boards, task lists, timelines, file attachments, and a command-center project dashboard with stats, document uploads, invoices, and activity feeds. Your team always knows what's next.",
	},
	{
		name: 'People & Companies',
		desc: 'Every person and company in one unified CRM — clients, contacts, prospects, and networking connections from CardDesk. Brand context, goals, services, and the full history of every conversation and project.',
	},
	{
		name: 'Quick Tasks & AI To-Dos',
		desc: 'Personal task lists with AI-powered suggestions, day and week scheduling, motivational progress tracking, and confetti celebrations. AI generates task ideas based on your workload and brand context so nothing falls through the cracks.',
	},
	{
		name: 'AI Token Management',
		desc: 'Admins control AI usage per member — set monthly budgets, toggle access on and off, monitor usage across the team. Purchase token add-on packages when you need more. Full visibility into who uses what.',
	},
	{
		name: 'Client Access Control',
		desc: 'Role-based client visibility with team assignments and individual overrides. Owners and admins see everything. Managers and members see only the clients assigned to their teams — plus any individual access grants.',
	},
	{
		name: 'Invoicing & Billing',
		desc: 'Stripe-powered invoices, proposals, payment tracking, and PDF generation. Get paid on time.',
	},
	{
		name: 'Team Channels',
		desc: "Slack-style messaging built into your workspace. Conversations stay with the work they're about.",
	},
	{
		name: 'Phone & Video',
		desc: 'Twilio-powered calling and video meetings. Click-to-call contacts, record calls, and host team video — all without leaving Earnest.',
	},
	{
		name: 'Calendar & Scheduling',
		desc: 'Public booking links, Google/Outlook calendar sync, and team availability. Everything connected to your clients and projects.',
	},
	{
		name: 'CardDesk',
		desc: 'Turn every business card and networking event into a CRM relationship. Scan cards with AI vision, track follow-ups, and gamify your networking with XP, levels, and badges.',
	},
	{
		name: 'Earnest Companion (E\u00B2)',
		desc: 'Your business in your pocket. Tasks, messages, contacts, and AI on the go — a mobile-first companion that keeps you connected to everything in Earnest.',
	},
];

const plans = [
	{
		name: 'Solo',
		price: '49',
		desc: 'For the one-person shop doing serious work.',
		featured: false,
		features: [
			'1 team seat',
			'Every feature included',
			'Projects, tickets & invoicing',
			'CRM, social & email marketing',
			'AI Command Center & Intelligence',
			'CardDesk & Companion apps',
			'5 client portal seats',
			'100K AI tokens/month',
			'25 card scans/month',
		],
		cta: { label: 'Get started', to: '/register' },
	},
	{
		name: 'Studio',
		price: '149',
		desc: 'For the team that means business.',
		featured: true,
		features: [
			'8 team seats',
			'Everything in Solo',
			'Team channels & video meetings',
			'AI Token Management',
			'15 client portal seats',
			'400K AI tokens/month',
			'150 card scans/month',
			'$408/yr if billed annually',
		],
		cta: { label: 'Start free trial', to: '/register' },
	},
	{
		name: 'Agency',
		price: '299',
		desc: 'For the business that has grown into something real.',
		featured: false,
		features: [
			'15 team seats',
			'Everything in Studio',
			'Unlimited client portal seats',
			'Priority support + onboarding call',
			'1M AI tokens/month',
			'500 card scans/month',
			'$2,491/yr if billed annually',
		],
		cta: { label: 'Talk to us', to: '/register' },
	},
];

let ctx;

onMounted(() => {
	ctx = gsap.context(() => {
		// Hero sequence
		const heroTl = gsap.timeline({ delay: 0.2 });
		heroTl
			.fromTo('.hero-kicker', { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.8, ease: 'power3.out' })
			.fromTo('.hero-wordmark', { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.9, ease: 'power3.out' }, '-=0.5')
			.fromTo(
				'.hero-period',
				{ opacity: 0, y: -20 },
				{ opacity: 1, y: 0, duration: 0.5, ease: 'back.out(1.5)' },
				'-=0.3',
			)
			.fromTo('.hero-tagline', { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.8, ease: 'power3.out' }, '-=0.3')
			.fromTo('.hero-sub', { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.8, ease: 'power3.out' }, '-=0.5')
			.fromTo('.hero-actions', { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.8, ease: 'power3.out' }, '-=0.5');

		// Hero word cycle — "Do good work." stays visible longer as the hero statement
		if (heroCycleRef.value) {
			const wrap = heroCycleRef.value.parentElement;
			// Set initial width
			wrap.style.width = heroCycleRef.value.offsetWidth + 'px';

			const cycleTl = gsap.timeline({ delay: 2.5, repeat: -1, repeatDelay: 4 });
			cycleWords.forEach((word, i) => {
				if (i === 0) return;
				const isLastWord = i === cycleWords.length - 1;
				cycleTl
					.to(heroCycleRef.value, { opacity: 0, y: -12, duration: 0.2, ease: 'power2.in' })
					.call(() => {
						heroCycleRef.value.textContent = word;
						gsap.to(wrap, { width: heroCycleRef.value.offsetWidth, duration: 0.2, ease: 'power2.out' });
					})
					.fromTo(heroCycleRef.value, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.3, ease: 'power2.out' })
					.to({}, { duration: isLastWord ? 2 : 0.8 });
			});
		}

		// Section reveal helper — faster animations, earlier trigger
		const revealElements = (sectionRef, selector) => {
			if (!sectionRef.value) return;
			const els = sectionRef.value.querySelectorAll(selector);
			els.forEach((el, i) => {
				gsap.fromTo(
					el,
					{ opacity: 0, y: 20 },
					{
						opacity: 1,
						y: 0,
						duration: 0.6,
						ease: 'power3.out',
						scrollTrigger: { trigger: el, start: 'top 98%', toggleActions: 'play none none none' },
						delay: i * 0.05,
					},
				);
			});
		};

		// Replaces section
		revealElements(replacesRef, '.replaces-kicker, .replaces-item, .replaces-cta');

		// Truth section
		revealElements(truthRef, '.truth-label, .truth-title, .truth-text');

		// AI reveal section
		revealElements(aiRef, '.ai-kicker, .ai-headline, .ai-lede, .ai-cap');

		// Features section
		revealElements(featuresRef, '.features-hero-word, .features-title, .features-sub, .feature-item');

		// Quote
		gsap.fromTo(
			'.quote-text',
			{ opacity: 0, y: 20 },
			{
				opacity: 1,
				y: 0,
				duration: 0.6,
				ease: 'power3.out',
				scrollTrigger: { trigger: '.quote-break', start: 'top 98%' },
			},
		);
		gsap.fromTo(
			'.quote-attr',
			{ opacity: 0 },
			{
				opacity: 1,
				duration: 0.6,
				ease: 'power3.out',
				scrollTrigger: { trigger: '.quote-break', start: 'top 98%' },
				delay: 0.15,
			},
		);
		gsap.fromTo(
			'.quote-earnest',
			{ opacity: 0, y: 16 },
			{
				opacity: 1,
				y: 0,
				duration: 0.6,
				ease: 'power3.out',
				scrollTrigger: { trigger: '.quote-break', start: 'top 98%' },
				delay: 0.3,
			},
		);

		// Savings calculator
		revealElements(calcRef, '.calc-title, .calc-sub, .calc-widget');

		// Token preview
		revealElements({ value: document.querySelector('.token-preview-section') }, '.token-preview-title, .token-preview-sub, .token-item, .token-preview-note');

		// Testimonials
		if (testimonialsRef.value) {
			revealElements(testimonialsRef, '.testimonials-title, .testimonial');
		}

		// Logos
		revealElements({ value: document.querySelector('.logos-section') }, '.logos-label');

		// Pricing
		revealElements(pricingRef, '.pricing-title, .pricing-sub, .plan');

		// A/B tracking
		trackPageView('sellsheet');
	});
});

onUnmounted(() => {
	if (ctx) ctx.revert();
});

useHead({
	title: 'Earnest. Do good work. | The Business Operating System',
	meta: [
		{
			name: 'description',
			content:
				'Earnest is the AI-powered platform where your work actually lives. Projects, invoicing, goals, social scheduling, team channels, phone & video, CRM, and AI that sees everything.',
		},
	],
});
</script>

<style scoped>
/* ─── Earnest Brand Tokens ─── */
.sell-sheet {
	--paper: #f6f1e7;
	--paper-2: #ede7d9;
	--ink: #1c1812;
	--ink-2: #3d3529;
	--muted: #8c7b6b;
	--accent: #b85c2c;
	--rule: rgba(28, 24, 18, 0.12);

	background: var(--paper);
	color: var(--ink);
	font-family: var(--font-proxima-light);
	-webkit-font-smoothing: antialiased;
	margin-top: 0;
}
/* ─── TOP NAV ─── */
.sell-nav {
	position: fixed;
	top: 0;
	left: 0;
	right: 0;
	z-index: 50;
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 16px 24px;
	background: transparent;
	transition: background 0.3s ease;
}

.sell-nav-brand {
	color: var(--ink);
	text-decoration: none;
}

.sell-nav-login {
	display: inline-flex;
	align-items: center;
	padding: 8px 20px;
	border: 1px solid var(--ink);
	border-radius: 100px;
	font-family: var(--font-proxima-light);
	font-size: 11px;
	font-weight: 500;
	letter-spacing: 0.1em;
	text-transform: uppercase;
	color: var(--ink);
	text-decoration: none;
	transition: all 0.25s ease;
}

.sell-nav-login:hover {
	background: var(--ink);
	color: var(--paper);
}

.bp {
	color: var(--accent);
	font-size: 1.3em;
	line-height: 0;
	margin-left: -0.15em;
}

/* ─── HERO ─── */
.earnest-hero {
	min-height: 100svh;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	text-align: center;
	padding: 140px 24px 80px;
	position: relative;
	background: var(--paper);
}

.hero-kicker {
	font-family: var(--font-proxima-light);
	font-style: italic;
	font-size: 15px;
	color: var(--muted);
	letter-spacing: 0.08em;
	margin-bottom: 48px;
}
.hero-wordmark {
	font-family: var(--font-bauer-bodoni);
	font-size: clamp(56px, 18vw, 200px);
	font-weight: 600;
	letter-spacing: -0.02em;
	line-height: 0.9;
	color: var(--ink);
	white-space: nowrap;
}
.hero-period {
	color: var(--accent);
	display: inline-block;
}
.hero-tagline {
	font-family: var(--font-bauer-bodoni);
	font-size: clamp(28px, 5vw, 52px);
	font-weight: 300;
	font-style: italic;
	color: var(--ink-2);
	margin-top: 24px;
	letter-spacing: 0.01em;
}
.hero-cycle-wrap {
	display: inline-block;
	position: relative;
	text-align: center;
	vertical-align: bottom;
}
.hero-cycle {
	display: inline-block;
	color: var(--accent);
	vertical-align: bottom;
}
.hero-sub {
	font-family: var(--font-proxima-light);
	font-size: 16px;
	color: var(--muted);
	margin-top: 20px;
	letter-spacing: 0.05em;
}
.hero-actions {
	display: flex;
	gap: 16px;
	margin-top: 52px;
	flex-wrap: wrap;
	justify-content: center;
}
.btn-ink {
	background: var(--ink);
	color: var(--paper);
	border: none;
	padding: 16px 36px;
	font-family: var(--font-proxima-light);
	font-size: 14px;
	font-weight: 500;
	letter-spacing: 0.08em;
	cursor: pointer;
	transition: all 0.25s;
	text-decoration: none;
	text-transform: uppercase;
}
.btn-ink:hover {
	background: var(--accent);
}
.btn-ghost {
	background: transparent;
	color: var(--muted);
	border: 1px solid var(--rule);
	padding: 16px 36px;
	font-family: var(--font-proxima-light);
	font-size: 14px;
	letter-spacing: 0.08em;
	cursor: pointer;
	transition: all 0.25s;
	text-decoration: none;
	text-transform: uppercase;
}
.btn-ghost:hover {
	border-color: var(--ink);
	color: var(--ink);
}


/* ─── MARQUEE ─── */
.marquee-wrap {
	border-top: 1px solid var(--rule);
	border-bottom: 1px solid var(--rule);
	padding: 14px 0;
	background: var(--ink);
	overflow: hidden;
}
.marquee-track {
	display: flex;
	white-space: nowrap;
	animation: marquee 15s linear infinite;
}
.marquee-item {
	font-family: var(--font-proxima-light);
	font-style: normal;
	font-size: 13px;
	color: rgba(246, 241, 231, 1);
	padding: 0 32px;
	flex-shrink: 0;
	display: inline-flex;
	align-items: center;
	gap: 8px;
	letter-spacing: 0.04em;
	text-transform: uppercase;
}
.marquee-icon {
	width: 14px;
	height: 14px;
	color: var(--accent);
	flex-shrink: 0;
}
.marquee-dot {
	color: var(--accent);
	margin: 0 4px;
}
@keyframes marquee {
	from {
		transform: translateX(0);
	}
	to {
		transform: translateX(-50%);
	}
}

/* ─── REPLACES ─── */
.replaces-section {
	padding: 100px 48px;
	max-width: 860px;
	margin: 0 auto;
	text-align: center;
	background: var(--paper);
}
@media (max-width: 700px) {
	.replaces-section {
		padding: 60px 16px;
	}
}
.replaces-kicker {
	font-family: var(--font-proxima-light);
	font-style: italic;
	font-size: 13px;
	color: var(--accent);
	letter-spacing: 0.08em;
	text-transform: uppercase;
	margin-bottom: 48px;
}
.replaces-grid {
	display: grid;
	grid-template-columns: repeat(5, 1fr);
	gap: 1px;
	background: var(--rule);
	border: 1px solid var(--rule);
}
.replaces-item:last-child {
	grid-column: 1 / -1;
}
@media (max-width: 700px) {
	.replaces-grid {
		grid-template-columns: repeat(2, 1fr);
	}
}
.replaces-item {
	background: var(--paper);
	padding: 28px 16px;
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 10px;
	transition: background 0.2s;
	position: relative;
}
@media (max-width: 700px) {
	.replaces-item {
		padding: 16px 10px;
		gap: 6px;
	}
}
.replaces-item:hover {
	background: var(--paper-2);
}
.replaces-item::after {
	content: '';
	position: absolute;
	top: 50%;
	left: 12%;
	right: 12%;
	height: 2px;
	background: var(--accent);
	transform: rotate(-12deg);
	opacity: 0.35;
	pointer-events: none;
}
.replaces-icon {
	width: 24px;
	height: 24px;
	color: var(--ink);
	opacity: 0.4;
	transition: opacity 0.2s;
}
@media (max-width: 700px) {
	.replaces-icon {
		width: 18px;
		height: 18px;
	}
}
.replaces-item:hover .replaces-icon {
	opacity: 1;
}
.replaces-name {
	font-family: var(--font-bauer-bodoni);
	font-size: 15px;
	font-weight: 600;
	color: var(--ink);
	letter-spacing: 0.01em;
}
@media (max-width: 700px) {
	.replaces-name {
		font-size: 12px;
	}
}
.replaces-for {
	font-family: var(--font-proxima-light);
	font-size: 11px;
	color: var(--muted);
	letter-spacing: 0.04em;
}
@media (max-width: 700px) {
	.replaces-for {
		font-size: 9px;
	}
}
.replaces-cta {
	font-family: var(--font-bauer-bodoni);
	font-size: clamp(24px, 4vw, 36px);
	font-weight: 500;
	color: var(--ink);
	margin-top: 48px;
}
.replaces-cta em {
	font-style: italic;
	color: var(--accent);
}

/* ─── TRUTH ─── */
.truth-section {
	padding: 120px 48px;
	max-width: 860px;
	margin: 0 auto;
	display: grid;
	grid-template-columns: 1fr 2fr;
	gap: 80px;
	align-items: start;
	background: var(--paper);
}
@media (max-width: 700px) {
	.truth-section {
		grid-template-columns: 1fr;
		gap: 40px;
		padding: 80px 24px;
	}
}
.truth-label {
	font-family: var(--font-proxima-light);
	font-style: italic;
	font-size: 13px;
	color: var(--accent);
	letter-spacing: 0.08em;
	padding-top: 6px;
	position: sticky;
	top: 100px;
}
@media (max-width: 700px) {
	.truth-label {
		position: static;
	}
}
.truth-title {
	font-family: var(--font-bauer-bodoni);
	font-size: clamp(36px, 5vw, 58px);
	font-weight: 500;
	line-height: 1.15;
	letter-spacing: -0.01em;
	margin-bottom: 32px;
}
.truth-title em {
	font-style: italic;
	color: var(--accent);
}
.truth-one {
	color: var(--accent);
	text-decoration: underline;
	text-decoration-color: var(--accent);
	text-underline-offset: 4px;
	text-decoration-thickness: 2px;
	font-style: italic;
}
.truth-text {
	font-size: 17px;
	line-height: 1.85;
	color: var(--ink-2);
	margin-bottom: 20px;
	font-weight: 400;
}
.truth-text strong {
	color: var(--ink);
	font-weight: 600;
}

/* ─── AI REVEAL ─── */
.ai-reveal {
	background: var(--ink);
	padding: 120px 48px;
	position: relative;
	overflow: hidden;
}
.ai-reveal::before {
	content: '';
	position: absolute;
	top: 0;
	left: 0;
	right: 0;
	bottom: 0;
	background: radial-gradient(ellipse at 50% 0%, rgba(184, 92, 44, 0.08) 0%, transparent 70%);
	pointer-events: none;
}
.ai-reveal-inner {
	max-width: 860px;
	margin: 0 auto;
	position: relative;
	z-index: 1;
}
.ai-kicker {
	font-family: var(--font-proxima-light);
	font-style: italic;
	font-size: 13px;
	color: var(--accent);
	letter-spacing: 0.08em;
	margin-bottom: 32px;
	text-transform: uppercase;
}
.ai-headline {
	font-family: var(--font-bauer-bodoni);
	font-size: clamp(36px, 6vw, 64px);
	font-weight: 500;
	line-height: 1.1;
	letter-spacing: -0.01em;
	color: var(--paper);
	margin-bottom: 28px;
}
.ai-headline em {
	font-style: italic;
	color: var(--accent);
}
.ai-lede {
	font-family: var(--font-proxima-light);
	font-size: 18px;
	line-height: 1.8;
	color: rgba(246, 241, 231, 0.6);
	max-width: 600px;
	margin-bottom: 64px;
}
.ai-capabilities {
	display: grid;
	grid-template-columns: repeat(2, 1fr);
	gap: 1px;
	background: rgba(246, 241, 231, 0.08);
	border: 1px solid rgba(246, 241, 231, 0.08);
}
@media (max-width: 700px) {
	.ai-capabilities {
		grid-template-columns: 1fr;
	}
}
.ai-cap {
	padding: 36px 32px;
	background: var(--ink);
	transition: background 0.2s;
}
.ai-cap:hover {
	background: rgba(246, 241, 231, 0.03);
}
.ai-cap-number {
	font-family: var(--font-bauer-bodoni);
	font-size: 11px;
	font-weight: 500;
	letter-spacing: 0.15em;
	color: var(--accent);
	margin-bottom: 16px;
	display: block;
}
.ai-cap-title {
	font-family: var(--font-bauer-bodoni);
	font-size: 22px;
	font-weight: 600;
	color: var(--paper);
	margin-bottom: 10px;
	letter-spacing: -0.01em;
}
.ai-cap-desc {
	font-size: 14px;
	line-height: 1.7;
	color: rgba(246, 241, 231, 0.5);
}

/* ─── DIVIDER ─── */
.section-rule {
	padding: 0 48px;
	max-width: 860px;
	margin: 0 auto;
	background: var(--paper);
	height: 1px;
}
.section-rule::after {
	content: '';
	display: block;
	height: 1px;
	background: var(--rule);
}

/* ─── FEATURES ─── */
.features-section {
	padding: 80px 48px 120px;
	max-width: 860px;
	margin: 0 auto;
	background: var(--paper);
}
@media (max-width: 700px) {
	.features-section {
		padding: 60px 24px 80px;
	}
}

.features-header {
	margin-bottom: 64px;
}
.features-hero-word {
	font-family: var(--font-bauer-bodoni);
	font-weight: 400;
	font-style: italic;
	letter-spacing: -0.02em;
	line-height: 0.9;
	color: var(--ink);
	margin-bottom: 8px;
	text-transform: uppercase;
	font-size: clamp(54px, 6.7vw, 80px);
}
.features-title {
	font-family: var(--font-bauer-bodoni);
	font-size: clamp(32px, 4vw, 48px);
	font-weight: 500;
	letter-spacing: -0.01em;
	line-height: 1.2;
}
.features-nothing {
	font-style: italic;
	text-decoration: underline;
	text-decoration-color: var(--accent);
	text-underline-offset: 4px;
	text-decoration-thickness: 2px;
}
.features-sub {
	font-family: var(--font-proxima-light);
	font-style: italic;
	font-size: 16px;
	color: var(--muted);
	margin-top: 12px;
}

.feature-list {
	display: grid;
	grid-template-columns: 1fr 1fr;
	gap: 0;
	border: 1px solid var(--rule);
}
@media (max-width: 600px) {
	.feature-list {
		grid-template-columns: 1fr;
	}
}

.feature-item {
	padding: 36px 32px;
	border-right: 1px solid var(--rule);
	border-bottom: 1px solid var(--rule);
	transition: background 0.2s;
	cursor: default;
}
.feature-item:hover {
	background: var(--paper-2);
}
.feature-item:nth-child(2n) {
	border-right: none;
}

.feature-number {
	font-family: var(--font-bauer-bodoni);
	font-size: 11px;
	font-weight: 500;
	letter-spacing: 0.15em;
	color: var(--accent);
	margin-bottom: 14px;
	display: block;
}
.feature-name {
	font-family: var(--font-bauer-bodoni);
	font-size: 24px;
	font-weight: 600;
	color: var(--ink);
	margin-bottom: 10px;
	letter-spacing: -0.01em;
}
.feature-desc {
	font-size: 14px;
	line-height: 1.7;
	color: var(--muted);
}

/* ─── QUOTE BREAK ─── */
.quote-break {
	background: var(--ink);
	padding: 100px 48px;
	text-align: center;
	position: relative;
	overflow: hidden;
}
.quote-break::before {
	content: '\201C';
	position: absolute;
	top: -40px;
	left: 50%;
	transform: translateX(-50%);
	font-family: var(--font-bauer-bodoni);
	font-size: 300px;
	color: rgba(246, 241, 231, 0.04);
	line-height: 1;
	pointer-events: none;
}
.quote-text {
	font-family: var(--font-bauer-bodoni);
	font-size: clamp(28px, 5vw, 54px);
	font-weight: 400;
	font-style: italic;
	color: var(--paper);
	line-height: 1.3;
	max-width: 800px;
	margin: 0 auto;
	position: relative;
	z-index: 1;
}
.quote-text em {
	font-style: normal;
	color: var(--accent);
}
.quote-attr {
	font-family: var(--font-proxima-light);
	font-size: 13px;
	color: rgba(246, 241, 231, 0.35);
	letter-spacing: 0.1em;
	margin-top: 32px;
	text-transform: uppercase;
}
.quote-earnest {
	font-family: var(--font-proxima-light);
	font-style: normal;
	font-size: clamp(18px, 3vw, 24px);
	color: rgba(246, 241, 231, 0.85);
	margin-top: 20px;
	letter-spacing: 0.01em;
	position: relative;
	z-index: 1;
}
.quote-earnest-brand {
	font-family: var(--font-bauer-bodoni);
	font-style: normal;
	font-weight: 400;
}

/* ─── SAVINGS CALCULATOR ─── */
.calc-section {
	padding: 100px 48px;
	max-width: 860px;
	margin: 0 auto;
	background: var(--paper);
}
@media (max-width: 700px) { .calc-section { padding: 60px 24px; } }

.calc-header { margin-bottom: 48px; }
.calc-title {
	font-family: var(--font-bauer-bodoni);
	font-size: clamp(28px, 4vw, 42px);
	font-weight: 500;
	line-height: 1.1;
}
.calc-italic {
	font-style: italic;
	text-decoration: underline;
	text-decoration-color: var(--accent);
	text-underline-offset: 4px;
	text-decoration-thickness: 2px;
}
.calc-sub {
	font-size: 15px;
	color: var(--muted);
	margin-top: 12px;
}

.calc-widget {
	background: var(--paper-2);
	padding: 40px;
	border: 1px solid var(--rule);
}
@media (max-width: 700px) { .calc-widget { padding: 24px; } }

.calc-input-row { margin-bottom: 28px; }
.calc-input-label {
	display: flex;
	justify-content: space-between;
	font-size: 14px;
	color: var(--ink-2);
	margin-bottom: 10px;
}
.calc-input-value {
	font-family: var(--font-bauer-bodoni);
	font-weight: 600;
	color: var(--accent);
}
.calc-range {
	-webkit-appearance: none;
	width: 100%;
	height: 4px;
	background: var(--rule);
	border-radius: 2px;
	outline: none;
}
.calc-range::-webkit-slider-thumb {
	-webkit-appearance: none;
	width: 20px;
	height: 20px;
	background: var(--ink);
	border-radius: 50%;
	cursor: pointer;
	transition: background 0.15s;
}
.calc-range::-webkit-slider-thumb:hover { background: var(--accent); }

.calc-result {
	display: grid;
	grid-template-columns: 1fr auto 1fr;
	gap: 20px;
	align-items: center;
	margin-top: 40px;
	padding-top: 32px;
	border-top: 1px solid var(--rule);
}
@media (max-width: 500px) { .calc-result { grid-template-columns: 1fr; text-align: center; } }
.calc-result-label {
	font-size: 11px;
	text-transform: uppercase;
	letter-spacing: 0.06em;
	color: var(--muted);
}
.calc-result-amount {
	font-family: var(--font-bauer-bodoni);
	font-size: 40px;
	font-weight: 600;
	line-height: 1;
	display: block;
	margin-top: 6px;
}
.calc-result-amount small {
	font-family: var(--font-proxima-light);
	font-size: 14px;
	color: var(--muted);
}
.calc-result-arrow {
	font-size: 28px;
	color: var(--accent);
}
.calc-result-earnest .calc-result-amount { color: var(--accent); }
.calc-result-current { text-decoration: line-through; text-decoration-color: var(--accent); text-decoration-thickness: 2px; }

.calc-savings {
	font-size: 15px;
	color: var(--ink-2);
	margin-top: 24px;
	text-align: center;
	font-style: italic;
}
.calc-savings strong { color: var(--accent); font-style: normal; }
.calc-savings-plus { color: var(--muted); }

/* ─── TOKEN PREVIEW ─── */
.token-preview-section {
	background: var(--ink);
	padding: 80px 48px;
}
@media (max-width: 700px) { .token-preview-section { padding: 60px 24px; } }
.token-preview-inner {
	max-width: 860px;
	margin: 0 auto;
}
.token-preview-title {
	font-family: var(--font-bauer-bodoni);
	font-size: clamp(22px, 3vw, 32px);
	font-weight: 500;
	color: var(--paper);
}
.token-preview-sub {
	font-size: 14px;
	color: rgba(246, 241, 231, 0.5);
	margin-top: 8px;
	margin-bottom: 32px;
}
.token-preview-grid {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
	gap: 1px;
	background: rgba(246, 241, 231, 0.08);
}
.token-item {
	background: var(--ink);
	padding: 20px;
	transition: background 0.2s;
}
.token-item:hover { background: var(--ink-2); }
.token-item-name {
	font-size: 13px;
	color: rgba(246, 241, 231, 0.7);
	margin-bottom: 8px;
}
.token-item-cost {
	font-family: var(--font-bauer-bodoni);
	font-size: 20px;
	font-weight: 600;
	color: var(--paper);
}
.token-item-real {
	font-size: 11px;
	color: rgba(246, 241, 231, 0.3);
	margin-top: 4px;
}
.token-preview-note {
	font-size: 13px;
	font-style: italic;
	color: rgba(246, 241, 231, 0.35);
	margin-top: 24px;
	text-align: center;
}

/* ─── TESTIMONIALS ─── */
.testimonials-section {
	padding: 100px 48px;
	max-width: 860px;
	margin: 0 auto;
}
@media (max-width: 700px) { .testimonials-section { padding: 60px 24px; } }
.testimonials-title {
	font-family: var(--font-bauer-bodoni);
	font-size: clamp(22px, 3vw, 32px);
	font-weight: 500;
	margin-bottom: 40px;
}
.testimonials-grid {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
	gap: 1px;
	background: var(--rule);
	border: 1px solid var(--rule);
}
.testimonial {
	background: var(--paper);
	padding: 32px;
	transition: background 0.2s;
}
.testimonial:hover { background: var(--paper-2); }
.testimonial-quote {
	font-family: var(--font-bauer-bodoni);
	font-size: 15px;
	font-style: italic;
	line-height: 1.6;
	color: var(--ink-2);
	margin-bottom: 20px;
}
.testimonial-author {
	display: flex;
	align-items: center;
	gap: 12px;
}
.testimonial-avatar {
	width: 36px;
	height: 36px;
	border-radius: 50%;
	object-fit: cover;
}
.testimonial-name {
	font-size: 13px;
	font-weight: 600;
	color: var(--ink);
}
.testimonial-role {
	font-size: 11px;
	color: var(--muted);
}

/* ─── LOGO CAROUSEL ─── */
.logos-section {
	padding: 48px;
	text-align: center;
	overflow: hidden;
}
.logos-label {
	font-family: var(--font-proxima-light);
	font-size: 11px;
	text-transform: uppercase;
	letter-spacing: 0.12em;
	color: var(--muted);
	margin-bottom: 24px;
}
.logos-track {
	overflow: hidden;
	mask-image: linear-gradient(to right, transparent, black 10%, black 90%, transparent);
	-webkit-mask-image: linear-gradient(to right, transparent, black 10%, black 90%, transparent);
}
.logos-scroll {
	display: flex;
	gap: 48px;
	align-items: center;
	animation: scrollLogos 30s linear infinite;
	width: max-content;
}
.logo-img {
	height: 32px;
	width: auto;
	opacity: 0.4;
	filter: grayscale(1);
	transition: opacity 0.3s, filter 0.3s;
}
.logo-img:hover {
	opacity: 1;
	filter: grayscale(0);
}
@keyframes scrollLogos {
	0% { transform: translateX(0); }
	100% { transform: translateX(-50%); }
}

/* ─── PRICING ─── */
.pricing-section {
	padding: 120px 48px;
	max-width: 860px;
	margin: 0 auto;
	background: var(--paper);
}
@media (max-width: 700px) {
	.pricing-section {
		padding: 80px 24px;
	}
}

.pricing-header {
	margin-bottom: 64px;
	display: grid;
	grid-template-columns: auto 1fr;
	gap: 40px;
	align-items: end;
}
@media (max-width: 600px) {
	.pricing-header {
		grid-template-columns: 1fr;
	}
}
.pricing-title {
	font-family: var(--font-bauer-bodoni);
	font-size: clamp(28px, 4vw, 42px);
	font-weight: 500;
	line-height: 1.1;
	letter-spacing: -0.01em;
	white-space: nowrap;
}
.pricing-honest {
	font-style: italic;
	text-decoration: underline;
	text-decoration-color: var(--accent);
	text-underline-offset: 4px;
	text-decoration-thickness: 2px;
}
.pricing-sub {
	font-size: 15px;
	line-height: 1.7;
	color: var(--muted);
}

.plans-grid {
	display: grid;
	grid-template-columns: repeat(3, 1fr);
	gap: 1px;
	background: var(--rule);
	border: 1px solid var(--rule);
}
@media (max-width: 600px) {
	.plans-grid {
		grid-template-columns: 1fr;
	}
}

.plan {
	background: var(--paper);
	padding: 40px 32px;
	transition: background 0.2s;
}
.plan:hover {
	background: var(--paper-2);
}

.plan-featured {
	background: var(--ink) !important;
	color: var(--paper);
}
.plan-featured:hover {
	background: var(--ink) !important;
}

.plan-name {
	font-family: var(--font-bauer-bodoni);
	font-size: 22px;
	font-weight: 600;
	letter-spacing: 0.02em;
}
.plan-featured .plan-name {
	color: var(--paper);
}

.plan-price {
	font-family: var(--font-bauer-bodoni);
	font-size: 52px;
	font-weight: 600;
	line-height: 1;
	margin-top: 20px;
	letter-spacing: -0.02em;
	color: var(--ink);
}
.plan-featured .plan-price {
	color: var(--paper);
}
.plan-price sup {
	font-size: 22px;
	vertical-align: super;
	font-weight: 400;
}
.plan-price span {
	font-family: var(--font-proxima-light);
	font-size: 14px;
	font-weight: 400;
	color: var(--muted);
}
.plan-featured .plan-price span {
	color: rgba(246, 241, 231, 0.5);
}

.plan-desc {
	font-family: var(--font-proxima-light);
	font-style: italic;
	font-size: 13px;
	color: var(--muted);
	margin-top: 8px;
	margin-bottom: 28px;
	padding-bottom: 28px;
	border-bottom: 1px solid var(--rule);
}
.plan-featured .plan-desc {
	color: rgba(246, 241, 231, 0.4);
	border-bottom-color: rgba(246, 241, 231, 0.1);
}

.plan-features {
	list-style: none;
	display: flex;
	flex-direction: column;
	gap: 12px;
	padding: 0;
	margin: 0;
}
.plan-features li {
	font-size: 13px;
	color: var(--ink-2);
	display: flex;
	align-items: flex-start;
	gap: 10px;
	line-height: 1.4;
}
.plan-featured .plan-features li {
	color: rgba(246, 241, 231, 0.75);
}
.plan-features li::before {
	content: '\2014';
	color: var(--accent);
	flex-shrink: 0;
	font-family: var(--font-bauer-bodoni);
}

.plan-btn {
	display: block;
	width: 100%;
	margin-top: 32px;
	padding: 14px;
	text-align: center;
	font-family: var(--font-proxima-light);
	font-size: 13px;
	letter-spacing: 0.08em;
	cursor: pointer;
	transition: all 0.2s;
	border: 1px solid var(--rule);
	background: transparent;
	color: var(--ink);
	text-decoration: none;
	text-transform: uppercase;
}
.plan-btn:hover {
	background: var(--ink);
	color: var(--paper);
	border-color: var(--ink);
}
.plan-featured .plan-btn {
	background: var(--accent);
	border-color: var(--accent);
	color: white;
}
.plan-featured .plan-btn:hover {
	filter: brightness(1.1);
}

/* ─── FOOTER ─── */
</style>
