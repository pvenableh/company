<template>
	<div class="sell-sheet">
		<!-- Hero -->
		<section ref="heroRef" class="earnest-hero">
			<p class="hero-kicker opacity-0">The business operating system</p>
			<h1 class="hero-wordmark opacity-0">Earnest<span class="hero-period">.</span></h1>
			<p class="hero-tagline opacity-0">Do <span class="hero-cycle-wrap"><span ref="heroCycleRef" class="hero-cycle">good</span></span> work<span class="bp">.</span></p>
			<p class="hero-sub opacity-0">One platform<span class="bp">.</span> Every signal<span class="bp">.</span> AI that sees the whole picture<span class="bp">.</span></p>
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

		<!-- Truth Section -->
		<section ref="truthRef" class="truth-section">
			<div class="truth-label opacity-0">The honest case</div>
			<div class="truth-body">
				<h2 class="truth-title opacity-0">Your business runs on <em>eight tools<span class="bp">.</span></em><br/>It should run on one<span class="bp">.</span></h2>
				<p class="truth-text opacity-0">You have a project tool. An invoice tool. A social tool. A phone system. A shared inbox. A calendar. A document editor. And Slack to hold it all together.</p>
				<p class="truth-text opacity-0"><strong>None of them talk to each other.</strong> You pay for all of them. You lose hours between them every week.</p>
				<p class="truth-text opacity-0">EARNEST is the one place where the work actually lives &mdash; from the first brief to the final invoice. No integrations to maintain. No context to re-explain. No tab-switching at 11pm before a client call.</p>
				<p class="truth-text opacity-0">And because everything is in one place, <strong>AI can actually think about your business</strong> &mdash; generating social content, writing email campaigns, and surfacing strategy that isolated apps never could.</p>
				<p class="truth-text opacity-0">Just the work. Done well.</p>
			</div>
		</section>

		<!-- AI Reveal -->
		<section ref="aiRef" class="ai-reveal">
			<div class="ai-reveal-inner">
				<p class="ai-kicker opacity-0">What one platform makes possible</p>
				<h2 class="ai-headline opacity-0">Your data talks<span class="bp">.</span><br/><em>AI listens<span class="bp">.</span></em></h2>
				<p class="ai-lede opacity-0">Most tools add AI to one channel. EARNEST connects AI to your entire business &mdash; clients, projects, revenue, conversations, campaigns &mdash; and turns the full picture into strategy.</p>

				<div class="ai-capabilities">
					<div class="ai-cap opacity-0">
						<span class="ai-cap-number">01</span>
						<h3 class="ai-cap-title">Sees everything</h3>
						<p class="ai-cap-desc">Contacts, projects, invoices, emails, social posts, phone calls, and team channels. One brain across every module.</p>
					</div>
					<div class="ai-cap opacity-0">
						<span class="ai-cap-number">02</span>
						<h3 class="ai-cap-title">Connects the dots</h3>
						<p class="ai-cap-desc">A churning client triggers a re-engagement email, a social campaign, and a follow-up call. Automatically. Strategically.</p>
					</div>
					<div class="ai-cap opacity-0">
						<span class="ai-cap-number">03</span>
						<h3 class="ai-cap-title">Thinks in campaigns</h3>
						<p class="ai-cap-desc">Not just posts or emails &mdash; full multi-channel strategies with timelines, audience targeting, and performance tracking built from your real data.</p>
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
import { ref, onMounted, onUnmounted } from 'vue';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const heroRef = ref(null);
const truthRef = ref(null);
const aiRef = ref(null);
const featuresRef = ref(null);
const pricingRef = ref(null);
const heroCycleRef = ref(null);

const cycleWords = ['good', 'great', 'impossible', 'possible', 'simple', 'good'];

const marqueeItems = [
	{ label: 'AI Strategy Engine', icon: 'i-lucide-brain' },
	{ label: 'AI Content Generation', icon: 'i-lucide-sparkles' },
	{ label: 'Projects', icon: 'i-lucide-folder-kanban' },
	{ label: 'Invoicing', icon: 'i-lucide-receipt' },
	{ label: 'Client Management', icon: 'i-lucide-building-2' },
	{ label: 'Social Scheduling', icon: 'i-lucide-calendar-clock' },
	{ label: 'Team Channels', icon: 'i-lucide-message-square' },
	{ label: 'Video & Phone', icon: 'i-lucide-video' },
	{ label: 'Email Analytics', icon: 'i-lucide-mail' },
	{ label: 'Proposals & Billing', icon: 'i-lucide-file-text' },
	{ label: 'Contacts & CRM', icon: 'i-lucide-users' },
];

const features = [
	{ name: 'AI Strategy Engine', desc: 'Your data becomes your strategist. AI analyzes clients, revenue, content performance, and conversations to generate campaigns, spot opportunities, and surface insights no isolated tool can see.' },
	{ name: 'Social Media & AI Content', desc: 'Schedule to Instagram, LinkedIn, Facebook, and Threads. AI generates platform-optimized posts, hashtags, and image suggestions in seconds.' },
	{ name: 'Email Marketing & AI', desc: 'Block-based newsletter builder with AI-powered content generation. Describe your email and get a complete template \u2014 subject line, sections, and images.' },
	{ name: 'Project Management', desc: 'Kanban boards, task lists, timelines, and file attachments. Your team always knows what\'s next.' },
	{ name: 'Client & Contact CRM', desc: 'Every client, prospect, and partner in one place. With the full history of every conversation and project.' },
	{ name: 'Invoicing & Billing', desc: 'Stripe-powered invoices, proposals, payment tracking, and PDF generation. Get paid on time.' },
	{ name: 'Team Channels', desc: 'Slack-style messaging built into your workspace. Conversations stay with the work they\'re about.' },
	{ name: 'Phone, Video & Calendar', desc: 'Twilio-powered calling, video meetings, public booking links, and Google/Outlook calendar sync. Everything connected.' },
];

const plans = [
	{
		name: 'Solo',
		price: '29',
		desc: 'For the one-person shop doing serious work.',
		featured: false,
		features: ['1 user', 'Unlimited projects', 'Invoicing & Stripe billing', 'Social scheduling (2 accounts)', 'AI content generation', 'Contact CRM', '5GB storage'],
		cta: { label: 'Get started', to: '/register' },
	},
	{
		name: 'Team',
		price: '89',
		desc: 'For the team that means business.',
		featured: true,
		features: ['Up to 10 users', 'Everything in Solo', 'Team channels & video', 'Phone system (Twilio)', 'Social scheduling (10 accounts)', 'AI email & social content wizards', 'AI marketing insights', 'Priority support', '25GB storage'],
		cta: { label: 'Start free trial', to: '/register' },
	},
	{
		name: 'Studio',
		price: '189',
		desc: 'For the business that\'s grown into something real.',
		featured: false,
		features: ['Up to 25 users', 'Everything in Team', 'Custom domain', 'White-label client portal', 'Unlimited social accounts', 'AI Strategy Engine (full suite)', 'Campaign planner & reports', '100GB storage'],
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

		// Hero word cycle — animate width smoothly between words
		if (heroCycleRef.value) {
			const wrap = heroCycleRef.value.parentElement;
			// Set initial width
			wrap.style.width = heroCycleRef.value.offsetWidth + 'px';

			const cycleTl = gsap.timeline({ delay: 3, repeat: -1, repeatDelay: 4 });
			cycleWords.forEach((word, i) => {
				if (i === 0) return;
				cycleTl
					.to(heroCycleRef.value, { opacity: 0, y: -12, duration: 0.3, ease: 'power2.in' })
					.call(() => {
						heroCycleRef.value.textContent = word;
						gsap.to(wrap, { width: heroCycleRef.value.offsetWidth, duration: 0.3, ease: 'power2.out' });
					})
					.fromTo(heroCycleRef.value, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.4, ease: 'power2.out' })
					.to({}, { duration: 2 });
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

		// Section reveal helper
		const revealElements = (sectionRef, selector) => {
			if (!sectionRef.value) return;
			const els = sectionRef.value.querySelectorAll(selector);
			els.forEach((el, i) => {
				gsap.fromTo(el,
					{ opacity: 0, y: 30 },
					{
						opacity: 1, y: 0, duration: 0.8, ease: 'power3.out',
						scrollTrigger: { trigger: el, start: 'top 95%', toggleActions: 'play none none none' },
						delay: i * 0.08,
					}
				);
			});
		};

		// Truth section
		revealElements(truthRef, '.truth-label, .truth-title, .truth-text');

		// AI reveal section
		revealElements(aiRef, '.ai-kicker, .ai-headline, .ai-lede, .ai-cap');

		// Features section
		revealElements(featuresRef, '.features-hero-word, .features-title, .features-sub, .feature-item');

		// Quote
		gsap.fromTo('.quote-text', { opacity: 0, y: 30 }, {
			opacity: 1, y: 0, duration: 1, ease: 'power3.out',
			scrollTrigger: { trigger: '.quote-break', start: 'top 90%' },
		});
		gsap.fromTo('.quote-attr', { opacity: 0 }, {
			opacity: 1, duration: 0.8, ease: 'power3.out',
			scrollTrigger: { trigger: '.quote-break', start: 'top 90%' },
			delay: 0.3,
		});
		gsap.fromTo('.quote-earnest', { opacity: 0, y: 16 }, {
			opacity: 1, y: 0, duration: 0.8, ease: 'power3.out',
			scrollTrigger: { trigger: '.quote-break', start: 'top 90%' },
			delay: 0.6,
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
			content: 'Earnest is the one platform where your work actually lives. Projects, invoicing, social scheduling, team channels, phone & video, CRM, and more.',
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
	min-height: 100vh;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	text-align: center;
	padding: 120px 24px 80px;
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
	animation: marquee 30s linear infinite;
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
