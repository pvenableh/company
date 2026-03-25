<template>
	<div class="pitch">
		<!-- Hero -->
		<section class="pitch-hero">
			<p class="pitch-kicker opacity-0">Investor Overview</p>
			<h1 class="pitch-wordmark opacity-0">
				Earnest
				<span class="bp">.</span>
			</h1>
			<p class="pitch-tagline opacity-0">
				Do
				<span class="pitch-cycle-wrap"><span ref="pitchCycleRef" class="pitch-cycle">good</span></span>
				work<span class="bp">.</span>
			</p>
			<p class="pitch-sub opacity-0">
				Actionable experiences
				<span class="bp">.</span>
				Intuitive movement
				<span class="bp">.</span>
				AI that sees the whole business
				<span class="bp">.</span>
			</p>
		</section>

		<!-- Marquee -->
		<div class="marquee-wrap" aria-hidden="true">
			<div class="marquee-track">
				<span v-for="(item, i) in [...marqueeItems, ...marqueeItems]" :key="i" class="marquee-item">
					{{ item }}
					<span class="marquee-dot">&middot;</span>
				</span>
			</div>
		</div>

		<!-- Problem -->
		<section class="pitch-section">
			<div class="section-label">The problem</div>
			<div class="section-body">
				<h2 class="section-title">
					Small businesses run on
					<span class="accent">fragmented tools</span>
					<span class="bp">.</span>
				</h2>
				<p class="section-text">
					A typical 5&ndash;15 person agency juggles 8&ndash;12 separate subscriptions: project management, invoicing, CRM, social media scheduling, email marketing, team chat, phone system, calendar, and more. Total cost: $400&ndash;$800/month. Zero cohesion. No shared intelligence. Every tool is a dead end &mdash; data goes in, nothing actionable comes out.
				</p>
				<div class="stat-row">
					<div class="stat">
						<div class="stat-number">$6,000+</div>
						<div class="stat-label">Annual tool spend per SMB</div>
					</div>
					<div class="stat">
						<div class="stat-number">8&ndash;12</div>
						<div class="stat-label">Average tools per team</div>
					</div>
					<div class="stat">
						<div class="stat-number">0</div>
						<div class="stat-label">Cross-tool AI intelligence</div>
					</div>
				</div>
			</div>
		</section>

		<!-- Solution -->
		<section class="pitch-section-dark">
			<div class="pitch-section-dark-inner">
			<div class="section-label-light">The solution</div>
			<div class="section-body">
				<h2 class="section-title-light">
					One platform
					<span class="bp">.</span>
					One login
					<span class="bp">.</span>
					AI that connects the dots
					<span class="bp">.</span>
				</h2>
				<p class="section-text-light">
					Earnest replaces the entire stack with actionable experiences &mdash; not dashboards you stare at, but surfaces you work from. Projects, invoicing, CRM, team channels, social media, email marketing, scheduling, phone &amp; video, goals, and CardDesk networking &mdash; all in one place with intuitive movement between every module. Because everything lives together, the AI sees your whole business and produces insight that isolated tools never could.
				</p>
				<div class="ai-modes">
					<div v-for="mode in aiModes" :key="mode.name" class="ai-mode">
						<div class="ai-mode-name">{{ mode.name }}</div>
						<div class="ai-mode-desc">{{ mode.desc }}</div>
					</div>
				</div>
			</div>
			</div>
		</section>

		<!-- Market -->
		<section class="pitch-section">
			<div class="section-label">Target market</div>
			<div class="section-body">
				<h2 class="section-title">
					2&ndash;50 person businesses
					<span class="bp">.</span>
				</h2>
				<p class="section-text">
					Agencies, consultancies, marketing firms, dev shops, and professional services. Operationally sophisticated enough to need a real platform, too small for a dedicated ops team to stitch one together.
				</p>
				<div class="market-grid">
					<div v-for="seg in segments" :key="seg.name" class="market-item">
						<div class="market-name">{{ seg.name }}</div>
						<div class="market-size">{{ seg.size }}</div>
					</div>
				</div>
			</div>
		</section>

		<!-- Business Model -->
		<section class="pitch-section">
			<div class="section-label">Business model</div>
			<div class="section-body">
				<h2 class="section-title">
					Three revenue levers
					<span class="bp">.</span>
				</h2>
				<p class="section-text">
					Every plan gets every feature. No confusing tier comparisons. Customers self-select by team size and pay for what they consume: seats, AI tokens, and scan credits.
				</p>

				<!-- Plans -->
				<div class="plans-grid">
					<div
						v-for="plan in plans"
						:key="plan.name"
						class="plan"
						:class="{ 'plan-featured': plan.featured }"
					>
						<div class="plan-name">{{ plan.name }}</div>
						<div class="plan-price">
							<sup>$</sup>{{ plan.price }}<span>/ mo</span>
						</div>
						<div class="plan-desc">{{ plan.desc }}</div>
						<ul class="plan-features">
							<li v-for="(f, i) in plan.features" :key="i">{{ f }}</li>
						</ul>
					</div>
				</div>

				<!-- Add-ons -->
				<h3 class="addon-title">
					Add-on revenue
					<span class="bp">.</span>
				</h3>
				<div class="addon-grid">
					<div v-for="addon in addons" :key="addon.name" class="addon-item">
						<div class="addon-name">{{ addon.name }}</div>
						<div class="addon-price">{{ addon.price }}</div>
					</div>
				</div>
			</div>
		</section>

		<!-- Unit Economics -->
		<section class="pitch-section-dark">
			<div class="pitch-section-dark-inner">
			<div class="section-label-light">Unit economics</div>
			<div class="section-body">
				<h2 class="section-title-light">
					AI margin:
					<span class="accent">~50x</span>
					<span class="bp">.</span>
				</h2>
				<p class="section-text-light">
					A Studio customer at $149/mo consumes ~$1.50&ndash;$3.00 in actual API costs. The marketing intelligence engine &mdash; the highest-value feature &mdash; drives above-average token consumption, converting power users into $39&ndash;$99/mo refill buyers.
				</p>
				<div class="stat-row">
					<div class="stat stat-light">
						<div class="stat-number">~$3</div>
						<div class="stat-label">AI cost per Studio customer/mo</div>
					</div>
					<div class="stat stat-light">
						<div class="stat-number">$149</div>
						<div class="stat-label">Revenue per Studio customer/mo</div>
					</div>
					<div class="stat stat-light">
						<div class="stat-number">50x</div>
						<div class="stat-label">Margin on AI costs alone</div>
					</div>
				</div>
			</div>
			</div>
		</section>

		<!-- Revenue Projections Calculator -->
		<section class="pitch-section">
			<div class="section-label">Revenue projections</div>
			<div class="section-body">
				<h2 class="section-title">
					Interactive
					<em>forecast</em>
					<span class="bp">.</span>
				</h2>
				<p class="section-text">
					Adjust customer counts to model different growth scenarios. Year 1 target: ~$255K ARR. Year 2 with cohort maturation: $400K&ndash;$500K.
				</p>

				<!-- Sliders -->
				<div class="calc-controls">
					<div v-for="ctrl in calcControls" :key="ctrl.key" class="calc-row">
						<div class="calc-label">
							<span>{{ ctrl.label }}</span>
							<span class="calc-value">{{ ctrl.modelValue }}</span>
						</div>
						<input
							type="range"
							:min="ctrl.min"
							:max="ctrl.max"
							:step="ctrl.step"
							:value="ctrl.modelValue"
							class="calc-slider"
							@input="ctrl.update($event)"
						/>
					</div>
				</div>

				<!-- Summary cards -->
				<div class="calc-summary">
					<div class="calc-card">
						<div class="calc-card-label">Monthly Recurring Revenue</div>
						<div class="calc-card-value">${{ formatK(monthlyRevenue) }}</div>
					</div>
					<div class="calc-card calc-card-accent">
						<div class="calc-card-label">Annual Recurring Revenue</div>
						<div class="calc-card-value">${{ formatK(annualRevenue) }}</div>
					</div>
					<div class="calc-card">
						<div class="calc-card-label">Avg Revenue Per Account</div>
						<div class="calc-card-value">${{ arpa.toFixed(0) }}/mo</div>
					</div>
				</div>

				<!-- Projection chart -->
				<div class="calc-chart">
					<ClientOnly>
						<ChartContainer :config="chartConfig" class="aspect-auto h-full w-full">
							<VisXYContainer
								:data="projectionData"
								:margin="{ left: 10, right: 10, top: 10, bottom: 5 }"
								:y-domain="[0, undefined]"
							>
								<VisLine
									:x="(d: any) => d.month"
									:y="[(d: any) => d.mrr, (d: any) => d.arr]"
									:color="[chartConfig.mrr?.color ?? '', chartConfig.arr?.color ?? '']"
									:curve-type="CurveType.MonotoneX"
								/>
								<VisAxis
									type="x"
									:x="(d: any) => d.month"
									:tick-line="false"
									:domain-line="false"
									:grid-line="false"
									:tick-format="(v: number) => 'M' + v"
									:num-ticks="6"
								/>
								<VisAxis
									type="y"
									:tick-format="(v: number) => '$' + formatK(v)"
									:grid-line="true"
									:tick-line="false"
									:domain-line="false"
									:num-ticks="5"
								/>
								<ChartCrosshair
									:template="crosshairTemplate"
									:color="[chartConfig.mrr?.color ?? '', chartConfig.arr?.color ?? '']"
								/>
							</VisXYContainer>
						</ChartContainer>
					</ClientOnly>
				</div>
				<div class="chart-legend">
					<span class="legend-item">
						<span class="legend-dot" style="background: hsl(217, 91%, 60%)"></span>
						MRR
					</span>
					<span class="legend-item">
						<span class="legend-dot" style="background: hsl(142, 71%, 45%)"></span>
						ARR (MRR &times; 12)
					</span>
				</div>

				<!-- Breakdown table -->
				<div class="breakdown-table">
					<div class="bt-header">
						<span>Revenue Stream</span>
						<span>Customers</span>
						<span>ARPU</span>
						<span>Monthly</span>
						<span>Annual</span>
					</div>
					<div v-for="row in breakdownRows" :key="row.label" class="bt-row">
						<span>{{ row.label }}</span>
						<span>{{ row.customers }}</span>
						<span>${{ row.arpu }}</span>
						<span>${{ formatK(row.monthly) }}</span>
						<span>${{ formatK(row.annual) }}</span>
					</div>
					<div class="bt-total">
						<span>Total</span>
						<span>{{ totalCustomers }}</span>
						<span></span>
						<span>${{ formatK(monthlyRevenue) }}</span>
						<span>${{ formatK(annualRevenue) }}</span>
					</div>
				</div>
			</div>
		</section>

		<!-- Retention -->
		<section class="pitch-section">
			<div class="section-label">Retention engine</div>
			<div class="section-body">
				<h2 class="section-title">
					The Earnest Score
					<span class="bp">.</span>
				</h2>
				<p class="section-text">
					Switching feels like starting over. The Earnest Score is an org-level performance metric driven by five dimensions &mdash; Delivery, Communication, Finance, Growth, and Consistency. Streaks, levels, badges, and team leaderboards create psychological switching costs that no contract clause can match.
				</p>
				<div class="score-dims">
					<div v-for="dim in dimensions" :key="dim.name" class="score-dim">
						<div class="dim-bar" :style="{ width: dim.weight + '%', background: dim.color }"></div>
						<div class="dim-info">
							<span class="dim-name">{{ dim.name }}</span>
							<span class="dim-weight">{{ dim.weight }}%</span>
						</div>
						<div class="dim-desc">{{ dim.desc }}</div>
					</div>
				</div>
			</div>
		</section>

		<!-- Footer -->
		<section class="pitch-footer">
			<div class="footer-brand">EARNEST</div>
			<p class="footer-tagline">Do good work<span class="bp">.</span></p>
			<p class="footer-url">earnest.guru</p>
			<div class="footer-divider"></div>
			<p class="footer-parent">HUE <span class="footer-parent-tagline">&mdash; "We personalize the modern world."</span></p>
		</section>
	</div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import type { ChartConfig } from '~/components/ui/chart';
import { ChartContainer, ChartCrosshair, ChartTooltipContent, componentToString } from '~/components/ui/chart';
import { VisXYContainer, VisLine, VisAxis } from '@unovis/vue';
import { CurveType } from '@unovis/ts';

gsap.registerPlugin(ScrollTrigger);

// ── Word cycler ──
const pitchCycleRef = ref<HTMLElement | null>(null);
const cycleWords = ['good', 'honest', 'real', 'smart', 'great'];

// ── Marquee data ──
const marqueeItems = [
	'Projects', 'Invoicing', 'CRM', 'Social Media', 'Email Marketing',
	'Scheduling', 'Phone & Video', 'Team Chat', 'CardDesk', 'Goals',
	'AI Command Center', 'Client Portal', 'Expenses',
];

// ── Static data ──

const aiModes = [
	{ name: 'Command Center', desc: 'Prioritized action list from 9 data sources. Productivity score 0-100.' },
	{ name: 'CRM Intelligence', desc: 'Four analysis modes enriched with brand context and goals from every level.' },
	{ name: 'Marketing Intelligence', desc: 'Multi-channel campaign plans aware of brand voice, audience, and history.' },
	{ name: 'Content Wizards', desc: 'Email and social generators that pull platform context so every draft sounds like the business.' },
];

const segments = [
	{ name: 'Creative agencies', size: '2-15 people' },
	{ name: 'Marketing & PR firms', size: '3-25 people' },
	{ name: 'Consulting & advisory', size: '2-20 people' },
	{ name: 'Dev & tech shops', size: '3-20 people' },
	{ name: 'Professional services', size: '2-15 people' },
	{ name: 'Growing SMBs', size: '5-50 people' },
];

const plans = [
	{
		name: 'Solo', price: '49', featured: false,
		desc: 'For the one-person shop doing serious work.',
		features: ['1 seat', '100K AI tokens/mo', '25 scans/mo', '5 client portal seats', 'All features included'],
	},
	{
		name: 'Studio', price: '149', featured: true,
		desc: 'For the team that means business.',
		features: ['8 seats', '400K AI tokens/mo', '150 scans/mo', '15 client portal seats', '$1,241/yr annual'],
	},
	{
		name: 'Agency', price: '299', featured: false,
		desc: 'For the business that has grown into something real.',
		features: ['15 seats', '1M AI tokens/mo', '500 scans/mo', 'Unlimited client seats', '$2,491/yr annual'],
	},
];

const addons = [
	{ name: 'Extra Seats (5-pack)', price: '$15/mo' },
	{ name: 'Communications (phone/SMS/video)', price: '$49/mo' },
	{ name: 'Client Pack Starter (5 seats + 50K tokens)', price: '$29/mo' },
	{ name: 'Client Pack Pro (10 seats + 150K tokens)', price: '$59/mo' },
	{ name: 'Client Pack Unlimited', price: '$129/mo' },
	{ name: 'Companion White-Label', price: '$19/mo' },
	{ name: 'Token Refills (100K / 500K / 1.5M)', price: '$9 / $39 / $99' },
	{ name: 'Scan Credits (100 / 500)', price: '$12 / $49' },
];

const dimensions = [
	{ name: 'Delivery', weight: 30, color: '#b85c2c', desc: 'Tickets closed, projects on time' },
	{ name: 'Communication', weight: 20, color: '#d4915c', desc: 'Messages, comments, portal activity' },
	{ name: 'Finance', weight: 20, color: '#8c7b6b', desc: 'Invoices sent, payments on time' },
	{ name: 'Growth', weight: 15, color: '#5a7a5a', desc: 'Scans, contacts, deals won' },
	{ name: 'Consistency', weight: 15, color: '#4a6a8a', desc: 'Daily login streak, task completion' },
];

// ── Calculator state ──

const soloCustomers = ref(50);
const studioCustomers = ref(60);
const agencyCustomers = ref(20);
const addonAvg = ref(22);
const tokenRefillAvg = ref(8);
const cardDeskStandalone = ref(100);
const growthRate = ref(8); // monthly growth %

const calcControls = computed(() => [
	{ key: 'solo', label: 'Solo customers', min: 0, max: 200, step: 5, modelValue: soloCustomers.value, update: (e: Event) => { soloCustomers.value = Number((e.target as HTMLInputElement).value); } },
	{ key: 'studio', label: 'Studio customers', min: 0, max: 200, step: 5, modelValue: studioCustomers.value, update: (e: Event) => { studioCustomers.value = Number((e.target as HTMLInputElement).value); } },
	{ key: 'agency', label: 'Agency customers', min: 0, max: 100, step: 5, modelValue: agencyCustomers.value, update: (e: Event) => { agencyCustomers.value = Number((e.target as HTMLInputElement).value); } },
	{ key: 'addon', label: 'Avg add-on $/customer', min: 0, max: 80, step: 1, modelValue: addonAvg.value, update: (e: Event) => { addonAvg.value = Number((e.target as HTMLInputElement).value); } },
	{ key: 'growth', label: 'Monthly growth %', min: 0, max: 20, step: 1, modelValue: growthRate.value, update: (e: Event) => { growthRate.value = Number((e.target as HTMLInputElement).value); } },
]);

const totalCustomers = computed(() => soloCustomers.value + studioCustomers.value + agencyCustomers.value + cardDeskStandalone.value);

const breakdownRows = computed(() => [
	{ label: 'Solo ($49/mo)', customers: soloCustomers.value, arpu: '49', monthly: soloCustomers.value * 49, annual: soloCustomers.value * 49 * 12 },
	{ label: 'Studio ($149/mo)', customers: studioCustomers.value, arpu: '149', monthly: studioCustomers.value * 149, annual: studioCustomers.value * 149 * 12 },
	{ label: 'Agency ($299/mo)', customers: agencyCustomers.value, arpu: '299', monthly: agencyCustomers.value * 299, annual: agencyCustomers.value * 299 * 12 },
	{ label: 'Add-ons avg', customers: soloCustomers.value + studioCustomers.value + agencyCustomers.value, arpu: String(addonAvg.value), monthly: (soloCustomers.value + studioCustomers.value + agencyCustomers.value) * addonAvg.value, annual: (soloCustomers.value + studioCustomers.value + agencyCustomers.value) * addonAvg.value * 12 },
	{ label: 'Token refills avg', customers: soloCustomers.value + studioCustomers.value + agencyCustomers.value, arpu: String(tokenRefillAvg.value), monthly: (soloCustomers.value + studioCustomers.value + agencyCustomers.value) * tokenRefillAvg.value, annual: (soloCustomers.value + studioCustomers.value + agencyCustomers.value) * tokenRefillAvg.value * 12 },
	{ label: 'CardDesk standalone', customers: cardDeskStandalone.value, arpu: '15', monthly: cardDeskStandalone.value * 15, annual: cardDeskStandalone.value * 15 * 12 },
]);

const monthlyRevenue = computed(() => breakdownRows.value.reduce((s, r) => s + r.monthly, 0));
const annualRevenue = computed(() => monthlyRevenue.value * 12);
const arpa = computed(() => totalCustomers.value > 0 ? monthlyRevenue.value / totalCustomers.value : 0);

// ── Chart ──

const chartConfig: ChartConfig = {
	mrr: { label: 'MRR', color: 'hsl(217, 91%, 60%)' },
	arr: { label: 'ARR', color: 'hsl(142, 71%, 45%)' },
};

const crosshairTemplate = (d: any) => {
	if (!d || !d[0]) return '';
	const point = d[0];
	const month = point.month ?? '';
	const mrr = point.mrr ?? 0;
	const arr = point.arr ?? 0;
	return `<div style="background:hsl(var(--background));border:1px solid hsl(var(--border)/0.5);border-radius:8px;padding:8px 12px;font-size:12px;box-shadow:0 4px 12px rgba(0,0,0,0.1);min-width:140px">
		<div style="font-weight:600;margin-bottom:6px">Month ${month}</div>
		<div style="display:flex;align-items:center;gap:6px;margin-bottom:3px">
			<span style="width:8px;height:8px;border-radius:2px;background:hsl(217,91%,60%)"></span>
			<span style="color:hsl(var(--muted-foreground))">MRR</span>
			<span style="margin-left:auto;font-weight:600;font-variant-numeric:tabular-nums">$${formatK(mrr)}</span>
		</div>
		<div style="display:flex;align-items:center;gap:6px">
			<span style="width:8px;height:8px;border-radius:2px;background:hsl(142,71%,45%)"></span>
			<span style="color:hsl(var(--muted-foreground))">ARR</span>
			<span style="margin-left:auto;font-weight:600;font-variant-numeric:tabular-nums">$${formatK(arr)}</span>
		</div>
	</div>`;
};

type ProjectionPoint = { month: number; mrr: number; arr: number };

const projectionData = computed<ProjectionPoint[]>(() => {
	const points: ProjectionPoint[] = [];
	const baseMrr = monthlyRevenue.value;
	const rate = 1 + (growthRate.value / 100);

	for (let m = 1; m <= 24; m++) {
		const mrr = Math.round(baseMrr * Math.pow(rate, m - 1));
		points.push({ month: m, mrr, arr: mrr * 12 });
	}
	return points;
});

// ── Formatting ──

function formatK(v: number): string {
	if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + 'M';
	if (v >= 1_000) return (v / 1_000).toFixed(0) + 'K';
	return v.toLocaleString();
}

// ── GSAP animations ──

let ctx: any = null;
let cycleTimer: ReturnType<typeof setInterval> | null = null;

onMounted(() => {
	ctx = gsap.context(() => {
		const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
		tl.fromTo('.pitch-kicker', { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.8 })
			.fromTo('.pitch-wordmark', { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 1.2, ease: 'power4.out' }, '-=0.5')
			.fromTo('.pitch-tagline', { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.8 }, '-=0.5')
			.fromTo('.pitch-sub', { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.8 }, '-=0.5');

		// Word cycler
		if (pitchCycleRef.value) {
			let idx = 0;
			cycleTimer = setInterval(() => {
				idx = (idx + 1) % cycleWords.length;
				gsap.to(pitchCycleRef.value, {
					opacity: 0, y: -12, duration: 0.3,
					onComplete: () => {
						if (pitchCycleRef.value) {
							pitchCycleRef.value.textContent = cycleWords[idx];
							gsap.fromTo(pitchCycleRef.value, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.3 });
						}
					},
				});
			}, 2400);
		}

		// Section reveals — include dark sections too
		const sections = document.querySelectorAll('.pitch-section, .pitch-section-dark, .pitch-footer');
		sections.forEach((section) => {
			const els = section.querySelectorAll('.section-label, .section-label-light, .section-title, .section-title-light, .section-text, .section-text-light, .stat, .stat-light, .ai-mode, .market-item, .plan, .addon-title, .addon-item, .calc-row, .calc-card, .calc-chart, .breakdown-table, .chart-legend, .score-dim, .footer-brand, .footer-tagline, .footer-url, .footer-divider, .footer-parent');
			els.forEach((el, i) => {
				gsap.fromTo(el, { opacity: 0, y: 20 }, {
					opacity: 1, y: 0, duration: 0.6, ease: 'power3.out',
					scrollTrigger: { trigger: el, start: 'top 95%', toggleActions: 'play none none none' },
					delay: i * 0.03,
				});
			});
		});
	});
});

onUnmounted(() => {
	if (cycleTimer) clearInterval(cycleTimer);
	if (ctx) ctx.revert();
});

useHead({
	title: 'Earnest — Investor Overview',
	meta: [{ name: 'description', content: 'Earnest: AI-powered business operating system for small teams. Investor pitch with revenue projections and interactive forecast calculator.' }],
});
</script>

<style scoped>
/* ─── Brand Tokens (match SellSheet) ─── */
.pitch {
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
	margin-top: -5rem;
}
.bp { color: var(--accent); font-size: 1.3em; line-height: 0; margin-left: -0.15em; }
.accent { color: var(--accent); }

/* ─── HERO ─── */
.pitch-hero {
	min-height: 70vh;
	display: flex; flex-direction: column; align-items: center; justify-content: center;
	text-align: center; padding: 140px 24px 80px;
}
.pitch-kicker {
	font-style: italic; font-size: 15px; color: var(--muted);
	letter-spacing: 0.08em; margin-bottom: 48px;
}
.pitch-wordmark {
	font-family: var(--font-bauer-bodoni);
	font-size: clamp(56px, 15vw, 160px); font-weight: 600;
	letter-spacing: -0.02em; line-height: 0.9;
}
.pitch-tagline {
	font-family: var(--font-bauer-bodoni);
	font-size: clamp(28px, 5vw, 52px); font-weight: 300; font-style: italic;
	color: var(--ink-2); margin-top: 24px; letter-spacing: 0.01em;
}
.pitch-sub {
	font-family: var(--font-proxima-light);
	font-size: 16px; color: var(--muted); letter-spacing: 0.04em; margin-top: 16px;
}

/* ─── WORD CYCLER ─── */
.pitch-cycle-wrap {
	display: inline-block; position: relative;
	text-align: center; vertical-align: bottom;
}
.pitch-cycle {
	display: inline-block; color: var(--accent); vertical-align: bottom;
}

/* ─── MARQUEE ─── */
.marquee-wrap {
	overflow: hidden; border-top: 1px solid var(--rule); border-bottom: 1px solid var(--rule);
	padding: 14px 0; background: var(--paper-2);
}
.marquee-track {
	display: flex; gap: 0; white-space: nowrap; width: max-content;
	animation: marquee-scroll 40s linear infinite;
}
.marquee-item {
	font-size: 13px; letter-spacing: 0.06em; color: var(--muted);
	font-family: var(--font-proxima-light);
}
.marquee-dot { margin: 0 16px; color: var(--accent); }
@keyframes marquee-scroll { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }

/* ─── SECTIONS ─── */
.pitch-section {
	padding: 100px 48px; max-width: 920px; margin: 0 auto;
	display: grid; grid-template-columns: 160px 1fr; gap: 60px; align-items: start;
}
.pitch-section-dark {
	background: var(--ink); padding: 100px 48px;
}
.pitch-section-dark-inner {
	max-width: 920px; margin: 0 auto;
	display: grid; grid-template-columns: 160px 1fr; gap: 60px; align-items: start;
}
@media (max-width: 700px) {
	.pitch-section { grid-template-columns: 1fr; gap: 24px; padding: 60px 24px; }
	.pitch-section-dark { padding: 60px 24px; }
	.pitch-section-dark-inner { grid-template-columns: 1fr; gap: 24px; }
}

.section-label {
	font-style: italic; font-size: 13px; color: var(--accent);
	letter-spacing: 0.08em; padding-top: 6px; position: sticky; top: 100px;
}
.section-label-light {
	font-style: italic; font-size: 13px; color: var(--accent);
	letter-spacing: 0.08em; padding-top: 6px; position: sticky; top: 100px;
	max-width: 920px; margin: 0 auto;
}
@media (max-width: 700px) { .section-label, .section-label-light { position: static; } }

.section-title {
	font-family: var(--font-bauer-bodoni);
	font-size: clamp(24px, 4vw, 36px); font-weight: 500; line-height: 1.2;
	margin-bottom: 20px;
}
.section-title-light {
	font-family: var(--font-bauer-bodoni);
	font-size: clamp(24px, 4vw, 36px); font-weight: 500; line-height: 1.2;
	margin-bottom: 20px; color: var(--paper);
}
.section-text { font-size: 15px; line-height: 1.8; color: var(--ink-2); margin-bottom: 40px; }
.section-text-light { font-size: 15px; line-height: 1.8; color: rgba(246,241,231,0.65); margin-bottom: 40px; }

/* ─── STATS ─── */
.stat-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1px; background: var(--rule); border: 1px solid var(--rule); }
.stat { background: var(--paper); padding: 28px 20px; text-align: center; }
.stat-light { background: var(--ink-2); }
.stat-number { font-family: var(--font-bauer-bodoni); font-size: 36px; font-weight: 600; line-height: 1; }
.stat-light .stat-number { color: var(--paper); }
.stat-label { font-size: 12px; color: var(--muted); margin-top: 8px; letter-spacing: 0.04em; }
.stat-light .stat-label { color: rgba(246,241,231,0.5); }
@media (max-width: 500px) { .stat-row { grid-template-columns: 1fr; } }

/* ─── AI MODES ─── */
.ai-modes { display: grid; grid-template-columns: repeat(2, 1fr); gap: 1px; background: rgba(246,241,231,0.1); }
.ai-mode { padding: 24px; background: var(--ink); }
.ai-mode-name { font-family: var(--font-bauer-bodoni); font-size: 16px; font-weight: 600; color: var(--paper); margin-bottom: 6px; }
.ai-mode-desc { font-size: 13px; color: rgba(246,241,231,0.55); line-height: 1.6; }
@media (max-width: 500px) { .ai-modes { grid-template-columns: 1fr; } }

/* ─── MARKET ─── */
.market-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1px; background: var(--rule); border: 1px solid var(--rule); }
.market-item { background: var(--paper); padding: 20px; transition: background 0.2s; }
.market-item:hover { background: var(--paper-2); }
.market-name { font-family: var(--font-bauer-bodoni); font-size: 14px; font-weight: 600; }
.market-size { font-size: 12px; color: var(--muted); margin-top: 4px; }
@media (max-width: 500px) { .market-grid { grid-template-columns: 1fr 1fr; } }

/* ─── PLANS (reuse SellSheet styles) ─── */
.plans-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1px; background: var(--rule); border: 1px solid var(--rule); margin-bottom: 48px; }
@media (max-width: 600px) { .plans-grid { grid-template-columns: 1fr; } }
.plan { background: var(--paper); padding: 32px 24px; transition: background 0.2s; }
.plan:hover { background: var(--paper-2); }
.plan-featured { background: var(--ink) !important; color: var(--paper); }
.plan-name { font-family: var(--font-bauer-bodoni); font-size: 20px; font-weight: 600; }
.plan-featured .plan-name { color: var(--paper); }
.plan-price { font-family: var(--font-bauer-bodoni); font-size: 44px; font-weight: 600; line-height: 1; margin-top: 16px; }
.plan-featured .plan-price { color: var(--paper); }
.plan-price sup { font-size: 18px; vertical-align: super; font-weight: 400; }
.plan-price span { font-family: var(--font-proxima-light); font-size: 13px; color: var(--muted); }
.plan-featured .plan-price span { color: rgba(246,241,231,0.5); }
.plan-desc { font-style: italic; font-size: 12px; color: var(--muted); margin: 8px 0 20px; padding-bottom: 20px; border-bottom: 1px solid var(--rule); }
.plan-featured .plan-desc { color: rgba(246,241,231,0.4); border-color: rgba(246,241,231,0.1); }
.plan-features { list-style: none; display: flex; flex-direction: column; gap: 10px; padding: 0; margin: 0; }
.plan-features li { font-size: 12px; color: var(--ink-2); display: flex; align-items: flex-start; gap: 8px; line-height: 1.4; }
.plan-featured .plan-features li { color: rgba(246,241,231,0.75); }
.plan-features li::before { content: '\2014'; color: var(--accent); flex-shrink: 0; font-family: var(--font-bauer-bodoni); }

/* ─── ADD-ONS ─── */
.addon-title { font-family: var(--font-bauer-bodoni); font-size: clamp(20px, 3vw, 28px); font-weight: 500; margin-bottom: 24px; }
.addon-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 1px; background: var(--rule); border: 1px solid var(--rule); }
.addon-item { background: var(--paper); padding: 16px 20px; display: flex; justify-content: space-between; align-items: center; transition: background 0.2s; }
.addon-item:hover { background: var(--paper-2); }
.addon-name { font-size: 13px; color: var(--ink-2); }
.addon-price { font-family: var(--font-bauer-bodoni); font-size: 14px; font-weight: 600; color: var(--ink); white-space: nowrap; }
@media (max-width: 600px) { .addon-grid { grid-template-columns: 1fr; } }

/* ─── CALCULATOR ─── */
.calc-controls { display: flex; flex-direction: column; gap: 20px; margin-bottom: 40px; }
.calc-row { display: flex; flex-direction: column; gap: 6px; }
.calc-label { display: flex; justify-content: space-between; font-size: 13px; color: var(--ink-2); }
.calc-value { font-family: var(--font-bauer-bodoni); font-weight: 600; color: var(--accent); }
.calc-slider {
	-webkit-appearance: none; width: 100%; height: 4px;
	background: var(--rule); border-radius: 2px; outline: none;
}
.calc-slider::-webkit-slider-thumb {
	-webkit-appearance: none; width: 18px; height: 18px;
	background: var(--ink); border-radius: 50%; cursor: pointer;
	transition: background 0.15s;
}
.calc-slider::-webkit-slider-thumb:hover { background: var(--accent); }

.calc-summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1px; background: var(--rule); border: 1px solid var(--rule); margin-bottom: 40px; }
.calc-card { background: var(--paper); padding: 24px 20px; text-align: center; }
.calc-card-accent { background: var(--ink); }
.calc-card-label { font-size: 11px; color: var(--muted); letter-spacing: 0.06em; text-transform: uppercase; margin-bottom: 8px; }
.calc-card-accent .calc-card-label { color: rgba(246,241,231,0.5); }
.calc-card-value { font-family: var(--font-bauer-bodoni); font-size: 32px; font-weight: 600; }
.calc-card-accent .calc-card-value { color: var(--paper); }
@media (max-width: 500px) { .calc-summary { grid-template-columns: 1fr; } }

.calc-chart { height: 320px; margin-bottom: 16px; }
.chart-legend { display: flex; gap: 20px; font-size: 12px; color: var(--muted); margin-bottom: 40px; }
.legend-item { display: flex; align-items: center; gap: 6px; }
.legend-dot { width: 10px; height: 3px; border-radius: 2px; }

/* ─── BREAKDOWN TABLE ─── */
.breakdown-table { border: 1px solid var(--rule); }
.bt-header, .bt-row, .bt-total { display: grid; grid-template-columns: 2fr 1fr 1fr 1fr 1fr; padding: 12px 16px; font-size: 12px; }
.bt-header { background: var(--ink); color: var(--paper); font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; font-size: 10px; }
.bt-row { border-bottom: 1px solid var(--rule); color: var(--ink-2); }
.bt-row:hover { background: var(--paper-2); }
.bt-total { background: var(--paper-2); font-family: var(--font-bauer-bodoni); font-weight: 600; font-size: 13px; }
@media (max-width: 600px) {
	.bt-header, .bt-row, .bt-total { grid-template-columns: 2fr 1fr 1fr; }
	.bt-header span:nth-child(3), .bt-row span:nth-child(3), .bt-total span:nth-child(3),
	.bt-header span:nth-child(4), .bt-row span:nth-child(4), .bt-total span:nth-child(4) { display: none; }
}

/* ─── SCORE ─── */
.score-dims { display: flex; flex-direction: column; gap: 16px; }
.score-dim { position: relative; }
.dim-bar { height: 4px; border-radius: 2px; margin-bottom: 8px; transition: width 0.6s ease; }
.dim-info { display: flex; justify-content: space-between; align-items: baseline; }
.dim-name { font-family: var(--font-bauer-bodoni); font-size: 15px; font-weight: 600; }
.dim-weight { font-size: 13px; color: var(--muted); }
.dim-desc { font-size: 12px; color: var(--muted); margin-top: 2px; }

/* ─── FOOTER ─── */
.pitch-footer {
	padding: 120px 48px; text-align: center; background: var(--ink);
}
.footer-brand {
	font-family: var(--font-bauer-bodoni); font-size: 14px; font-weight: 600;
	letter-spacing: 0.2em; color: rgba(246,241,231,0.3);
}
.footer-tagline {
	font-family: var(--font-bauer-bodoni); font-size: clamp(28px, 5vw, 48px);
	font-weight: 300; font-style: italic; color: var(--paper); margin-top: 16px;
}
.footer-url {
	font-size: 14px; color: var(--accent); letter-spacing: 0.06em; margin-top: 24px;
}
.footer-divider {
	width: 48px; height: 1px; background: rgba(246,241,231,0.15); margin: 40px auto;
}
.footer-parent {
	font-family: var(--font-proxima); font-size: 13px; font-weight: 600;
	letter-spacing: 0.15em; color: rgba(246,241,231,0.4);
}
.footer-parent-tagline {
	font-weight: 300; font-style: italic; letter-spacing: 0.02em;
}
</style>
