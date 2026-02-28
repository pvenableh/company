<template>
	<div class="sell-sheet t-bg min-h-screen">
		<!-- Floating Navigation -->
		<nav
			class="floating-nav fixed top-0 left-0 right-0 z-50 px-6 py-4 transition-all duration-500"
			:class="[
				showNav ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0',
				scrolledPastHero ? 'bg-white/90 dark:bg-gray-900/90 backdrop-blur-md shadow-sm' : '',
			]"
		>
			<div class="max-w-6xl mx-auto flex items-center justify-between">
				<NuxtLink to="/" class="t-heading text-xl font-light t-text hover:t-text-accent transition-colors">
					Hue Studios
				</NuxtLink>
				<div class="flex items-center gap-6">
					<button
						@click="scrollToSection('plans')"
						class="text-sm t-text-secondary hover:t-text transition-colors hidden sm:block"
					>
						Pricing
					</button>
					<NuxtLink
						to="/auth/signin"
						class="group flex items-center gap-2 px-4 py-2 rounded-full border t-border hover:t-border-accent transition-all duration-300"
					>
						<span class="text-sm t-text-secondary group-hover:t-text-accent transition-colors">Sign In</span>
						<Icon
							name="i-heroicons-arrow-right"
							class="w-4 h-4 t-text-tertiary group-hover:t-text-accent group-hover:translate-x-1 transition-all duration-300"
						/>
					</NuxtLink>
				</div>
			</div>
		</nav>

		<!-- Hero Section -->
		<section ref="heroRef" class="hero min-h-screen flex flex-col justify-center items-center relative px-6">
			<!-- Hero Background -->
			<div class="fixed inset-0 z-0 hero-bg-container">
				<div
					class="hero-image w-full h-full flex items-center justify-center opacity-0 bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900"
				>
					<div class="absolute inset-0 overflow-hidden">
						<div
							class="absolute -top-1/2 -left-1/4 w-[80vw] h-[80vw] rounded-full bg-primary/5 blur-3xl"
						></div>
						<div
							class="absolute -bottom-1/4 -right-1/4 w-[60vw] h-[60vw] rounded-full bg-primary/8 blur-3xl"
						></div>
					</div>
				</div>
				<div class="absolute inset-0 bg-gradient-to-b from-black/50 to-black/30"></div>
			</div>

			<div class="hero-content text-center relative z-10 lg:-mt-32">
				<p
					class="-mt-44 lg:mt-0 hero-address text-xs tracking-[0.3em] lg:tracking-[0.6em] uppercase mb-6 lg:mb-12 opacity-0 text-cream-alt"
				>
					Agency-Grade Business Management
				</p>
				<h1
					class="hero-title t-heading text-[clamp(2.5rem,10vw,6rem)] font-light tracking-tight leading-[0.9] mb-8 opacity-0 text-cream"
				>
					Hue Studios
				</h1>
				<div class="hero-divider w-16 h-px bg-gold mx-auto mb-4 lg:mb-8 opacity-0 scale-x-0"></div>
				<p
					class="hero-tagline t-heading text-[clamp(1.125rem,2.5vw,2rem)] italic font-light text-cream-alt opacity-0"
				>
					Run Your Business Like a Creative Agency
				</p>
			</div>
			<div
				class="absolute bottom-16 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 opacity-0 scroll-indicator z-10"
			>
				<span class="text-[0.625rem] tracking-[0.2em] uppercase t-text-tertiary">Scroll to discover</span>
				<div class="w-px h-10 bg-gradient-to-b from-gold to-transparent scroll-line"></div>
			</div>
		</section>

		<!-- Intro Section -->
		<section ref="introRef" class="section py-24 lg:py-32 px-6 lg:px-16 t-section-alt">
			<div class="max-w-6xl mx-auto text-left">
				<h2
					class="intro-title t-heading text-[clamp(2rem,5vw,3rem)] font-normal tracking-tight leading-tight mb-8 opacity-0"
				>
					One Platform. Every Department.
				</h2>
				<p
					class="intro-text t-body text-[clamp(1.0625rem,3vw,1.35rem)] leading-relaxed font-light t-text t-text-secondary mb-16 opacity-0"
				>
					Hue Studios is an all-in-one business management platform built for creative agencies, consultancies,
					and small-to-medium businesses. From project timelines and Kanban boards to invoicing, scheduling,
					team channels, and social media management &mdash; everything your team needs in one beautifully
					designed workspace.
				</p>

				<!-- Intro Stats -->
				<div class="grid grid-cols-2 md:grid-cols-4 gap-6 intro-images">
					<div
						v-for="(stat, index) in introStats"
						:key="index"
						class="text-center p-6 t-bg-subtle opacity-0 intro-image"
					>
						<div class="t-heading text-3xl font-light t-text-accent mb-2">{{ stat.value }}</div>
						<p class="text-xs tracking-[0.15em] uppercase t-text-tertiary">{{ stat.label }}</p>
					</div>
				</div>
			</div>
		</section>

		<!-- The Problem Section -->
		<section ref="problemRef" class="section py-24 lg:py-32 px-6 lg:px-16 t-bg">
			<div class="max-w-6xl mx-auto">
				<div class="grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-8 lg:gap-16">
					<div class="content-label flex flex-col gap-2 opacity-0">
						<span class="t-heading text-sm lg:text-[26px] lg:leading-6 t-text-accent">01</span>
						<span class="text-xs lg:text-sm lg:leading-3 tracking-wider uppercase t-text-tertiary"
							>The Problem</span
						>
					</div>
					<div class="content-main min-w-0 overflow-hidden">
						<div class="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-8 lg:gap-12">
							<div class="max-w-xl">
								<h2
									class="section-title t-heading text-[clamp(2rem,5vw,3rem)] font-normal tracking-tight leading-tight mb-8 opacity-0"
								>
									Too Many Tools. Too Little Cohesion.
								</h2>
								<p
									class="section-body text-[1.0625rem] leading-relaxed t-text-secondary mb-8 opacity-0"
								>
									Small businesses juggle a dozen subscriptions &mdash; one for project management,
									another for invoicing, a third for scheduling, a fourth for team chat. The result?
									Fragmented workflows, missed handoffs, and a monthly SaaS bill that keeps climbing.
								</p>
								<p
									class="section-tagline t-heading text-lg italic t-text-accent-tertiary pt-8 border-t t-border-divider opacity-0"
								>
									Your business deserves more than duct-taped software.
								</p>
							</div>
							<div class="aspect-[3/4] t-bg-subtle flex items-center justify-center opacity-0 section-image">
								<div class="text-center p-6">
									<div class="grid grid-cols-3 gap-3 mb-6 max-w-[200px] mx-auto">
										<div
											v-for="n in 9"
											:key="n"
											class="aspect-square rounded-lg border-2 t-border flex items-center justify-center"
										>
											<Icon
												:name="toolIcons[n - 1]"
												class="w-5 h-5 t-text-muted"
											/>
										</div>
									</div>
									<p class="text-sm t-text-tertiary font-medium">9 TOOLS</p>
									<p class="text-xs t-text-muted mt-1">Replaced by one platform</p>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</section>

		<!-- The Solution Section -->
		<section ref="solutionRef" class="section py-24 lg:py-32 px-6 lg:px-16 t-bg-alt">
			<div class="max-w-6xl mx-auto">
				<div class="grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-8 lg:gap-16">
					<div class="content-label flex flex-col gap-2 opacity-0">
						<span class="t-heading text-sm lg:text-[26px] lg:leading-6 t-text-accent">02</span>
						<span class="text-xs lg:text-sm lg:leading-3 tracking-wider uppercase t-text-tertiary"
							>The Solution</span
						>
					</div>
					<div class="content-main max-w-4xl min-w-0 overflow-hidden">
						<h2
							class="section-title t-heading text-[clamp(2rem,5vw,3rem)] font-normal tracking-tight leading-tight mb-8 opacity-0"
						>
							Built by Creatives. Engineered for Business.
						</h2>
						<p
							class="section-body text-[1.0625rem] leading-relaxed t-text-secondary mb-8 opacity-0"
						>
							Hue Studios was born inside a creative agency with 18+ years of brand and communications
							experience. We built the tool we wished existed &mdash; one that combines project delivery,
							client management, financials, and team collaboration under a single, beautifully crafted
							interface.
						</p>

						<div class="advantages-grid grid grid-cols-1 sm:grid-cols-2 gap-6 my-8">
							<div
								v-for="(advantage, index) in advantages"
								:key="index"
								class="advantage-item flex gap-4 items-start opacity-0"
							>
								<div class="advantage-icon w-6 h-6 flex-shrink-0 t-text-accent-tertiary">
									<Icon :name="advantage.icon" class="w-6 h-6" />
								</div>
								<div>
									<p class="text-sm font-medium t-text mb-1">{{ advantage.title }}</p>
									<p class="text-[0.875rem] leading-relaxed t-text-secondary">
										{{ advantage.text }}
									</p>
								</div>
							</div>
						</div>

						<p
							class="section-tagline t-heading text-lg italic t-text-accent-tertiary pt-8 border-t t-border-divider opacity-0"
						>
							Design-forward. Precision-engineered. Refreshingly simple.
						</p>
					</div>
				</div>
			</div>
		</section>

		<!-- Features Section -->
		<section ref="featuresRef" class="section py-24 lg:py-32 px-6 lg:px-16 t-bg">
			<div class="max-w-6xl mx-auto">
				<div class="grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-8 lg:gap-16">
					<div class="content-label flex flex-col gap-2 opacity-0">
						<span class="t-heading text-sm lg:text-[26px] lg:leading-6 t-text-accent">03</span>
						<span class="text-xs lg:text-sm lg:leading-3 tracking-wider uppercase t-text-tertiary"
							>Features</span
						>
					</div>
					<div class="content-main max-w-4xl min-w-0 overflow-hidden">
						<h2
							class="section-title t-heading text-[clamp(2rem,5vw,3rem)] font-normal tracking-tight leading-tight mb-8 opacity-0"
						>
							Everything Your Team Needs
						</h2>

						<!-- Feature Highlight Grid -->
						<div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
							<div
								class="aspect-[4/5] t-bg-subtle flex items-center justify-center opacity-0 section-image"
							>
								<div class="text-center p-4">
									<Icon
										name="i-heroicons-view-columns"
										class="w-8 h-8 t-text-muted mx-auto mb-2"
									/>
									<p class="text-xs t-text-tertiary font-medium mb-1">KANBAN BOARDS</p>
									<p class="text-[10px] t-text-muted">
										Drag-and-drop task management with custom statuses and filters.
									</p>
								</div>
							</div>
							<div
								class="aspect-[10/6.1] t-bg-subtle flex items-center justify-center opacity-0 section-image md:col-span-2"
							>
								<div class="text-center p-4">
									<Icon name="i-heroicons-map" class="w-8 h-8 t-text-muted mx-auto mb-2" />
									<p class="text-xs t-text-tertiary font-medium mb-1">PROJECT TIMELINE</p>
									<p class="text-[10px] t-text-muted">
										Visual timeline with milestones, task dependencies, and drag-to-reschedule.
									</p>
								</div>
							</div>
						</div>

						<div class="feature-grid grid grid-cols-1 sm:grid-cols-2 gap-6 my-8">
							<div
								v-for="(feature, index) in features"
								:key="index"
								:class="[
									'feature-item flex gap-4 items-start opacity-0',
									feature.wide ? 'sm:col-span-2' : '',
								]"
							>
								<div class="feature-icon w-6 h-6 flex-shrink-0 t-text-accent-tertiary">
									<Icon :name="feature.icon" class="w-6 h-6" />
								</div>
								<div>
									<p class="text-sm font-medium t-text mb-1">{{ feature.title }}</p>
									<p class="text-[0.875rem] leading-relaxed t-text-secondary">
										{{ feature.text }}
									</p>
								</div>
							</div>
						</div>

						<p
							class="section-tagline t-heading text-lg italic t-text-accent-tertiary pt-8 border-t t-border-divider opacity-0"
						>
							Modern tech stack. Beautiful by default.
						</p>
					</div>
				</div>
			</div>
		</section>

		<!-- Social Media Module Section -->
		<section ref="socialRef" class="section py-24 lg:py-32 px-6 lg:px-16 t-bg-alt">
			<div class="max-w-6xl mx-auto">
				<div class="grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-8 lg:gap-16">
					<div class="content-label flex flex-col gap-2 opacity-0">
						<span class="t-heading text-sm lg:text-[26px] lg:leading-6 t-text-accent">04</span>
						<span class="text-xs lg:text-sm lg:leading-3 tracking-wider uppercase t-text-tertiary"
							>Social Media</span
						>
					</div>
					<div class="content-main max-w-4xl min-w-0 overflow-hidden">
						<h2
							class="section-title t-heading text-[clamp(2rem,5vw,3rem)] font-normal tracking-tight leading-tight mb-8 opacity-0"
						>
							Publish. Schedule. Analyze.
						</h2>
						<p class="section-body text-[1.0625rem] leading-relaxed t-text-secondary mb-8 opacity-0">
							Manage your Instagram and TikTok presence directly from your business dashboard. Compose
							posts, schedule content on a visual calendar, track engagement analytics, and manage
							multiple client accounts &mdash; all without switching tools.
						</p>

						<div class="social-features grid grid-cols-1 sm:grid-cols-3 gap-6 my-8">
							<div
								v-for="(item, index) in socialFeatures"
								:key="index"
								class="social-feature-item p-6 t-bg-subtle opacity-0"
							>
								<div class="flex flex-col items-start gap-3">
									<Icon :name="item.icon" class="w-8 h-8 t-text-accent-tertiary" />
									<p class="text-sm font-medium t-text">{{ item.title }}</p>
									<p class="text-[0.875rem] leading-relaxed t-text-secondary">{{ item.text }}</p>
								</div>
							</div>
						</div>

						<p
							class="section-tagline t-heading text-lg italic t-text-accent-tertiary pt-8 border-t t-border-divider opacity-0"
						>
							Instagram. TikTok. One dashboard.
						</p>
					</div>
				</div>
			</div>
		</section>

		<!-- Tech Stack Section -->
		<section ref="techRef" class="section py-24 lg:py-32 px-6 lg:px-16 t-bg">
			<div class="max-w-6xl mx-auto">
				<div class="grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-8 lg:gap-16">
					<div class="content-label flex flex-col gap-2 opacity-0">
						<span class="t-heading text-sm lg:text-[26px] lg:leading-6 t-text-accent">05</span>
						<span class="text-xs lg:text-sm lg:leading-3 tracking-wider uppercase t-text-tertiary"
							>Under the Hood</span
						>
					</div>
					<div class="content-main max-w-4xl min-w-0 overflow-hidden">
						<h2
							class="section-title t-heading text-[clamp(2rem,5vw,3rem)] font-normal tracking-tight leading-tight mb-8 opacity-0"
						>
							Built on a Modern Stack
						</h2>
						<p class="section-body text-[1.0625rem] leading-relaxed t-text-secondary mb-8 opacity-0">
							Hue Studios is built with the same technologies trusted by engineering teams at scale. Fast,
							secure, and designed for real-time collaboration.
						</p>

						<div class="tech-grid grid grid-cols-2 sm:grid-cols-3 gap-4 my-8">
							<div
								v-for="(tech, index) in techStack"
								:key="index"
								class="tech-item flex items-center gap-3 p-4 t-bg-subtle opacity-0"
							>
								<Icon :name="tech.icon" class="w-5 h-5 t-text-accent-tertiary flex-shrink-0" />
								<div>
									<p class="text-sm font-medium t-text">{{ tech.name }}</p>
									<p class="text-[0.75rem] t-text-tertiary">{{ tech.role }}</p>
								</div>
							</div>
						</div>

						<p
							class="section-tagline t-heading text-lg italic t-text-accent-tertiary pt-8 border-t t-border-divider opacity-0"
						>
							Enterprise-grade infrastructure. Startup-speed iteration.
						</p>
					</div>
				</div>
			</div>
		</section>

		<!-- Target Audience Section -->
		<section ref="targetRef" class="section py-24 lg:py-32 px-6 lg:px-16 t-bg-alt">
			<div class="max-w-6xl mx-auto">
				<div class="grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-8 lg:gap-16">
					<div class="content-label flex flex-col gap-2 opacity-0">
						<span class="t-heading text-sm lg:text-[26px] lg:leading-6 t-text-accent">06</span>
						<span class="text-xs lg:text-sm lg:leading-3 tracking-wider uppercase t-text-tertiary"
							>For You</span
						>
					</div>
					<div class="content-main max-w-4xl min-w-0 overflow-hidden">
						<h2
							class="section-title t-heading text-[clamp(2rem,5vw,3rem)] font-normal tracking-tight leading-tight mb-8 opacity-0"
						>
							Is Hue Studios Right for You?
						</h2>

						<div class="target-list grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1 my-8">
							<div
								v-for="(target, index) in targetCustomers"
								:key="index"
								class="target-item flex items-center gap-4 py-3 opacity-0"
							>
								<span class="w-1.5 h-1.5 bg-gold rounded-full flex-shrink-0"></span>
								<span class="text-[0.9375rem] t-text-secondary">{{ target }}</span>
							</div>
						</div>

						<p
							class="section-tagline t-heading text-lg italic t-text-accent-tertiary pt-8 border-t t-border-divider opacity-0"
						>
							Built for teams that care about craft.
						</p>
					</div>
				</div>
			</div>
		</section>

		<!-- CTA Section -->
		<section
			ref="ctaRef"
			class="section relative py-32 lg:py-40 px-6 lg:px-16 bg-gray-900 text-cream overflow-hidden"
		>
			<!-- CTA Background -->
			<div class="absolute inset-0 z-0 overflow-hidden">
				<div class="w-full h-full bg-gray-900">
					<div
						class="absolute -top-1/3 -right-1/4 w-[60vw] h-[60vw] rounded-full bg-primary/5 blur-3xl"
					></div>
					<div
						class="absolute -bottom-1/3 -left-1/4 w-[50vw] h-[50vw] rounded-full bg-primary/8 blur-3xl"
					></div>
				</div>
			</div>

			<div class="max-w-3xl mx-auto text-center relative z-10">
				<h2
					class="cta-headline t-heading text-[clamp(2rem,5vw,3.5rem)] font-light leading-tight mb-8 opacity-0"
				>
					Ready to Simplify
					<br />
					Your Business Operations?
				</h2>
				<p class="cta-body text-[1.0625rem] leading-relaxed text-cream-alt mb-12 opacity-0">
					Join growing businesses that have consolidated their tools into one elegant platform. Less
					software. More focus. Better results.
				</p>
				<div class="cta-divider w-16 h-px bg-gold mx-auto mb-12 opacity-0 scale-x-0"></div>
				<div class="cta-buttons flex flex-col sm:flex-row gap-4 justify-center opacity-0">
					<NuxtLink
						to="/register"
						class="t-btn px-8 py-4 text-lg font-semibold transition shadow-lg inline-block text-center"
					>
						Get Started Free
					</NuxtLink>
					<NuxtLink
						to="/auth/signin"
						class="bg-white/10 backdrop-blur-sm border border-white/20 text-cream px-8 py-4 text-lg font-semibold hover:bg-white/20 transition shadow-lg inline-block text-center"
					>
						Sign In
					</NuxtLink>
				</div>
				<p class="cta-address text-sm tracking-wide text-cream-alt opacity-0 mt-12 uppercase">
					huestudios.company
				</p>
			</div>
		</section>
	</div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

// Register GSAP plugins
gsap.registerPlugin(ScrollTrigger);

// Section refs
const heroRef = ref(null);
const introRef = ref(null);
const problemRef = ref(null);
const solutionRef = ref(null);
const featuresRef = ref(null);
const socialRef = ref(null);
const techRef = ref(null);
const targetRef = ref(null);
const ctaRef = ref(null);

// Navigation scroll state
const showNav = ref(false);
const scrolledPastHero = ref(false);

const handleScroll = () => {
	const scrollY = window.scrollY;
	const heroHeight = heroRef.value?.offsetHeight || window.innerHeight;
	showNav.value = scrollY > 100;
	scrolledPastHero.value = scrollY > heroHeight * 0.8;
};

const scrollToSection = (id) => {
	if (import.meta.client) {
		const el = document.getElementById(id);
		el?.scrollIntoView({ behavior: 'smooth' });
	}
};

// Data
const introStats = [
	{ value: '7+', label: 'Modules' },
	{ value: '1', label: 'Platform' },
	{ value: '24/7', label: 'Access' },
	{ value: '0', label: 'Context Switching' },
];

const toolIcons = [
	'i-heroicons-rectangle-stack',
	'i-heroicons-document-text',
	'i-heroicons-calendar',
	'i-heroicons-chat-bubble-left-right',
	'i-heroicons-video-camera',
	'i-heroicons-banknotes',
	'i-heroicons-share',
	'i-heroicons-chart-bar',
	'i-heroicons-users',
];

const advantages = [
	{
		icon: 'i-heroicons-paint-brush',
		title: 'Design-First Philosophy',
		text: 'Every screen is crafted with the same care we bring to client work. No ugly dashboards.',
	},
	{
		icon: 'i-heroicons-puzzle-piece',
		title: 'Unified Workspace',
		text: 'Projects, invoices, scheduling, channels, and social media under one roof.',
	},
	{
		icon: 'i-heroicons-shield-check',
		title: 'Role-Based Access',
		text: 'Multi-team support with admin, manager, and member roles. Your data stays secure.',
	},
	{
		icon: 'i-heroicons-bolt',
		title: 'Real-Time Collaboration',
		text: 'WebSocket-powered live updates, presence indicators, and instant notifications.',
	},
	{
		icon: 'i-heroicons-cpu-chip',
		title: 'Modern Stack',
		text: 'Nuxt 3, Vue 3, Tailwind CSS v4, shadcn-vue, and Directus &mdash; fast and extensible.',
	},
	{
		icon: 'i-heroicons-device-phone-mobile',
		title: 'Mobile-Ready PWA',
		text: 'Install as a native-feeling app on any device. Works offline where it counts.',
	},
];

const features = [
	{
		icon: 'i-heroicons-queue-list',
		title: 'Ticket Management',
		text: 'Kanban board with custom statuses, service tagging, organization filtering, and detailed activity logs.',
	},
	{
		icon: 'i-heroicons-square-3-stack-3d',
		title: 'Project Management',
		text: 'Visual timelines, Kanban boards, sub-tasks, milestones, file attachments, and project conversations.',
	},
	{
		icon: 'i-heroicons-document-text',
		title: 'Invoicing & Payments',
		text: 'Create invoices, track payments via Stripe, generate PDFs, and manage payouts &mdash; all in one place.',
	},
	{
		icon: 'i-heroicons-calendar-date-range',
		title: 'Scheduling & Video Meetings',
		text: 'Public booking links, Google Calendar and Outlook sync, plus built-in Twilio video conferencing.',
	},
	{
		icon: 'i-heroicons-chat-bubble-left-right',
		title: 'Channels & Messaging',
		text: 'Slack-style channels per organization with threaded comments, reactions, and real-time updates.',
	},
	{
		icon: 'i-heroicons-building-office-2',
		title: 'Organizations & Teams',
		text: 'Multi-organization support with team structures, role-based permissions, and organization-level filtering.',
	},
	{
		icon: 'i-heroicons-envelope',
		title: 'Email Notifications',
		text: 'Transactional emails via SendGrid for invoices, appointment confirmations, and team invitations.',
		wide: true,
	},
	{
		icon: 'i-heroicons-clipboard-document-list',
		title: 'Task Management',
		text: 'Personal task lists tied to projects and organizations with progress tracking.',
		wide: true,
	},
];

const socialFeatures = [
	{
		icon: 'i-heroicons-pencil-square',
		title: 'Compose & Schedule',
		text: 'Write posts, attach media, and schedule publishing across Instagram and TikTok.',
	},
	{
		icon: 'i-heroicons-calendar',
		title: 'Content Calendar',
		text: 'Visual monthly calendar showing all scheduled and published content at a glance.',
	},
	{
		icon: 'i-heroicons-chart-bar',
		title: 'Analytics Dashboard',
		text: 'Track follower growth, engagement rates, and individual post performance metrics.',
	},
];

const techStack = [
	{ name: 'Nuxt 3', role: 'Framework', icon: 'i-heroicons-code-bracket' },
	{ name: 'Vue 3', role: 'UI Library', icon: 'i-heroicons-sparkles' },
	{ name: 'Tailwind v4', role: 'Styling', icon: 'i-heroicons-paint-brush' },
	{ name: 'Directus', role: 'Backend / CMS', icon: 'i-heroicons-server' },
	{ name: 'Stripe', role: 'Payments', icon: 'i-heroicons-credit-card' },
	{ name: 'Twilio', role: 'Video / SMS', icon: 'i-heroicons-video-camera' },
	{ name: 'SendGrid', role: 'Email', icon: 'i-heroicons-envelope' },
	{ name: 'AWS S3', role: 'Storage', icon: 'i-heroicons-cloud' },
	{ name: 'shadcn-vue', role: 'Components', icon: 'i-heroicons-cube' },
];

const targetCustomers = [
	'Creative agencies and design studios',
	'Consultancies and professional services firms',
	'Small teams that need project + client management',
	'Freelancers scaling into an agency model',
	'Businesses managing social media for clients',
	'Teams tired of juggling 5+ separate tools',
	'Organizations that value design and UX',
	'Anyone who believes business software can be beautiful',
];

// GSAP animations
let ctx;

onMounted(() => {
	window.addEventListener('scroll', handleScroll, { passive: true });
	handleScroll();

	ctx = gsap.context(() => {
		// Hero animations
		const heroTl = gsap.timeline({ delay: 0.3 });
		heroTl
			.to('.hero-image', { opacity: 1, duration: 1.2, ease: 'power2.out' })
			.to('.hero-address', { opacity: 1, y: 0, duration: 0.8, ease: 'power3.out' }, '-=0.6')
			.to('.hero-title', { opacity: 1, y: 0, duration: 1, ease: 'power3.out' }, '-=0.4')
			.to('.hero-divider', { opacity: 1, scaleX: 1, duration: 0.6, ease: 'power3.out' }, '-=0.4')
			.to('.hero-tagline', { opacity: 1, y: 0, duration: 0.8, ease: 'power3.out' }, '-=0.3')
			.to('.scroll-indicator', { opacity: 1, duration: 0.6, ease: 'power3.out' }, '-=0.2');

		// Scroll line animation
		gsap.to('.scroll-line', {
			scaleY: 0.7,
			opacity: 0.5,
			duration: 1.5,
			repeat: -1,
			yoyo: true,
			ease: 'power2.inOut',
		});

		// Hero content parallax
		gsap.to('.hero-content', {
			y: 350,
			ease: 'none',
			scrollTrigger: {
				trigger: heroRef.value,
				start: 'top top',
				end: 'bottom top',
				scrub: true,
			},
		});

		// Fade out scroll indicator
		gsap.fromTo(
			'.scroll-indicator',
			{ opacity: 1, y: 0 },
			{
				opacity: 0,
				y: 30,
				ease: 'none',
				scrollTrigger: {
					trigger: heroRef.value,
					start: 'top top',
					end: '20% top',
					scrub: true,
				},
			}
		);

		// Section animations helper
		const animateSection = (sectionRef, selectors) => {
			if (!sectionRef.value) return;
			selectors.forEach((selector) => {
				const elements = sectionRef.value.querySelectorAll(selector);
				elements.forEach((el, elIndex) => {
					gsap.fromTo(
						el,
						{ opacity: 0, y: 30 },
						{
							opacity: 1,
							y: 0,
							duration: 0.8,
							ease: 'power3.out',
							scrollTrigger: {
								trigger: el,
								start: 'top 85%',
								toggleActions: 'play none none none',
							},
							delay: elIndex * 0.1,
						}
					);
				});
			});
		};

		// Animate all sections
		animateSection(introRef, ['.intro-title', '.intro-text', '.intro-image']);
		animateSection(problemRef, [
			'.content-label',
			'.section-title',
			'.section-body',
			'.section-tagline',
			'.section-image',
		]);
		animateSection(solutionRef, [
			'.content-label',
			'.section-title',
			'.section-body',
			'.advantage-item',
			'.section-tagline',
		]);
		animateSection(featuresRef, [
			'.content-label',
			'.section-title',
			'.section-image',
			'.feature-item',
			'.section-tagline',
		]);
		animateSection(socialRef, [
			'.content-label',
			'.section-title',
			'.section-body',
			'.social-feature-item',
			'.section-tagline',
		]);
		animateSection(techRef, [
			'.content-label',
			'.section-title',
			'.section-body',
			'.tech-item',
			'.section-tagline',
		]);
		animateSection(targetRef, [
			'.content-label',
			'.section-title',
			'.target-item',
			'.section-tagline',
		]);

		// CTA section
		if (ctaRef.value) {
			gsap.fromTo(
				ctaRef.value.querySelector('.cta-headline'),
				{ opacity: 0, y: 40 },
				{
					opacity: 1,
					y: 0,
					duration: 1,
					ease: 'power3.out',
					scrollTrigger: { trigger: ctaRef.value, start: 'top 70%' },
				}
			);
			gsap.fromTo(
				ctaRef.value.querySelector('.cta-body'),
				{ opacity: 0, y: 30 },
				{
					opacity: 1,
					y: 0,
					duration: 0.8,
					ease: 'power3.out',
					scrollTrigger: { trigger: ctaRef.value, start: 'top 70%' },
					delay: 0.2,
				}
			);
			gsap.fromTo(
				ctaRef.value.querySelector('.cta-divider'),
				{ opacity: 0, scaleX: 0 },
				{
					opacity: 1,
					scaleX: 1,
					duration: 0.6,
					ease: 'power3.out',
					scrollTrigger: { trigger: ctaRef.value, start: 'top 70%' },
					delay: 0.4,
				}
			);
			gsap.fromTo(
				ctaRef.value.querySelector('.cta-buttons'),
				{ opacity: 0, y: 20 },
				{
					opacity: 1,
					y: 0,
					duration: 0.6,
					ease: 'power3.out',
					scrollTrigger: { trigger: ctaRef.value, start: 'top 70%' },
					delay: 0.5,
				}
			);
			gsap.fromTo(
				ctaRef.value.querySelector('.cta-address'),
				{ opacity: 0 },
				{
					opacity: 1,
					duration: 0.6,
					ease: 'power3.out',
					scrollTrigger: { trigger: ctaRef.value, start: 'top 70%' },
					delay: 0.6,
				}
			);
		}
	});
});

onUnmounted(() => {
	window.removeEventListener('scroll', handleScroll);
	if (ctx) ctx.revert();
});

// SEO
useHead({
	title: 'Hue Studios | Agency-Grade Business Management',
	meta: [
		{
			name: 'description',
			content:
				'All-in-one business management platform for creative agencies and SMBs. Projects, invoicing, scheduling, channels, social media management, and more — beautifully designed.',
		},
	],
});
</script>

<style scoped>
.sell-sheet {
	-webkit-font-smoothing: antialiased;
	-moz-osx-font-smoothing: grayscale;
}

/* Hero section clips the fixed background */
.hero {
	clip-path: inset(0);
}

/* Fixed background contained within hero via clip-path */
.hero-bg-container {
	position: fixed;
	inset: 0;
}

/* All sections after hero need proper stacking context */
.section {
	position: relative;
	z-index: 10;
}

/* Sticky content labels on large screens */
.content-label {
	@media (min-width: 1024px) {
		position: sticky;
		top: 8rem;
		align-self: start;
		height: fit-content;
	}
}

/* Hide scrollbar while maintaining scroll functionality */
.scrollbar-hide {
	-ms-overflow-style: none;
	scrollbar-width: none;
}
.scrollbar-hide::-webkit-scrollbar {
	display: none;
}
</style>
