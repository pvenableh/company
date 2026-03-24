<template>
	<div class="sell-sheet">
		<!-- Hero -->
		<section ref="heroRef" class="earnest-hero">
			<p class="hero-kicker opacity-0">The AI-powered business operating system</p>
			<h1 class="hero-wordmark opacity-0">Earnest<span class="hero-period">.</span></h1>
			<p class="hero-tagline opacity-0">Do <span class="hero-cycle-wrap"><span ref="heroCycleRef" class="hero-cycle">good</span></span> work<span class="bp">.</span></p>
			<p class="hero-sub opacity-0">Radically simple<span class="bp">.</span> One platform<span class="bp">.</span> AI that sees everything<span class="bp">.</span></p>
			<div class="hero-actions opacity-0">
				<nuxt-link to="/register" class="btn-ink">Start for free</nuxt-link>
				<nuxt-link to="#features" class="btn-ghost">See how it works</nuxt-link>
			</div>
			<div class="hero-scroll opacity-0">
				<div class="scroll-line"></div>
				<span class="scroll-label">scroll</span>
			</div>
		</section>

		<!-- Marquee -->
		<div class="marquee-wrap" aria-hidden="true">
			<div class="marquee-track">
				<span v-for="(item, i) in [...marqueeItems, ...marqueeItems]" :key="i" class="marquee-item">
					<UIcon :name="item.icon" class="marquee-icon" /> {{ item.label }} <span class="marquee-dot">&middot;</span>
				</span>
			</div>
		</div>

		<!-- Replaces Section (before Truth) -->
		<section ref="replacesRef" class="replaces-section">
			<p class="replaces-kicker opacity-0">One platform replaces</p>
			<div class="replaces-grid">
				<div
					v-for="(tool, index) in replacedTools"
					:key="index"
					class="replaces-item opacity-0"
				>
					<UIcon :name="tool.icon" class="replaces-icon" />
					<span class="replaces-name">{{ tool.name }}</span>
					<span class="replaces-for">{{ tool.replaces }}</span>
				</div>
			</div>
			<p class="replaces-cta opacity-0">All of this. <em>One login<span class="bp">.</span></em></p>
		</section>

		<!-- Truth Section -->
		<section ref="truthRef" class="truth-section">
			<div class="truth-label opacity-0">The honest case</div>
			<div class="truth-body">
				<h2 class="truth-title opacity-0">Your business runs on {{ toolCountWord }} tools. It should run on <span class="truth-one">one</span><span class="bp">.</span></h2>
				<p class="truth-text opacity-0">You have a project tool. An invoice tool. A social tool. A phone system. A shared inbox. A calendar. A goal tracker. And Slack to hold it all together. Eleven tools. Eleven logins. Zero cohesion.</p>
				<p class="truth-text opacity-0"><strong>EARNEST replaces the pile.</strong> One platform, one login, one place where the work actually lives &mdash; from the first brief to the final invoice. Nothing to integrate. Nothing to re-explain.</p>
				<p class="truth-text opacity-0">And because everything is in one place, <strong>AI can actually think about your business</strong> &mdash; analyzing people, companies, revenue, deals, goals, and campaigns together, layered with your brand direction and target audience, to build CRM strategies, pipeline forecasts, goal suggestions, and growth plans that isolated apps never could. Two companion apps &mdash; CardDesk for networking and E&sup2; for mobile &mdash; keep everything connected on the go.</p>
				<p class="truth-text opacity-0">Simple to use. Powerful underneath. That&rsquo;s the point.</p>
			</div>
		</section>

		<!-- AI Reveal -->
		<section ref="aiRef" class="ai-reveal">
			<div class="ai-reveal-inner">
				<p class="ai-kicker opacity-0">What one platform makes possible</p>
				<h2 class="ai-headline opacity-0">Your data talks<span class="bp">.</span><br/><em>AI listens<span class="bp">.</span></em></h2>
				<p class="ai-lede opacity-0">Most tools bolt AI onto one channel. EARNEST connects AI to your entire business &mdash; people, companies, projects, revenue, conversations, campaigns, financials, and goals &mdash; then layers in your brand direction and target audience to generate CRM Intelligence reports, Health Snapshots, Goal Suggestions, and Marketing AI plans that are uniquely yours.</p>

				<div class="ai-capabilities">
					<div class="ai-cap opacity-0">
						<span class="ai-cap-number">01</span>
						<h3 class="ai-cap-title">Productivity Engine</h3>
						<p class="ai-cap-desc">Scans every module in real time &mdash; tickets, projects, tasks, invoices, deals, channels, social, and goals &mdash; then surfaces prioritized actions instantly. No AI tokens. Pure algorithmic intelligence.</p>
					</div>
					<div class="ai-cap opacity-0">
						<span class="ai-cap-number">02</span>
						<h3 class="ai-cap-title">Brand Awareness AI</h3>
						<p class="ai-cap-desc">Brand direction, goals, target audience, and location &mdash; per client, per team, per organization. Every AI feature uses this context: Social AI Generate, Email Marketing AI, CRM Intelligence, Marketing AI Analyze, and Goal Suggestions all speak your language.</p>
					</div>
					<div class="ai-cap opacity-0">
						<span class="ai-cap-number">03</span>
						<h3 class="ai-cap-title">Health Snapshots + Deep Analysis</h3>
						<p class="ai-cap-desc">Instant Health Snapshots give you CRM and marketing scores from pure data &mdash; no tokens, no waiting. When you need more, CRM Intelligence and Marketing AI Analyze deliver deep analysis, pipeline forecasts, growth plans, and campaign strategies on demand.</p>
					</div>
				</div>
			</div>
		</section>

		<!-- Divider -->
		<div class="section-rule"></div>

		<!-- Features -->
		<section ref="featuresRef" id="features" class="features-section">
			<div class="features-header">
				<p class="features-hero-word opacity-0">Everything</p>
				<h2 class="features-title opacity-0">your business needs<span class="bp">.</span><br/><em class="features-nothing">Nothing</em> it doesn't<span class="bp">.</span></h2>
				<p class="features-sub opacity-0">Built for teams who are serious about their work<span class="bp">.</span></p>
			</div>

			<div class="feature-list">
				<div
					v-for="(feature, index) in features"
					:key="index"
					class="feature-item opacity-0"
				>
					<span class="feature-number">{{ String(index + 1).padStart(2, '0') }}</span>
					<div class="feature-name">{{ feature.name }}</div>
					<div class="feature-desc">{{ feature.desc }}</div>
				</div>
			</div>
		</section>

		<!-- Quote Break -->
		<div class="quote-break">
			<p class="quote-text opacity-0">&ldquo;Design is so simple. That&rsquo;s why it is so <em>complicated.</em>&rdquo;</p>
			<p class="quote-attr opacity-0">&mdash; Paul Rand</p>
		<p class="quote-earnest opacity-0"><span class="quote-earnest-brand">EARNEST</span> applies the same standard for your business<span class="bp">.</span></p>
		</div>

		<!-- Pricing -->
		<section ref="pricingRef" id="pricing" class="pricing-section">
			<div class="pricing-header">
				<h2 class="pricing-title opacity-0"><em class="pricing-honest">Honest</em> pricing<span class="bp">.</span><br/>No surprises<span class="bp">.</span></h2>
				<p class="pricing-sub opacity-0">One price. Your whole team. Cancel any time &mdash; we'd rather earn your business than trap it.</p>
			</div>

			<div class="plans-grid">
				<div
					v-for="(plan, index) in plans"
					:key="index"
					class="plan opacity-0"
					:class="{ 'plan-featured': plan.featured }"
				>
					<div class="plan-name">{{ plan.name }}</div>
					<div class="plan-price"><sup>$</sup>{{ plan.price }}<span> / mo</span></div>
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
	{ name: 'Twilio', replaces: 'Phone system', icon: 'i-lucide-phone' },
	{ name: 'Zoom', replaces: 'Video meetings', icon: 'i-lucide-video' },
	{ name: 'Calendly', replaces: 'Scheduling', icon: 'i-lucide-calendar' },
	{ name: 'HubSpot', replaces: 'Unified CRM', icon: 'i-lucide-users' },
	{ name: 'Lattice', replaces: 'Goal tracking', icon: 'i-lucide-target' },
	{ name: 'ChatGPT', replaces: 'AI assistant', icon: 'i-lucide-sparkles' },
];

const numberWords = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
const toolCountWord = computed(() => {
	const count = replacedTools.length;
	return numberWords[count] || String(count);
});

const features = [
	{ name: 'Productivity Engine', desc: 'Your command center. Scans tickets, projects, tasks, invoices, channels, social, deals, and goals — then surfaces prioritized actions, urgent items, and intelligent suggestions. No AI tokens needed — pure algorithmic intelligence that loads instantly every time you open Earnest.' },
	{ name: 'CRM Intelligence', desc: 'AI reads across your entire business — contacts, clients, projects, tickets, invoices, deals, and goals — then generates health scores, pipeline forecasts, growth plans, and contact strategies tailored to your brand positioning and objectives.' },
	{ name: 'Health Snapshots', desc: 'Instant CRM and marketing health scores computed from your real data — no AI tokens, no waiting. Algorithmic analysis of contacts, revenue trends, overdue items, and pipeline health gives you a live pulse on your business the moment you open the dashboard.' },
	{ name: 'Marketing AI Analyze', desc: 'AI scans your entire business — contacts, social, email, clients, revenue — and returns a marketing health score, actionable insights, and multi-channel campaign plans. Analyze for a specific client or your whole organization. One click.' },
	{ name: 'AI Strategy Engine', desc: 'Your data becomes your strategist. AI connects the dots across every module to generate campaigns, spot opportunities, and surface insights no isolated tool can see.' },
	{ name: 'Brand Awareness AI', desc: 'Set brand direction, goals, target audience, and location per client. Every AI feature — from CRM analysis to social posts to email campaigns — uses this context to generate suggestions aligned with your positioning. Not generic advice. Your brand, your voice, your market.' },
	{ name: 'Social AI Generate', desc: 'Schedule to Instagram, LinkedIn, Facebook, and Threads. AI generates platform-optimized posts, hashtags, and image suggestions — all informed by your brand direction and target audience — in seconds.' },
	{ name: 'Email Marketing AI', desc: 'Block-based newsletter builder with AI-powered content generation. Describe your email and get a complete template — subject line, sections, images, and copy — all tuned to your brand voice and audience.' },
	{ name: 'Goal Suggestions', desc: 'AI suggests strategic goals based on your actual data, brand direction, and business objectives — financial, networking, performance, marketing, or custom. Track progress with periodic snapshots and let the productivity engine factor your goals into daily priorities.' },
	{ name: 'Project Management', desc: 'Kanban boards, task lists, timelines, file attachments, and a command-center project dashboard with stats, document uploads, invoices, and activity feeds. Your team always knows what\'s next.' },
	{ name: 'People & Companies', desc: 'Every person and company in one unified CRM — clients, contacts, prospects, and networking connections from CardDesk. Brand context, goals, services, and the full history of every conversation and project.' },
	{ name: 'Quick Tasks & AI To-Dos', desc: 'Personal task lists with AI-powered suggestions, day and week scheduling, motivational progress tracking, and confetti celebrations. AI generates task ideas based on your workload and brand context so nothing falls through the cracks.' },
	{ name: 'AI Token Management', desc: 'Admins control AI usage per member — set monthly budgets, toggle access on and off, monitor usage across the team. Purchase token add-on packages when you need more. Full visibility into who uses what.' },
	{ name: 'Client Access Control', desc: 'Role-based client visibility with team assignments and individual overrides. Owners and admins see everything. Managers and members see only the clients assigned to their teams — plus any individual access grants.' },
	{ name: 'Invoicing & Billing', desc: 'Stripe-powered invoices, proposals, payment tracking, and PDF generation. Get paid on time.' },
	{ name: 'Team Channels', desc: 'Slack-style messaging built into your workspace. Conversations stay with the work they\'re about.' },
	{ name: 'Phone & Video', desc: 'Twilio-powered calling and video meetings. Click-to-call contacts, record calls, and host team video — all without leaving Earnest.' },
	{ name: 'Calendar & Scheduling', desc: 'Public booking links, Google/Outlook calendar sync, and team availability. Everything connected to your clients and projects.' },
	{ name: 'CardDesk', desc: 'Turn every business card and networking event into a CRM relationship. Scan cards with AI vision, track follow-ups, and gamify your networking with XP, levels, and badges.' },
	{ name: 'Earnest Companion (E\u00B2)', desc: 'Your business in your pocket. Tasks, messages, contacts, and AI on the go — a mobile-first companion that keeps you connected to everything in Earnest.' },
];

const plans = [
	{
		name: 'Solo',
		price: '29',
		desc: 'For the one-person shop doing serious work.',
		featured: false,
		features: ['1 user', 'Unlimited projects', 'Invoicing & Stripe billing', 'Social scheduling (2 accounts)', 'Productivity Engine', 'Health Snapshots (CRM & Marketing)', 'Social AI Generate', 'Goal Suggestions', 'People & Companies CRM', 'CardDesk & E\u00B2 companion apps', '500K AI tokens/month', '5GB storage'],
		cta: { label: 'Get started', to: '/register' },
	},
	{
		name: 'Team',
		price: '89',
		desc: 'For the team that means business.',
		featured: true,
		features: ['Up to 10 users', 'Everything in Solo', 'Team channels & video', 'Phone system (Twilio)', 'Social scheduling (10 accounts)', 'Marketing AI Analyze', 'CRM Intelligence (overview + contacts)', 'Email Marketing AI', 'Brand Awareness AI per client', 'AI Token Management (admin controls)', 'Team-based client access control', '5M AI tokens/month', '25GB storage'],
		cta: { label: 'Start free trial', to: '/register' },
	},
	{
		name: 'Studio',
		price: '189',
		desc: 'For the business that\'s grown into something real.',
		featured: false,
		features: ['Up to 25 users', 'Everything in Team', 'Custom domain', 'White-label client portal', 'Unlimited social accounts', 'AI Strategy Engine (full suite)', 'CRM Intelligence (all 4 modes)', 'Brand Awareness AI per client & team', 'Comprehensive client data analysis', 'Granular client access with user overrides', '25M AI tokens/month', '100GB storage'],
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
			.fromTo('.hero-period', { opacity: 0, y: -20 }, { opacity: 1, y: 0, duration: 0.5, ease: 'back.out(1.5)' }, '-=0.3')
			.fromTo('.hero-tagline', { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.8, ease: 'power3.out' }, '-=0.3')
			.fromTo('.hero-sub', { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.8, ease: 'power3.out' }, '-=0.5')
			.fromTo('.hero-actions', { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.8, ease: 'power3.out' }, '-=0.5')
			.fromTo('.hero-scroll', { opacity: 0 }, { opacity: 1, duration: 0.6, ease: 'power3.out' }, '-=0.2');

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

		// Scroll line pulse
		gsap.to('.scroll-line', {
			scaleY: 0.6,
			opacity: 0.3,
			duration: 2,
			repeat: -1,
			yoyo: true,
			ease: 'power2.inOut',
		});

		// Section reveal helper — faster animations, earlier trigger
		const revealElements = (sectionRef, selector) => {
			if (!sectionRef.value) return;
			const els = sectionRef.value.querySelectorAll(selector);
			els.forEach((el, i) => {
				gsap.fromTo(el,
					{ opacity: 0, y: 20 },
					{
						opacity: 1, y: 0, duration: 0.6, ease: 'power3.out',
						scrollTrigger: { trigger: el, start: 'top 98%', toggleActions: 'play none none none' },
						delay: i * 0.05,
					}
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
		gsap.fromTo('.quote-text', { opacity: 0, y: 20 }, {
			opacity: 1, y: 0, duration: 0.6, ease: 'power3.out',
			scrollTrigger: { trigger: '.quote-break', start: 'top 98%' },
		});
		gsap.fromTo('.quote-attr', { opacity: 0 }, {
			opacity: 1, duration: 0.6, ease: 'power3.out',
			scrollTrigger: { trigger: '.quote-break', start: 'top 98%' },
			delay: 0.15,
		});
		gsap.fromTo('.quote-earnest', { opacity: 0, y: 16 }, {
			opacity: 1, y: 0, duration: 0.6, ease: 'power3.out',
			scrollTrigger: { trigger: '.quote-break', start: 'top 98%' },
			delay: 0.3,
		});

		// Pricing
		revealElements(pricingRef, '.pricing-title, .pricing-sub, .plan');
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
			content: 'Earnest is the AI-powered platform where your work actually lives. Projects, invoicing, goals, social scheduling, team channels, phone & video, CRM, and AI that sees everything.',
		},
	],
});
</script>

<style scoped>
/* ─── Earnest Brand Tokens ─── */
.sell-sheet {
	--paper:   #F6F1E7;
	--paper-2: #EDE7D9;
	--ink:     #1C1812;
	--ink-2:   #3D3529;
	--muted:   #8C7B6B;
	--accent:  #B85C2C;
	--rule:    rgba(28,24,18,0.12);

	background: var(--paper);
	color: var(--ink);
	font-family: var(--font-proxima-light);
	-webkit-font-smoothing: antialiased;
}
.bp { color: var(--accent); font-size: 1.3em; line-height: 0; }

/* ─── HERO ─── */
.earnest-hero {
	min-height: 100svh;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	text-align: center;
	padding: 80px 24px 80px;
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
.btn-ink:hover { background: var(--accent); }
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
.btn-ghost:hover { border-color: var(--ink); color: var(--ink); }

.hero-scroll {
	position: absolute;
	bottom: 80px;
	left: 50%;
	transform: translateX(-50%);
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 8px;
}
.scroll-line {
	width: 1px;
	height: 48px;
	background: var(--muted);
	transform-origin: top;
}
.scroll-label {
	font-family: var(--font-proxima-light);
	font-style: italic;
	font-size: 11px;
	color: var(--muted);
	letter-spacing: 0.1em;
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
	color: rgba(246,241,231,1);
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
.marquee-dot { color: var(--accent); margin: 0 4px; }
@keyframes marquee {
	from { transform: translateX(0); }
	to   { transform: translateX(-50%); }
}

/* ─── REPLACES ─── */
.replaces-section {
	padding: 100px 48px;
	max-width: 860px;
	margin: 0 auto;
	text-align: center;
	background: var(--paper);
}
@media (max-width: 700px) { .replaces-section { padding: 60px 16px; } }
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
@media (max-width: 700px) { .replaces-grid { grid-template-columns: repeat(2, 1fr); } }
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
	.replaces-item { padding: 16px 10px; gap: 6px; }
}
.replaces-item:hover { background: var(--paper-2); }
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
	.replaces-icon { width: 18px; height: 18px; }
}
.replaces-item:hover .replaces-icon { opacity: 1; }
.replaces-name {
	font-family: var(--font-bauer-bodoni);
	font-size: 15px;
	font-weight: 600;
	color: var(--ink);
	letter-spacing: 0.01em;
}
@media (max-width: 700px) {
	.replaces-name { font-size: 12px; }
}
.replaces-for {
	font-family: var(--font-proxima-light);
	font-size: 11px;
	color: var(--muted);
	letter-spacing: 0.04em;
}
@media (max-width: 700px) {
	.replaces-for { font-size: 9px; }
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
	.truth-section { grid-template-columns: 1fr; gap: 40px; padding: 80px 24px; }
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
	.truth-label { position: static; }
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
.truth-text strong { color: var(--ink); font-weight: 600; }

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
	background: radial-gradient(ellipse at 50% 0%, rgba(184,92,44,0.08) 0%, transparent 70%);
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
	color: rgba(246,241,231,0.6);
	max-width: 600px;
	margin-bottom: 64px;
}
.ai-capabilities {
	display: grid;
	grid-template-columns: repeat(3, 1fr);
	gap: 1px;
	background: rgba(246,241,231,0.08);
	border: 1px solid rgba(246,241,231,0.08);
}
@media (max-width: 700px) { .ai-capabilities { grid-template-columns: 1fr; } }
.ai-cap {
	padding: 36px 32px;
	background: var(--ink);
	transition: background 0.2s;
}
.ai-cap:hover { background: rgba(246,241,231,0.03); }
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
	color: rgba(246,241,231,0.5);
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
@media (max-width: 700px) { .features-section { padding: 60px 24px 80px; } }

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
@media (max-width: 600px) { .feature-list { grid-template-columns: 1fr; } }

.feature-item {
	padding: 36px 32px;
	border-right: 1px solid var(--rule);
	border-bottom: 1px solid var(--rule);
	transition: background 0.2s;
	cursor: default;
}
.feature-item:hover { background: var(--paper-2); }
.feature-item:nth-child(2n) { border-right: none; }

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
	top: -40px; left: 50%;
	transform: translateX(-50%);
	font-family: var(--font-bauer-bodoni);
	font-size: 300px;
	color: rgba(246,241,231,0.04);
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
	color: rgba(246,241,231,0.35);
	letter-spacing: 0.1em;
	margin-top: 32px;
	text-transform: uppercase;
}
.quote-earnest {
	font-family: var(--font-proxima-light);
	font-style: normal;
	font-size: clamp(18px, 3vw, 24px);
	color: rgba(246,241,231,0.85);
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

/* ─── PRICING ─── */
.pricing-section {
	padding: 120px 48px;
	max-width: 860px;
	margin: 0 auto;
	background: var(--paper);
}
@media (max-width: 700px) { .pricing-section { padding: 80px 24px; } }

.pricing-header {
	margin-bottom: 64px;
	display: grid;
	grid-template-columns: auto 1fr;
	gap: 40px;
	align-items: end;
}
@media (max-width: 600px) { .pricing-header { grid-template-columns: 1fr; } }
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
@media (max-width: 600px) { .plans-grid { grid-template-columns: 1fr; } }

.plan {
	background: var(--paper);
	padding: 40px 32px;
	transition: background 0.2s;
}
.plan:hover { background: var(--paper-2); }

.plan-featured {
	background: var(--ink) !important;
	color: var(--paper);
}
.plan-featured:hover { background: var(--ink) !important; }

.plan-name {
	font-family: var(--font-bauer-bodoni);
	font-size: 22px;
	font-weight: 600;
	letter-spacing: 0.02em;
}
.plan-featured .plan-name { color: var(--paper); }

.plan-price {
	font-family: var(--font-bauer-bodoni);
	font-size: 52px;
	font-weight: 600;
	line-height: 1;
	margin-top: 20px;
	letter-spacing: -0.02em;
	color: var(--ink);
}
.plan-featured .plan-price { color: var(--paper); }
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
.plan-featured .plan-price span { color: rgba(246,241,231,0.5); }

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
.plan-featured .plan-desc { color: rgba(246,241,231,0.4); border-bottom-color: rgba(246,241,231,0.1); }

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
.plan-featured .plan-features li { color: rgba(246,241,231,0.75); }
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
.plan-btn:hover { background: var(--ink); color: var(--paper); border-color: var(--ink); }
.plan-featured .plan-btn {
	background: var(--accent);
	border-color: var(--accent);
	color: white;
}
.plan-featured .plan-btn:hover { filter: brightness(1.1); }

/* ─── FOOTER ─── */
</style>
