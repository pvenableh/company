<template>
	<div class="sell-sheet">
		<!-- Hero -->
		<section ref="heroRef" class="earnest-hero">
			<p class="hero-kicker opacity-0">The agency operating system</p>
			<h1 class="hero-wordmark opacity-0">Earnest<span class="hero-period">.</span></h1>
			<p class="hero-tagline opacity-0">Do good work.</p>
			<p class="hero-sub opacity-0">A platform that means it.</p>
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
					{{ item }} <span class="marquee-dot">&middot;</span>
				</span>
			</div>
		</div>

		<!-- Truth Section -->
		<section ref="truthRef" class="truth-section">
			<div class="truth-label opacity-0">The honest case</div>
			<div class="truth-body">
				<h2 class="truth-title opacity-0">Your agency runs on <em>eight tools.</em><br/>It should run on one.</h2>
				<p class="truth-text opacity-0">You have a project tool. An invoice tool. A social tool. A phone system. A shared inbox. A calendar. A document editor. And Slack to hold it all together.</p>
				<p class="truth-text opacity-0"><strong>None of them talk to each other.</strong> You pay for all of them. You lose hours between them every week.</p>
				<p class="truth-text opacity-0">Earnest is the one place where the work actually lives &mdash; from the first brief to the final invoice. No integrations to maintain. No context to re-explain. No tab-switching at 11pm before a client call.</p>
				<p class="truth-text opacity-0">Just the work. Done well.</p>
			</div>
		</section>

		<!-- Divider -->
		<div class="section-rule"><span class="section-rule-mark">&starf;</span></div>

		<!-- Features -->
		<section ref="featuresRef" id="features" class="features-section">
			<div class="features-header">
				<h2 class="features-title opacity-0">Everything your agency needs.<br/>Nothing it doesn't.</h2>
				<p class="features-sub opacity-0">Built for 2&ndash;15 person agencies who are serious about their work.</p>
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
			<p class="quote-attr opacity-0">&mdash; Paul Rand &nbsp;&middot;&nbsp; Earnest applies the same standard to software.</p>
		</div>

		<!-- Pricing -->
		<section ref="pricingRef" id="pricing" class="pricing-section">
			<div class="pricing-header">
				<h2 class="pricing-title opacity-0">Honest pricing.<br/>No surprises.</h2>
				<p class="pricing-sub opacity-0">One price. Your whole agency. Cancel any time &mdash; we'd rather earn your business than trap it.</p>
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

		<!-- Footer -->
		<footer class="earnest-footer">
			<div>
				<div class="footer-brand">Earnest<span class="footer-accent">.</span></div>
				<div class="footer-tagline">Do good work.</div>
			</div>
			<div class="footer-nav">
				<div class="footer-col">
					<span class="footer-col-title">Product</span>
					<nuxt-link to="#features">Features</nuxt-link>
					<nuxt-link to="#pricing">Pricing</nuxt-link>
					<nuxt-link to="/register">Get Started</nuxt-link>
				</div>
				<div class="footer-col">
					<span class="footer-col-title">Platform</span>
					<nuxt-link to="#features">Projects</nuxt-link>
					<nuxt-link to="#features">Invoicing</nuxt-link>
					<nuxt-link to="#features">Channels</nuxt-link>
				</div>
				<div class="footer-col">
					<span class="footer-col-title">Account</span>
					<nuxt-link to="/auth/signin">Login</nuxt-link>
					<nuxt-link to="/register">Register</nuxt-link>
				</div>
			</div>
		</footer>
		<p class="footer-copy">&copy; 2026 Earnest. A platform that means it.</p>
	</div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const heroRef = ref(null);
const truthRef = ref(null);
const featuresRef = ref(null);
const pricingRef = ref(null);

const marqueeItems = [
	'Projects', 'Invoicing', 'Client Management', 'Social Scheduling',
	'Team Channels', 'Video & Phone', 'Email Analytics', 'Proposals & Billing', 'Contacts & CRM',
];

const features = [
	{ name: 'Project Management', desc: 'Kanban boards, task lists, timelines, and file attachments. Your team always knows what\'s next.' },
	{ name: 'Invoicing & Billing', desc: 'Stripe-powered invoices, proposals, payment tracking, and PDF generation. Get paid on time.' },
	{ name: 'Social Scheduling', desc: 'Instagram and TikTok content calendar. Create, schedule, publish, and measure \u2014 all in one tab.' },
	{ name: 'Team Channels', desc: 'Slack-style messaging built into your workspace. Conversations stay with the work they\'re about.' },
	{ name: 'Phone & Video', desc: 'Twilio-powered calling, video meetings, and public booking links. A full communications system.' },
	{ name: 'Client & Contact CRM', desc: 'Every client, prospect, and partner in one place. With the full history of every conversation and project.' },
	{ name: 'Email Analytics', desc: 'Send and track client emails with open rates, click tracking, and full campaign history built in.' },
	{ name: 'Scheduling & Calendar', desc: 'Public booking links, Google and Outlook sync, and a team calendar that shows you the whole picture.' },
];

const plans = [
	{
		name: 'Solo',
		price: '29',
		desc: 'For the one-person shop doing serious work.',
		featured: false,
		features: ['1 user', 'Unlimited projects', 'Invoicing & Stripe billing', 'Social scheduling (2 accounts)', 'Contact CRM', '5GB storage'],
		cta: { label: 'Get started', to: '/register' },
	},
	{
		name: 'Agency',
		price: '89',
		desc: 'For the team that means business.',
		featured: true,
		features: ['Up to 10 users', 'Everything in Solo', 'Team channels & video', 'Phone system (Twilio)', 'Social scheduling (10 accounts)', 'Email analytics', 'Priority support', '25GB storage'],
		cta: { label: 'Start free trial', to: '/register' },
	},
	{
		name: 'Studio',
		price: '189',
		desc: 'For the agency that\'s grown into something real.',
		featured: false,
		features: ['Up to 25 users', 'Everything in Agency', 'Custom domain', 'White-label client portal', 'Unlimited social accounts', 'Advanced analytics', '100GB storage'],
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
						scrollTrigger: { trigger: el, start: 'top 85%', toggleActions: 'play none none none' },
						delay: i * 0.08,
					}
				);
			});
		};

		// Truth section
		revealElements(truthRef, '.truth-label, .truth-title, .truth-text');

		// Features section
		revealElements(featuresRef, '.features-title, .features-sub, .feature-item');

		// Quote
		gsap.fromTo('.quote-text', { opacity: 0, y: 30 }, {
			opacity: 1, y: 0, duration: 1, ease: 'power3.out',
			scrollTrigger: { trigger: '.quote-break', start: 'top 75%' },
		});
		gsap.fromTo('.quote-attr', { opacity: 0 }, {
			opacity: 1, duration: 0.8, ease: 'power3.out',
			scrollTrigger: { trigger: '.quote-break', start: 'top 75%' },
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
	title: 'Earnest. Do good work. | The Agency Operating System',
	meta: [
		{
			name: 'description',
			content: 'Earnest is the one platform where your agency\'s work actually lives. Projects, invoicing, social scheduling, team channels, phone & video, CRM, and more.',
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
.earnest-hero::before,
.earnest-hero::after {
	content: '';
	position: absolute;
	left: 48px; right: 48px;
	height: 1px;
	background: var(--rule);
}
.earnest-hero::before { top: 100px; }
.earnest-hero::after  { bottom: 60px; }

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
	font-size: clamp(96px, 18vw, 200px);
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
	font-family: var(--font-bauer-bodoni);
	font-style: italic;
	font-size: 15px;
	color: rgba(246,241,231,0.5);
	padding: 0 32px;
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

/* ─── DIVIDER ─── */
.section-rule {
	display: flex;
	align-items: center;
	gap: 20px;
	padding: 0 48px;
	max-width: 860px;
	margin: 0 auto;
	background: var(--paper);
}
.section-rule::before,
.section-rule::after {
	content: '';
	flex: 1;
	height: 1px;
	background: var(--rule);
}
.section-rule-mark {
	font-family: var(--font-bauer-bodoni);
	font-size: 20px;
	color: var(--accent);
	opacity: 0.5;
}

/* ─── FEATURES ─── */
.features-section {
	padding: 80px 48px 120px;
	max-width: 860px;
	margin: 0 auto;
	background: var(--paper);
}
@media (max-width: 700px) { .features-section { padding: 60px 24px 80px; } }

.features-header { margin-bottom: 64px; }
.features-title {
	font-family: var(--font-bauer-bodoni);
	font-size: clamp(32px, 4vw, 48px);
	font-weight: 500;
	letter-spacing: -0.01em;
	line-height: 1.2;
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
	grid-template-columns: 1fr 1fr;
	gap: 40px;
	align-items: end;
}
@media (max-width: 600px) { .pricing-header { grid-template-columns: 1fr; } }
.pricing-title {
	font-family: var(--font-bauer-bodoni);
	font-size: clamp(36px, 5vw, 52px);
	font-weight: 500;
	line-height: 1.1;
	letter-spacing: -0.01em;
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
.earnest-footer {
	border-top: 1px solid var(--rule);
	padding: 60px 48px;
	display: grid;
	grid-template-columns: 1fr;
	gap: 48px;
	max-width: 1200px;
	margin: 0 auto;
	background: var(--paper);
}
@media (min-width: 601px) {
	.earnest-footer { grid-template-columns: 1fr 2fr; align-items: start; }
}
@media (max-width: 600px) { .earnest-footer { padding: 48px 24px; } }

.footer-brand {
	font-family: var(--font-bauer-bodoni);
	font-size: 36px;
	font-weight: 600;
	letter-spacing: 0.01em;
}
.footer-accent { color: var(--accent); }
.footer-tagline {
	font-family: var(--font-proxima-light);
	font-style: italic;
	font-size: 14px;
	color: var(--muted);
	margin-top: 8px;
}
.footer-nav {
	display: grid;
	grid-template-columns: repeat(3, 1fr);
	gap: 32px;
}
@media (max-width: 600px) { .footer-nav { grid-template-columns: repeat(2, 1fr); } }

.footer-col {
	display: flex;
	flex-direction: column;
	gap: 12px;
}
.footer-col-title {
	font-family: var(--font-bauer-bodoni);
	font-size: 13px;
	font-weight: 600;
	color: var(--ink);
	letter-spacing: 0.02em;
	margin-bottom: 4px;
}
.footer-col a {
	font-family: var(--font-proxima-light);
	font-size: 13px;
	color: var(--muted);
	text-decoration: none;
	letter-spacing: 0.04em;
	transition: color 0.2s;
}
.footer-col a:hover { color: var(--ink); }
.footer-copy {
	font-size: 12px;
	color: var(--muted);
	letter-spacing: 0.04em;
	opacity: 0.6;
	padding: 20px 48px 40px;
	text-align: center;
	font-family: var(--font-proxima-light);
	font-style: italic;
	background: var(--paper);
}
</style>
