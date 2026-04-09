<template>
	<div class="sell-modern">
		<!-- ─── Glass Nav ─── -->
		<nav class="sm-nav" :class="{ 'sm-nav-scrolled': navScrolled }">
			<nuxt-link to="/" class="sm-nav-brand">
				<LogoEarnest size="sm" />
				<span class="sm-nav-tagline">Do good work.</span>
			</nuxt-link>
			<div class="sm-nav-links">
				<a href="#features" class="sm-nav-link">Features</a>
				<a href="#pricing" class="sm-nav-link">Pricing</a>
			</div>
			<nuxt-link to="/auth/signin" class="sm-nav-signin">Sign In</nuxt-link>
		</nav>

		<!-- ─── Hero ─── -->
		<section ref="heroRef" class="sm-hero">
			<div class="sm-hero-mesh" aria-hidden="true"></div>
			<div class="sm-hero-content">
				<p class="sm-hero-kicker opacity-0">The AI-powered business operating system</p>
				<h1 class="sm-hero-wordmark opacity-0">
					Earnest<span class="sm-hero-period">.</span>
				</h1>
				<p class="sm-hero-tagline opacity-0">
					Do
					<span class="sm-cycle-wrap"><span ref="heroCycleRef" class="sm-cycle">good</span></span>
					work<span class="sm-accent-dot">.</span>
				</p>
				<p class="sm-hero-sub opacity-0">
					Intuitive movement<span class="sm-accent-dot">.</span>
					Actionable experiences<span class="sm-accent-dot">.</span>
					AI that sees everything<span class="sm-accent-dot">.</span>
				</p>
				<div class="sm-hero-actions opacity-0">
					<button class="sm-btn-primary" @click="showComingSoon = true">Start for free</button>
					<a href="#features" class="sm-btn-ghost">See how it works</a>
				</div>
			</div>
			<!-- Background Widget Cloud — 5 ambient outcome widgets -->
			<div class="sm-hero-widgets" aria-hidden="true">
				<div class="sm-hw sm-hw-ai-top">
					<div class="sm-float-card sm-float-card-compact">
						<div class="sm-float-ai-chip">
							<UIcon name="i-lucide-sparkles" style="width:12px;height:12px" />
							<span ref="aiChipTextRef">AI analyzing 142 contacts...</span>
						</div>
					</div>
				</div>
				<div class="sm-hw sm-hw-1">
					<div class="sm-float-card">
						<div class="sm-float-header"><span class="sm-float-label">Revenue</span><span class="sm-float-trend sm-float-trend-up">+12%</span></div>
						<div class="sm-float-big">$24.8k</div>
						<svg class="sm-float-spark" viewBox="0 0 100 24" fill="none"><path d="M0,20 L12,17 L25,19 L38,13 L50,15 L63,9 L75,6 L88,8 L100,3" stroke="var(--sm-text)" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg>
					</div>
				</div>
				<div class="sm-hw sm-hw-2">
					<div class="sm-float-card sm-float-card-compact">
						<div class="sm-float-score">87</div>
						<div class="sm-float-score-label">Health</div>
					</div>
				</div>
				<div class="sm-hw sm-hw-3">
					<div class="sm-float-card">
						<div class="sm-float-header"><span class="sm-float-label">Goals</span></div>
						<div class="sm-hw-goals">
							<div class="sm-hw-goal">
								<span class="sm-hw-goal-label">Revenue</span>
								<div class="sm-hw-goal-bar"><div class="sm-hw-goal-fill" style="width:72%"></div></div>
								<span class="sm-hw-goal-pct">72%</span>
							</div>
							<div class="sm-hw-goal">
								<span class="sm-hw-goal-label">Clients</span>
								<div class="sm-hw-goal-bar"><div class="sm-hw-goal-fill sm-hw-goal-done" style="width:100%"></div></div>
								<span class="sm-hw-goal-pct">100%</span>
							</div>
						</div>
					</div>
				</div>
				<div class="sm-hw sm-hw-4">
					<div class="sm-float-card">
						<div class="sm-float-header"><span class="sm-float-label">Channels</span></div>
						<div class="sm-hw-chat">
							<div class="sm-hw-chat-bubble sm-hw-chat-them"></div>
							<div class="sm-hw-chat-bubble sm-hw-chat-me"></div>
							<div class="sm-hw-chat-bubble sm-hw-chat-them sm-hw-chat-short"></div>
						</div>
					</div>
				</div>
				<div class="sm-hw sm-hw-5">
					<div class="sm-float-card sm-float-card-compact">
						<div class="sm-float-header"><span class="sm-float-label">Pipeline</span></div>
						<div class="sm-float-pipe">
							<div class="sm-float-pipe-bar" style="width:100%"></div>
							<div class="sm-float-pipe-bar" style="width:65%;opacity:0.6"></div>
							<div class="sm-float-pipe-bar" style="width:35%;opacity:0.3"></div>
						</div>
						<div class="sm-float-pipe-val">$84k</div>
					</div>
				</div>
			</div>
		</section>

		<!-- ─── Widget Carousel ─── -->
		<div class="sm-widget-carousel" aria-hidden="true">
			<div class="sm-carousel-track">
				<!-- Duplicate set for seamless loop -->
				<template v-for="pass in 2" :key="'pass-' + pass">
					<div class="sm-carousel-card">
						<div class="sm-float-header"><span class="sm-float-label">Projects</span><span class="sm-float-badge">Q2</span></div>
						<div class="sm-hw-gantt">
							<div class="sm-hw-gantt-bar" style="width:60%;margin-left:0"></div>
							<div class="sm-hw-gantt-bar" style="width:45%;margin-left:20%"></div>
							<div class="sm-hw-gantt-bar sm-hw-gantt-accent" style="width:35%;margin-left:40%"></div>
							<div class="sm-hw-gantt-bar" style="width:50%;margin-left:30%"></div>
						</div>
					</div>
					<div class="sm-carousel-card">
						<div class="sm-float-header"><span class="sm-float-label">CRM Intelligence</span></div>
						<div class="sm-hw-crm">
							<div class="sm-hw-crm-contact">
								<span class="sm-hw-contact-dot" style="background:#6366f1;margin:0"></span>
								<div class="sm-hw-crm-info"><span class="sm-hw-crm-name">Acme Corp</span><span class="sm-hw-crm-stage">Proposal &middot; Score 92</span></div>
								<span class="sm-hw-crm-val">$12k</span>
							</div>
							<div class="sm-hw-crm-contact">
								<span class="sm-hw-contact-dot" style="background:#f59e0b;margin:0"></span>
								<div class="sm-hw-crm-info"><span class="sm-hw-crm-name">Nova Labs</span><span class="sm-hw-crm-stage">Follow-up &middot; Score 67</span></div>
								<span class="sm-hw-crm-val">$8k</span>
							</div>
						</div>
					</div>
					<div class="sm-carousel-card">
						<div class="sm-float-header"><span class="sm-float-label">Tickets</span><span class="sm-float-badge">5 open</span></div>
						<div class="sm-hw-tickets">
							<div class="sm-hw-ticket"><span class="sm-hw-ticket-dot" style="background:#f59e0b"></span><span class="sm-hw-ticket-title">Fix checkout flow</span><span class="sm-hw-ticket-pri sm-hw-pri-high">High</span></div>
							<div class="sm-hw-ticket"><span class="sm-hw-ticket-dot" style="background:#10b981"></span><span class="sm-hw-ticket-title">Update brand assets</span><span class="sm-hw-ticket-pri sm-hw-pri-med">Med</span></div>
						</div>
					</div>
					<div class="sm-carousel-card">
						<div class="sm-float-header"><span class="sm-float-label">Email Campaign</span><span class="sm-float-trend sm-float-trend-up">42% open</span></div>
						<div class="sm-hw-email">
							<div class="sm-hw-email-preview">
								<div class="sm-hw-email-subject"></div>
								<div class="sm-hw-email-body"></div>
								<div class="sm-hw-email-body sm-hw-email-body-short"></div>
							</div>
							<div class="sm-hw-email-stats"><span class="sm-hw-email-stat">Sent: 1,240</span><span class="sm-hw-email-stat">Clicked: 318</span></div>
						</div>
					</div>
					<div class="sm-carousel-card">
						<div class="sm-float-header"><span class="sm-float-label">People</span><span class="sm-float-badge">142</span></div>
						<div class="sm-hw-people">
							<div class="sm-hw-person"><span class="sm-hw-contact-dot" style="background:#6366f1;margin:0"></span><span class="sm-hw-person-name">Sarah Kim</span><span class="sm-hw-person-role">Client</span></div>
							<div class="sm-hw-person"><span class="sm-hw-contact-dot" style="background:#f59e0b;margin:0"></span><span class="sm-hw-person-name">James Cole</span><span class="sm-hw-person-role">Lead</span></div>
						</div>
					</div>
					<div class="sm-carousel-card">
						<div class="sm-float-header"><span class="sm-float-label">Meetings</span></div>
						<div class="sm-hw-video">
							<div class="sm-hw-video-screen"><UIcon name="i-lucide-video" style="width:14px;height:14px;color:var(--sm-pop)" /></div>
							<div class="sm-hw-video-bar"><span class="sm-hw-video-dot" style="background:#10b981"></span><span class="sm-hw-video-text">Live &middot; 3 participants</span></div>
						</div>
					</div>
					<div class="sm-carousel-card">
						<div class="sm-float-header"><span class="sm-float-label">Team</span></div>
						<div class="sm-hw-team">
							<div class="sm-hw-team-member"><span class="sm-hw-contact-dot" style="background:#6366f1;margin:0"></span><span class="sm-hw-team-name">Sarah K.</span><span class="sm-hw-team-status" style="background:#10b981"></span></div>
							<div class="sm-hw-team-member"><span class="sm-hw-contact-dot" style="background:#f59e0b;margin:0"></span><span class="sm-hw-team-name">Mike R.</span><span class="sm-hw-team-status" style="background:#10b981"></span></div>
						</div>
					</div>
					<div class="sm-carousel-card">
						<div class="sm-float-header"><span class="sm-float-label">Calendar</span></div>
						<div class="sm-hw-cal">
							<div class="sm-hw-cal-row"><span></span><span></span><span class="sm-hw-cal-today"></span><span></span><span></span></div>
							<div class="sm-hw-cal-row"><span></span><span></span><span></span><span class="sm-hw-cal-event"></span><span></span></div>
						</div>
					</div>
					<div class="sm-carousel-card">
						<div class="sm-float-header"><span class="sm-float-label">Invoicing</span></div>
						<div class="sm-hw-invoices">
							<div class="sm-hw-inv-row"><span class="sm-hw-inv-name"></span><span class="sm-hw-inv-amt">$2,400</span><span class="sm-hw-inv-status sm-hw-inv-paid">Paid</span></div>
							<div class="sm-hw-inv-row"><span class="sm-hw-inv-name"></span><span class="sm-hw-inv-amt">$1,800</span><span class="sm-hw-inv-status sm-hw-inv-pending">Due</span></div>
						</div>
					</div>
					<!-- Hero widgets shown in carousel on lg and below -->
					<div class="sm-carousel-card sm-carousel-lg-only">
						<div class="sm-float-header"><span class="sm-float-label">Revenue</span><span class="sm-float-trend sm-float-trend-up">+12%</span></div>
						<div class="sm-float-big">$24.8k</div>
						<svg class="sm-float-spark" viewBox="0 0 100 24" fill="none"><path d="M0,20 L12,17 L25,19 L38,13 L50,15 L63,9 L75,6 L88,8 L100,3" stroke="var(--sm-text)" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg>
					</div>
					<div class="sm-carousel-card sm-carousel-lg-only">
						<div class="sm-float-header"><span class="sm-float-label">Health</span></div>
						<div class="sm-float-score">87</div>
						<div class="sm-float-score-label">Excellent</div>
					</div>
					<div class="sm-carousel-card sm-carousel-lg-only">
						<div class="sm-float-header"><span class="sm-float-label">Goals</span></div>
						<div class="sm-hw-goals">
							<div class="sm-hw-goal"><span class="sm-hw-goal-label">Revenue</span><div class="sm-hw-goal-bar"><div class="sm-hw-goal-fill" style="width:72%"></div></div><span class="sm-hw-goal-pct">72%</span></div>
							<div class="sm-hw-goal"><span class="sm-hw-goal-label">Clients</span><div class="sm-hw-goal-bar"><div class="sm-hw-goal-fill sm-hw-goal-done" style="width:100%"></div></div><span class="sm-hw-goal-pct">100%</span></div>
						</div>
					</div>
					<div class="sm-carousel-card sm-carousel-lg-only">
						<div class="sm-float-header"><span class="sm-float-label">Pipeline</span></div>
						<div class="sm-float-pipe">
							<div class="sm-float-pipe-bar" style="width:100%"></div>
							<div class="sm-float-pipe-bar" style="width:65%;opacity:0.6"></div>
							<div class="sm-float-pipe-bar" style="width:35%;opacity:0.3"></div>
						</div>
						<div class="sm-float-pipe-val">$84k</div>
					</div>
					<div class="sm-carousel-card sm-carousel-lg-only">
						<div class="sm-float-header"><span class="sm-float-label">Channels</span></div>
						<div class="sm-hw-chat">
							<div class="sm-hw-chat-bubble sm-hw-chat-them"></div>
							<div class="sm-hw-chat-bubble sm-hw-chat-me"></div>
							<div class="sm-hw-chat-bubble sm-hw-chat-them sm-hw-chat-short"></div>
						</div>
					</div>
				</template>
			</div>
		</div>

		<!-- ─── Marquee ─── -->
		<div class="sm-marquee" aria-hidden="true">
			<div class="sm-marquee-track">
				<span v-for="(item, i) in [...marqueeItems, ...marqueeItems]" :key="i" class="sm-marquee-item">
					<UIcon :name="item.icon" class="sm-marquee-icon" />
					{{ item.label }}
					<span class="sm-marquee-dot"></span>
				</span>
			</div>
		</div>

		<!-- ─── Replaces ─── -->
		<section ref="replacesRef" class="sm-replaces">
			<p class="sm-kicker opacity-0">One platform replaces</p>
			<!-- Orbit layout: Earnest center + tools with connector lines (static) -->
			<div class="sm-orbit-ring opacity-0" :class="{ 'sm-orbit-active': hoveredOrbit >= 0, 'sm-orbit-pull-all': hoveredOrbit === -2 }">
				<!-- Connector lines -->
				<svg class="sm-orbit-lines" :viewBox="`0 0 600 600`" fill="none">
					<line
						v-for="(tool, i) in replacedTools"
						:key="'line-' + i"
						x1="300" y1="300"
						:x2="300 + Math.cos((i * (360 / replacedTools.length) - 90) * Math.PI / 180) * 250"
						:y2="300 + Math.sin((i * (360 / replacedTools.length) - 90) * Math.PI / 180) * 250"
						:stroke="hoveredOrbit === i || hoveredOrbit === -2 ? '#00bfff' : 'rgba(0,0,0,0.08)'"
						:stroke-width="hoveredOrbit === i || hoveredOrbit === -2 ? 2 : 1"
						stroke-dasharray="4 3"
						style="transition: stroke 0.3s, stroke-width 0.3s"
					/>
				</svg>
				<div class="sm-orbit-center" @mouseenter="pauseOrbitAutoRotate(); hoveredOrbit = -2" @mouseleave="hoveredOrbit = -1; resumeOrbitAutoRotate()">
					<img src="/icon.png" alt="Earnest" class="sm-orbit-e" />
					<div class="sm-orbit-center-text">
						<span class="sm-orbit-center-label"><span class="sm-brand">Earnest</span></span>
						<span class="sm-orbit-center-tagline">Do good work.</span>
					</div>
					<div class="sm-orbit-center-hover-text"><span class="sm-orbit-hover-pill glass-thin"><span class="sm-brand">Earnest</span> work. = Good work.</span></div>
				</div>
				<div
					v-for="(tool, i) in replacedTools"
					:key="i"
					class="sm-orbit-tool"
					:class="{ 'sm-orbit-tool-hovered': hoveredOrbit === i }"
					@mouseenter="pauseOrbitAutoRotate(); hoveredOrbit = i"
					@mouseleave="hoveredOrbit = -1; resumeOrbitAutoRotate()"
					:style="{
						left: (50 + Math.cos((i * (360 / replacedTools.length) - 90) * Math.PI / 180) * 250 / 600 * 100) + '%',
						top: (50 + Math.sin((i * (360 / replacedTools.length) - 90) * Math.PI / 180) * 250 / 600 * 100) + '%',
					}"
				>
					<div class="sm-orbit-tool-inner">
						<UIcon :name="tool.icon" class="sm-orbit-tool-icon" />
						<span class="sm-orbit-tooltip">{{ tool.replaces }}</span>
					</div>
					<span class="sm-orbit-tool-name">{{ tool.name }}</span>
				</div>
			</div>
			<p class="sm-replaces-cta opacity-0">
				All of this. <strong>One source of truth<span class="sm-accent-dot">.</span></strong>
			</p>
		</section>

		<!-- ─── Truth ─── -->
		<section ref="truthRef" class="sm-truth">
			<!-- Sticky background chart (full viewport width) -->
			<div class="sm-parallax-chart sm-parallax-truth" aria-hidden="true">
				<svg viewBox="0 0 600 200" fill="none" preserveAspectRatio="none">
					<path d="M0,180 C60,170 100,140 150,130 C200,120 230,125 280,100 C330,75 370,80 420,55 C470,30 520,40 560,25 C580,18 590,20 600,15" stroke="rgba(0,0,0,0.04)" stroke-width="2" fill="none" stroke-linecap="round"/>
					<path d="M0,180 C60,170 100,140 150,130 C200,120 230,125 280,100 C330,75 370,80 420,55 C470,30 520,40 560,25 C580,18 590,20 600,15 L600,200 L0,200Z" fill="rgba(0,0,0,0.015)"/>
					<path d="M0,190 C80,185 140,165 200,158 C260,150 300,155 360,135 C420,115 460,120 520,100 C560,88 580,90 600,82" stroke="rgba(0,0,0,0.025)" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-dasharray="4 4"/>
				</svg>
			</div>
			<div class="sm-truth-inner">
				<div class="sm-truth-sidebar">
					<div class="sm-section-label opacity-0">The honest case</div>
				</div>
				<div class="sm-truth-body">
				<h2 class="sm-truth-title opacity-0">
					Your business runs on multiple tools. It should run on
					<span class="sm-truth-highlight">one</span><span class="sm-accent-dot">.</span>
				</h2>

				<!-- Block 1: The problem -->
				<p class="sm-truth-text opacity-0">
					Multiple tools. Multiple logins. <strong>Zero collective knowledge.</strong>
				</p>

				<!-- Visual: tool stack illustration -->
				<div class="sm-truth-visual opacity-0" aria-hidden="true">
					<div class="sm-truth-stack">
						<div class="sm-truth-stack-item" v-for="n in 5" :key="n" :style="{ opacity: 1 - (n * 0.15) }">
							<div class="sm-truth-stack-bar"></div>
							<div class="sm-truth-stack-bar sm-truth-stack-bar-short"></div>
						</div>
					</div>
					<div class="sm-truth-arrow" aria-hidden="true">&rarr;</div>
					<div class="sm-truth-unified">
						<img src="/icon.png" alt="Earnest" class="sm-truth-unified-icon" />
					</div>
				</div>

				<!-- Block 2: The solution -->
				<p class="sm-truth-text opacity-0">
					<strong><span class="sm-brand">Earnest</span> replaces the pile.</strong>
					One platform, one login &mdash; from first conversation to final payment. Every page is a surface you work from, <strong>not a report you read.</strong>
				</p>

				<!-- Insight Cards (inside truth body so sidebar stays sticky alongside) -->
				<div class="sm-insight-row-inline">
					<div class="sm-truth-card opacity-0">
						<UIcon name="i-lucide-brain" class="sm-truth-card-icon" />
						<div>
							<div class="sm-truth-card-title">AI sees everything</div>
							<div class="sm-truth-card-desc">Contacts, revenue, goals, campaigns &mdash; connected</div>
						</div>
					</div>
					<div class="sm-truth-card opacity-0">
						<UIcon name="i-lucide-target" class="sm-truth-card-icon" />
						<div>
							<div class="sm-truth-card-title">Your plans know your data</div>
							<div class="sm-truth-card-desc">Marketing knows your pipeline. Goals know your financials.</div>
						</div>
					</div>
					<div class="sm-truth-card opacity-0">
						<UIcon name="i-lucide-smartphone" class="sm-truth-card-icon" />
						<div>
							<div class="sm-truth-card-title">Works everywhere</div>
							<div class="sm-truth-card-desc">CardDesk + E&sup2; companion apps keep you connected on the go</div>
						</div>
					</div>
				</div>

			</div>
			</div>
		</section>

		<!-- ─── AI Capabilities ─── -->
		<section ref="aiRef" class="sm-ai">
			<!-- Parallax background chart -->
			<div class="sm-parallax-chart sm-parallax-ai" aria-hidden="true">
				<svg viewBox="0 0 800 400" fill="none" preserveAspectRatio="none">
					<!-- Vertical grid lines (month markers) -->
					<line x1="160" y1="0" x2="160" y2="400" stroke="rgba(255,255,255,0.03)" stroke-width="0.5"/>
					<line x1="320" y1="0" x2="320" y2="400" stroke="rgba(255,255,255,0.03)" stroke-width="0.5"/>
					<line x1="480" y1="0" x2="480" y2="400" stroke="rgba(255,255,255,0.03)" stroke-width="0.5"/>
					<line x1="640" y1="0" x2="640" y2="400" stroke="rgba(255,255,255,0.03)" stroke-width="0.5"/>
					<!-- Horizontal row lines -->
					<line x1="0" y1="57" x2="800" y2="57" stroke="rgba(255,255,255,0.02)" stroke-width="0.5"/>
					<line x1="0" y1="114" x2="800" y2="114" stroke="rgba(255,255,255,0.02)" stroke-width="0.5"/>
					<line x1="0" y1="171" x2="800" y2="171" stroke="rgba(255,255,255,0.02)" stroke-width="0.5"/>
					<line x1="0" y1="228" x2="800" y2="228" stroke="rgba(255,255,255,0.02)" stroke-width="0.5"/>
					<line x1="0" y1="285" x2="800" y2="285" stroke="rgba(255,255,255,0.02)" stroke-width="0.5"/>
					<line x1="0" y1="342" x2="800" y2="342" stroke="rgba(255,255,255,0.02)" stroke-width="0.5"/>
					<!-- Gantt bars (animated fill) -->
					<!-- Track backgrounds -->
					<rect x="40" y="30" width="600" height="18" rx="9" fill="rgba(255,255,255,0.02)"/>
					<rect x="40" y="87" width="600" height="18" rx="9" fill="rgba(255,255,255,0.02)"/>
					<rect x="40" y="144" width="600" height="18" rx="9" fill="rgba(255,255,255,0.02)"/>
					<rect x="40" y="201" width="600" height="18" rx="9" fill="rgba(255,255,255,0.02)"/>
					<rect x="40" y="258" width="600" height="18" rx="9" fill="rgba(255,255,255,0.02)"/>
					<rect x="40" y="315" width="600" height="18" rx="9" fill="rgba(255,255,255,0.02)"/>
					<rect x="40" y="372" width="600" height="18" rx="9" fill="rgba(255,255,255,0.02)"/>
					<!-- Progress fills -->
					<rect class="sm-ai-gantt-fill" x="40" y="30" width="280" height="18" rx="9" fill="rgba(255,255,255,0.07)" style="animation-delay:0s"/>
					<rect class="sm-ai-gantt-fill" x="160" y="87" width="320" height="18" rx="9" fill="rgba(255,255,255,0.05)" style="animation-delay:1.5s"/>
					<rect class="sm-ai-gantt-fill" x="80" y="144" width="240" height="18" rx="9" fill="rgba(255,255,255,0.06)" style="animation-delay:3s"/>
					<rect class="sm-ai-gantt-fill" x="280" y="201" width="340" height="18" rx="9" fill="rgba(255,255,255,0.04)" style="animation-delay:4.5s"/>
					<rect class="sm-ai-gantt-fill" x="200" y="258" width="180" height="18" rx="9" fill="rgba(255,255,255,0.05)" style="animation-delay:6s"/>
					<rect class="sm-ai-gantt-fill" x="120" y="315" width="440" height="18" rx="9" fill="rgba(255,255,255,0.06)" style="animation-delay:7.5s"/>
					<rect class="sm-ai-gantt-fill" x="360" y="372" width="260" height="18" rx="9" fill="rgba(255,255,255,0.04)" style="animation-delay:9s"/>
						<!-- Dependency connectors -->
					<path d="M320,48 L320,60 L200,60 L200,87" stroke="rgba(255,255,255,0.04)" stroke-width="1" fill="none"/>
					<path d="M440,105 L440,120 L320,120 L320,144" stroke="rgba(255,255,255,0.04)" stroke-width="1" fill="none"/>
					<path d="M620,210 L620,240 L440,240 L440,258" stroke="rgba(255,255,255,0.04)" stroke-width="1" fill="none"/>
					<!-- Today marker (animated drift) -->
					<line class="sm-ai-today-marker" x1="380" y1="0" x2="380" y2="400" stroke="rgba(0,191,255,0.1)" stroke-width="1.5" stroke-dasharray="6 4"/>
				</svg>
			</div>
			<div class="sm-ai-inner">
				<div class="sm-ai-sidebar">
					<div class="sm-section-label sm-section-label-light opacity-0">What one platform makes possible</div>
				</div>
				<div class="sm-ai-body">
					<h2 class="sm-ai-headline opacity-0">
						Your data talks<span class="sm-accent-dot">.</span><br />
						<span class="sm-ai-em">AI listens<span class="sm-accent-dot">.</span></span>
					</h2>
					<p class="sm-ai-lede opacity-0">
						Most tools bolt AI onto one channel. <span class="sm-brand">Earnest</span> gives AI the full picture &mdash; people, companies, projects,
						revenue, conversations, campaigns, financials, and goals &mdash; layered with brand direction and target
						audience for every client. The result is CRM intelligence, marketing plans, pipeline forecasts, and goal
						suggestions that are uniquely yours.
					</p>
					<div class="sm-ai-grid">
						<div v-for="(cap, i) in aiCapabilities" :key="i" class="sm-ai-card opacity-0">
							<span class="sm-ai-num">{{ String(i + 1).padStart(2, '0') }}</span>
							<h3 class="sm-ai-card-title">{{ cap.title }}</h3>
							<p class="sm-ai-card-desc">{{ cap.desc }}</p>
						</div>
					</div>
				</div>
			</div>
		</section>

		<!-- ─── Features ─── -->
		<section ref="featuresRef" id="features" class="sm-features">
			<!-- Parallax background grid -->
			<div class="sm-parallax-chart sm-parallax-features" aria-hidden="true">
				<svg viewBox="0 0 400 300" fill="none">
					<!-- Horizontal grid lines -->
					<line x1="0" y1="60" x2="400" y2="60" stroke="rgba(0,0,0,0.03)" stroke-width="0.5"/>
					<line x1="0" y1="120" x2="400" y2="120" stroke="rgba(0,0,0,0.03)" stroke-width="0.5"/>
					<line x1="0" y1="180" x2="400" y2="180" stroke="rgba(0,0,0,0.03)" stroke-width="0.5"/>
					<line x1="0" y1="240" x2="400" y2="240" stroke="rgba(0,0,0,0.03)" stroke-width="0.5"/>
					<!-- Vertical grid lines -->
					<line x1="80" y1="0" x2="80" y2="300" stroke="rgba(0,0,0,0.02)" stroke-width="0.5"/>
					<line x1="160" y1="0" x2="160" y2="300" stroke="rgba(0,0,0,0.02)" stroke-width="0.5"/>
					<line x1="240" y1="0" x2="240" y2="300" stroke="rgba(0,0,0,0.02)" stroke-width="0.5"/>
					<line x1="320" y1="0" x2="320" y2="300" stroke="rgba(0,0,0,0.02)" stroke-width="0.5"/>
					<!-- Bar hints -->
					<rect x="60" y="180" width="40" height="120" rx="4" fill="rgba(0,0,0,0.02)"/>
					<rect x="140" y="140" width="40" height="160" rx="4" fill="rgba(0,0,0,0.025)"/>
					<rect x="220" y="100" width="40" height="200" rx="4" fill="rgba(0,0,0,0.03)"/>
					<rect x="300" y="70" width="40" height="230" rx="4" fill="rgba(0,0,0,0.02)"/>
				</svg>
			</div>
			<div class="sm-features-layout">
				<!-- Sticky left: label + title -->
				<div class="sm-features-header">
					<div class="sm-section-label opacity-0">The full platform</div>
					<p class="sm-features-big opacity-0">Everything</p>
					<h2 class="sm-features-title opacity-0">
						your business needs<span class="sm-accent-dot">.</span><br />
						<em class="sm-features-em">Nothing</em> it doesn't<span class="sm-accent-dot">.</span>
					</h2>
					<p class="sm-features-sub opacity-0">Built for teams who are serious about their work<span class="sm-accent-dot">.</span></p>
					<p class="sm-features-count opacity-0">{{ features.length }} features included</p>
				</div>
				<!-- Right: collapsible feature list -->
				<div class="sm-features-list">
					<div
						v-for="(f, i) in features"
						:key="i"
						class="sm-feature-accordion opacity-0"
						:class="{ 'sm-feature-open': expandedFeature === i }"
						@click="expandedFeature = expandedFeature === i ? -1 : i"
					>
						<div class="sm-feature-acc-header">
							<UIcon :name="f.icon" class="sm-feature-icon" />
							<span class="sm-feature-acc-name">{{ f.name }}</span>
							<span class="sm-feature-acc-toggle">
								<UIcon :name="expandedFeature === i ? 'i-lucide-minus' : 'i-lucide-plus'" class="sm-feature-acc-chevron" />
							</span>
						</div>
						<div class="sm-feature-acc-body">
							<p class="sm-feature-acc-desc">{{ f.desc }}</p>
						</div>
					</div>
				</div>
			</div>
		</section>

		<!-- ─── Showcase: See it in action ─── -->
		<section ref="showcaseRef" class="sm-showcase" aria-label="Product showcase">
			<div class="sm-showcase-inner">
				<p class="sm-kicker opacity-0">Your entire business, one screen</p>
				<h2 class="sm-showcase-title opacity-0">See it in action<span class="sm-accent-dot">.</span></h2>
				<div class="sm-showcase-grid">
					<!-- Large Left: Revenue + Stats -->
					<div class="sm-showcase-cell sm-showcase-large opacity-0" aria-hidden="true">
						<div class="sm-mock-widget">
							<div class="sm-mock-header">
								<span class="sm-mock-title">Revenue Trend</span>
								<span class="sm-mock-pill">Last 6 months</span>
							</div>
							<svg class="sm-mock-chart" viewBox="0 0 320 100" fill="none" preserveAspectRatio="none">
								<defs>
									<linearGradient id="billFill" x1="0" y1="0" x2="0" y2="1">
										<stop offset="0%" stop-color="#3b82f6" stop-opacity="0.12"/>
										<stop offset="100%" stop-color="#3b82f6" stop-opacity="0"/>
									</linearGradient>
									<linearGradient id="paidFill" x1="0" y1="0" x2="0" y2="1">
										<stop offset="0%" stop-color="#10b981" stop-opacity="0.1"/>
										<stop offset="100%" stop-color="#10b981" stop-opacity="0"/>
									</linearGradient>
								</defs>
								<!-- Grid lines -->
								<line x1="0" y1="25" x2="320" y2="25" stroke="rgba(0,0,0,0.04)" stroke-width="0.5"/>
								<line x1="0" y1="50" x2="320" y2="50" stroke="rgba(0,0,0,0.04)" stroke-width="0.5"/>
								<line x1="0" y1="75" x2="320" y2="75" stroke="rgba(0,0,0,0.04)" stroke-width="0.5"/>
								<!-- Billed line -->
								<path d="M0,70 C30,65 50,55 80,50 C110,45 130,48 160,38 C190,28 220,32 250,22 C280,15 300,18 320,10" stroke="#3b82f6" stroke-width="2" fill="none" stroke-linecap="round"/>
								<path d="M0,70 C30,65 50,55 80,50 C110,45 130,48 160,38 C190,28 220,32 250,22 C280,15 300,18 320,10 L320,100 L0,100Z" fill="url(#billFill)"/>
								<!-- Paid line -->
								<path d="M0,78 C30,75 50,68 80,62 C110,58 130,55 160,48 C190,40 220,42 250,32 C280,26 300,28 320,20" stroke="#10b981" stroke-width="2" fill="none" stroke-linecap="round"/>
								<path d="M0,78 C30,75 50,68 80,62 C110,58 130,55 160,48 C190,40 220,42 250,32 C280,26 300,28 320,20 L320,100 L0,100Z" fill="url(#paidFill)"/>
							</svg>
							<div class="sm-mock-legend">
								<span class="sm-mock-legend-item"><span class="sm-mock-dot" style="background:#3b82f6"></span>Billed</span>
								<span class="sm-mock-legend-item"><span class="sm-mock-dot" style="background:#10b981"></span>Paid</span>
							</div>
						</div>
						<!-- Stats Row -->
						<div class="sm-mock-stats">
							<div class="sm-mock-stat">
								<span class="sm-mock-stat-label">Revenue</span>
								<span class="sm-mock-stat-value">$24.8k</span>
								<span class="sm-mock-stat-trend sm-float-trend-up">+12%</span>
							</div>
							<div class="sm-mock-stat">
								<span class="sm-mock-stat-label">Clients</span>
								<span class="sm-mock-stat-value">142</span>
								<span class="sm-mock-stat-trend sm-float-trend-up">+8</span>
							</div>
							<div class="sm-mock-stat">
								<span class="sm-mock-stat-label">Tasks Done</span>
								<span class="sm-mock-stat-value">89%</span>
								<span class="sm-mock-stat-trend sm-float-trend-up">+5%</span>
							</div>
							<div class="sm-mock-stat">
								<span class="sm-mock-stat-label">AI Queries</span>
								<span class="sm-mock-stat-value">1.2k</span>
								<span class="sm-mock-stat-trend" style="color:var(--sm-muted)">this mo.</span>
							</div>
						</div>
					</div>
					<!-- Large Right: Kanban Board -->
					<div class="sm-showcase-cell sm-showcase-large opacity-0" aria-hidden="true">
						<div class="sm-mock-widget">
							<div class="sm-mock-header">
								<span class="sm-mock-title">Project Board</span>
								<span class="sm-mock-pill">Acme Corp</span>
							</div>
							<div class="sm-mock-kanban">
								<div class="sm-mock-kan-col">
									<div class="sm-mock-kan-head" style="border-color:#06b6d4">Pending <span class="sm-mock-kan-count">3</span></div>
									<div class="sm-mock-kan-card">
										<div class="sm-mock-kan-title">Brand identity refresh</div>
										<div class="sm-mock-kan-meta"><span class="sm-mock-kan-tag" style="background:#e0f2fe;color:#0369a1">Design</span></div>
									</div>
									<div class="sm-mock-kan-card">
										<div class="sm-mock-kan-title">Q2 social calendar</div>
										<div class="sm-mock-kan-meta"><span class="sm-mock-kan-tag" style="background:#fef3c7;color:#92400e">Marketing</span></div>
									</div>
									<div class="sm-mock-kan-card">
										<div class="sm-mock-kan-title">Analytics dashboard</div>
										<div class="sm-mock-kan-meta"><span class="sm-mock-kan-tag" style="background:#ede9fe;color:#5b21b6">Dev</span></div>
									</div>
								</div>
								<div class="sm-mock-kan-col">
									<div class="sm-mock-kan-head" style="border-color:#22c55e">In Progress <span class="sm-mock-kan-count">2</span></div>
									<div class="sm-mock-kan-card sm-mock-kan-active">
										<div class="sm-mock-kan-title">Email campaign launch</div>
										<div class="sm-mock-kan-meta">
											<span class="sm-mock-kan-tag" style="background:#fef3c7;color:#92400e">Marketing</span>
											<div class="sm-mock-kan-avatars"><span class="sm-mock-avatar"></span><span class="sm-mock-avatar" style="background:#a78bfa"></span></div>
										</div>
									</div>
									<div class="sm-mock-kan-card">
										<div class="sm-mock-kan-title">Client onboarding flow</div>
										<div class="sm-mock-kan-meta"><span class="sm-mock-kan-tag" style="background:#e0f2fe;color:#0369a1">Design</span></div>
									</div>
								</div>
								<div class="sm-mock-kan-col">
									<div class="sm-mock-kan-head" style="border-color:#10b981">Done <span class="sm-mock-kan-count">4</span></div>
									<div class="sm-mock-kan-card sm-mock-kan-done">
										<div class="sm-mock-kan-title">Website redesign</div>
										<div class="sm-mock-kan-meta"><span class="sm-mock-kan-tag" style="background:#d1fae5;color:#065f46">Complete</span></div>
									</div>
									<div class="sm-mock-kan-card sm-mock-kan-done">
										<div class="sm-mock-kan-title">Logo package delivery</div>
										<div class="sm-mock-kan-meta"><span class="sm-mock-kan-tag" style="background:#d1fae5;color:#065f46">Complete</span></div>
									</div>
								</div>
							</div>
						</div>
					</div>
					<!-- Bottom Left: Productivity Meter -->
					<div class="sm-showcase-cell sm-showcase-small opacity-0" aria-hidden="true">
						<div class="sm-mock-widget">
							<div class="sm-mock-header">
								<span class="sm-mock-title">Productivity</span>
							</div>
							<div class="sm-mock-meter">
								<div class="sm-mock-score">87</div>
								<div class="sm-mock-score-bar">
									<div class="sm-mock-score-fill" style="width:87%"></div>
								</div>
								<span class="sm-mock-score-label">Excellent</span>
							</div>
							<div class="sm-mock-meter-stats">
								<div class="sm-mock-meter-stat"><span class="sm-mock-meter-num" style="color:#10b981">12</span><span class="sm-mock-meter-lbl">Done</span></div>
								<div class="sm-mock-meter-stat"><span class="sm-mock-meter-num" style="color:#f59e0b">2</span><span class="sm-mock-meter-lbl">Overdue</span></div>
								<div class="sm-mock-meter-stat"><span class="sm-mock-meter-num" style="color:var(--sm-muted)">5</span><span class="sm-mock-meter-lbl">Pending</span></div>
							</div>
						</div>
					</div>
					<!-- Bottom Center-Left: Social Widget -->
					<div class="sm-showcase-cell sm-showcase-small opacity-0" aria-hidden="true">
						<div class="sm-mock-widget">
							<div class="sm-mock-header">
								<span class="sm-mock-title">Social Queue</span>
							</div>
							<div class="sm-mock-social">
								<div class="sm-mock-social-post">
									<div class="sm-mock-social-icon" style="background:#E4405F">IG</div>
									<div class="sm-mock-social-body">
										<div class="sm-mock-social-text">New collection launch...</div>
										<div class="sm-mock-social-time">Today, 2:00 PM</div>
									</div>
									<span class="sm-mock-social-status sm-mock-status-ready">Ready</span>
								</div>
								<div class="sm-mock-social-post">
									<div class="sm-mock-social-icon" style="background:#0A66C2">in</div>
									<div class="sm-mock-social-body">
										<div class="sm-mock-social-text">Team growth update...</div>
										<div class="sm-mock-social-time">Tomorrow, 9:00 AM</div>
									</div>
									<span class="sm-mock-social-status sm-mock-status-scheduled">Scheduled</span>
								</div>
								<div class="sm-mock-social-post">
									<div class="sm-mock-social-icon" style="background:#1DA1F2">X</div>
									<div class="sm-mock-social-body">
										<div class="sm-mock-social-text">Product feature deep dive...</div>
										<div class="sm-mock-social-time">Wed, 11:30 AM</div>
									</div>
									<span class="sm-mock-social-status sm-mock-status-draft">Draft</span>
								</div>
							</div>
						</div>
					</div>
					<!-- Bottom Center-Right: CRM Pipeline -->
					<div class="sm-showcase-cell sm-showcase-small opacity-0" aria-hidden="true">
						<div class="sm-mock-widget">
							<div class="sm-mock-header">
								<span class="sm-mock-title">Pipeline</span>
								<span class="sm-mock-pill">$84k total</span>
							</div>
							<div class="sm-mock-pipeline">
								<div class="sm-mock-pipe-stage">
									<div class="sm-mock-pipe-bar" style="width:100%;background:rgba(0,0,0,0.06)"></div>
									<span class="sm-mock-pipe-name">Lead</span>
									<span class="sm-mock-pipe-count">24</span>
								</div>
								<div class="sm-mock-pipe-stage">
									<div class="sm-mock-pipe-bar" style="width:65%;background:rgba(0,0,0,0.1)"></div>
									<span class="sm-mock-pipe-name">Qualified</span>
									<span class="sm-mock-pipe-count">16</span>
								</div>
								<div class="sm-mock-pipe-stage">
									<div class="sm-mock-pipe-bar" style="width:40%;background:rgba(0,0,0,0.15)"></div>
									<span class="sm-mock-pipe-name">Proposal</span>
									<span class="sm-mock-pipe-count">9</span>
								</div>
								<div class="sm-mock-pipe-stage">
									<div class="sm-mock-pipe-bar" style="width:20%;background:#10b981"></div>
									<span class="sm-mock-pipe-name">Won</span>
									<span class="sm-mock-pipe-count">5</span>
								</div>
							</div>
						</div>
					</div>
					<!-- Bottom Right: AI Insight -->
					<div class="sm-showcase-cell sm-showcase-small opacity-0" aria-hidden="true">
						<div class="sm-mock-widget sm-mock-widget-dark">
							<div class="sm-mock-header">
								<span class="sm-mock-title" style="color:white">AI Insight</span>
								<UIcon name="i-lucide-sparkles" style="width:14px;height:14px;color:#10b981" />
							</div>
							<div class="sm-mock-ai-insight">
								<div class="sm-mock-ai-score">
									<span class="sm-mock-ai-num">92</span>
									<span class="sm-mock-ai-of">/100</span>
								</div>
								<div class="sm-mock-ai-label">CRM Health</div>
								<div class="sm-mock-ai-rec">3 contacts need follow-up. Revenue trending +18% vs last quarter.</div>
							</div>
						</div>
					</div>
					<!-- Full-width: Team Channels / Messages -->
					<div class="sm-showcase-cell sm-showcase-wide opacity-0" aria-hidden="true">
						<div class="sm-mock-widget">
							<div class="sm-mock-header">
								<span class="sm-mock-title">Team Channels</span>
								<span class="sm-mock-pill"># design-team</span>
							</div>
							<div class="sm-mock-chat">
								<div class="sm-mock-msg">
									<span class="sm-mock-avatar" style="background:#6366f1"></span>
									<div class="sm-mock-msg-body">
										<div class="sm-mock-msg-head">
											<span class="sm-mock-msg-name">Sarah K.</span>
											<span class="sm-mock-msg-time">10:32 AM</span>
										</div>
										<div class="sm-mock-msg-text">Uploaded the final brand assets for Acme. Ready for review!</div>
										<div class="sm-mock-reactions">
											<span class="sm-mock-reaction">&#128077; 3</span>
											<span class="sm-mock-reaction">&#128293; 1</span>
										</div>
									</div>
								</div>
								<div class="sm-mock-msg">
									<span class="sm-mock-avatar" style="background:#f59e0b"></span>
									<div class="sm-mock-msg-body">
										<div class="sm-mock-msg-head">
											<span class="sm-mock-msg-name">Mike R.</span>
											<span class="sm-mock-msg-time">10:34 AM</span>
										</div>
										<div class="sm-mock-msg-text">Looks great. Left a comment on the logo variant &mdash; can we try a darker version?</div>
										<div class="sm-mock-comment-thread">
											<div class="sm-mock-comment">
												<span class="sm-mock-comment-avatar" style="background:#6366f1"></span>
												<span class="sm-mock-comment-text"><strong>Sarah K.</strong> On it! Will push an update by EOD.</span>
											</div>
										</div>
									</div>
								</div>
								<div class="sm-mock-msg">
									<span class="sm-mock-avatar" style="background:#10b981"></span>
									<div class="sm-mock-msg-body">
										<div class="sm-mock-msg-head">
											<span class="sm-mock-msg-name">AI Assistant</span>
											<span class="sm-mock-msg-ai-badge">AI</span>
											<span class="sm-mock-msg-time">10:35 AM</span>
										</div>
										<div class="sm-mock-msg-text">Brand audit complete. Score: 94/100. All assets meet guidelines.</div>
									</div>
								</div>
							</div>
						</div>
					</div>
					<!-- Full-width: Gantt Chart -->
					<div class="sm-showcase-cell sm-showcase-wide opacity-0" aria-hidden="true">
						<div class="sm-mock-widget">
							<div class="sm-mock-header">
								<span class="sm-mock-title">Project Timeline</span>
								<span class="sm-mock-pill">Q2 2026</span>
							</div>
							<div class="sm-mock-gantt">
								<div class="sm-mock-gantt-header">
									<span></span>
									<span>Apr</span><span>May</span><span>Jun</span><span>Jul</span>
								</div>
								<div class="sm-mock-gantt-row">
									<span class="sm-mock-gantt-label">Brand Refresh</span>
									<div class="sm-mock-gantt-track"><div class="sm-mock-gantt-bar" style="left:0%;width:35%;background:var(--sm-text)"></div></div>
								</div>
								<div class="sm-mock-gantt-row">
									<span class="sm-mock-gantt-label">Website Redesign</span>
									<div class="sm-mock-gantt-track"><div class="sm-mock-gantt-bar" style="left:15%;width:50%;background:#52525b"></div></div>
								</div>
								<div class="sm-mock-gantt-row">
									<span class="sm-mock-gantt-label">Social Campaign</span>
									<div class="sm-mock-gantt-track"><div class="sm-mock-gantt-bar" style="left:30%;width:30%;background:#a1a1aa"></div></div>
								</div>
								<div class="sm-mock-gantt-row">
									<span class="sm-mock-gantt-label">Email Sequences</span>
									<div class="sm-mock-gantt-track"><div class="sm-mock-gantt-bar" style="left:45%;width:40%;background:#10b981"></div></div>
								</div>
								<div class="sm-mock-gantt-row">
									<span class="sm-mock-gantt-label">Launch Event</span>
									<div class="sm-mock-gantt-track"><div class="sm-mock-gantt-bar" style="left:75%;width:15%;background:var(--sm-text)"></div></div>
								</div>
							</div>
						</div>
					</div>
				<!-- Goals + Calendar row -->
					<div class="sm-showcase-cell sm-showcase-small opacity-0" aria-hidden="true">
						<div class="sm-mock-widget">
							<div class="sm-mock-header">
								<span class="sm-mock-title">Goals</span>
							</div>
							<div class="sm-hw-goals">
								<div class="sm-hw-goal"><span class="sm-hw-goal-label">Revenue Target</span><div class="sm-hw-goal-bar"><div class="sm-hw-goal-fill" style="width:72%"></div></div><span class="sm-hw-goal-pct">72%</span></div>
								<div class="sm-hw-goal"><span class="sm-hw-goal-label">New Clients</span><div class="sm-hw-goal-bar"><div class="sm-hw-goal-fill sm-hw-goal-done" style="width:100%"></div></div><span class="sm-hw-goal-pct">100%</span></div>
								<div class="sm-hw-goal"><span class="sm-hw-goal-label">Retention</span><div class="sm-hw-goal-bar"><div class="sm-hw-goal-fill" style="width:89%"></div></div><span class="sm-hw-goal-pct">89%</span></div>
							</div>
						</div>
					</div>
					<div class="sm-showcase-cell sm-showcase-small opacity-0" aria-hidden="true">
						<div class="sm-mock-widget">
							<div class="sm-mock-header">
								<span class="sm-mock-title">Invoicing</span>
								<span class="sm-mock-pill">3 pending</span>
							</div>
							<div class="sm-hw-invoices">
								<div class="sm-hw-inv-row"><span class="sm-hw-inv-name"></span><span class="sm-hw-inv-amt">$4,200</span><span class="sm-hw-inv-status sm-hw-inv-paid">Paid</span></div>
								<div class="sm-hw-inv-row"><span class="sm-hw-inv-name"></span><span class="sm-hw-inv-amt">$2,800</span><span class="sm-hw-inv-status sm-hw-inv-pending">Due</span></div>
								<div class="sm-hw-inv-row"><span class="sm-hw-inv-name"></span><span class="sm-hw-inv-amt">$1,600</span><span class="sm-hw-inv-status sm-hw-inv-paid">Paid</span></div>
							</div>
						</div>
					</div>
			<!-- Marketing Plan -->
					<div class="sm-showcase-cell sm-showcase-wide opacity-0" aria-hidden="true">
						<div class="sm-mock-widget">
							<div class="sm-mock-header"><span class="sm-mock-title">Marketing Plan</span><span class="sm-mock-pill">AI Generated</span></div>
							<div class="sm-mock-mktg">
								<div class="sm-mock-mktg-channels">
									<div class="sm-mock-mktg-ch"><span class="sm-mock-mktg-icon" style="background:#E4405F">IG</span><div class="sm-mock-mktg-info"><span class="sm-mock-mktg-name">Instagram</span><span class="sm-mock-mktg-cadence">3x/week</span></div></div>
									<div class="sm-mock-mktg-ch"><span class="sm-mock-mktg-icon" style="background:#0A66C2">in</span><div class="sm-mock-mktg-info"><span class="sm-mock-mktg-name">LinkedIn</span><span class="sm-mock-mktg-cadence">2x/week</span></div></div>
									<div class="sm-mock-mktg-ch"><span class="sm-mock-mktg-icon" style="background:var(--sm-text)">@</span><div class="sm-mock-mktg-info"><span class="sm-mock-mktg-name">Email</span><span class="sm-mock-mktg-cadence">Weekly newsletter</span></div></div>
								</div>
								<div class="sm-mock-mktg-timeline">
									<div class="sm-mock-mktg-week"><span class="sm-mock-mktg-wk-label">Wk 1</span><div class="sm-mock-mktg-wk-bar" style="width:100%"></div></div>
									<div class="sm-mock-mktg-week"><span class="sm-mock-mktg-wk-label">Wk 2</span><div class="sm-mock-mktg-wk-bar" style="width:85%"></div></div>
									<div class="sm-mock-mktg-week"><span class="sm-mock-mktg-wk-label">Wk 3</span><div class="sm-mock-mktg-wk-bar" style="width:70%"></div></div>
									<div class="sm-mock-mktg-week"><span class="sm-mock-mktg-wk-label">Wk 4</span><div class="sm-mock-mktg-wk-bar" style="width:60%"></div></div>
								</div>
							</div>
						</div>
					</div>
					<!-- CRM + Team row -->
					<div class="sm-showcase-cell sm-showcase-small opacity-0" aria-hidden="true">
						<div class="sm-mock-widget">
							<div class="sm-mock-header"><span class="sm-mock-title">CRM Intelligence</span></div>
							<div class="sm-hw-crm">
								<div class="sm-hw-crm-contact"><span class="sm-hw-contact-dot" style="background:#6366f1;margin:0"></span><div class="sm-hw-crm-info"><span class="sm-hw-crm-name">Acme Corp</span><span class="sm-hw-crm-stage">Proposal &middot; Score 92</span></div><span class="sm-hw-crm-val">$12k</span></div>
								<div class="sm-hw-crm-contact"><span class="sm-hw-contact-dot" style="background:#f59e0b;margin:0"></span><div class="sm-hw-crm-info"><span class="sm-hw-crm-name">Nova Labs</span><span class="sm-hw-crm-stage">Follow-up &middot; Score 67</span></div><span class="sm-hw-crm-val">$8k</span></div>
								<div class="sm-hw-crm-contact"><span class="sm-hw-contact-dot" style="background:#10b981;margin:0"></span><div class="sm-hw-crm-info"><span class="sm-hw-crm-name">Bright Studio</span><span class="sm-hw-crm-stage">Active &middot; Score 88</span></div><span class="sm-hw-crm-val">$6k</span></div>
								<div class="sm-hw-crm-health"><span class="sm-hw-crm-health-label">Pipeline Health</span><div class="sm-hw-goal-bar"><div class="sm-hw-goal-fill" style="width:82%"></div></div></div>
							</div>
						</div>
					</div>
					<div class="sm-showcase-cell sm-showcase-small opacity-0" aria-hidden="true">
						<div class="sm-mock-widget">
							<div class="sm-mock-header"><span class="sm-mock-title">Team</span><span class="sm-mock-pill">6 members</span></div>
							<div class="sm-hw-team">
								<div class="sm-hw-team-member"><span class="sm-hw-contact-dot" style="background:#6366f1;margin:0"></span><span class="sm-hw-team-name">Sarah Kim</span><span class="sm-hw-team-status" style="background:#10b981"></span></div>
								<div class="sm-hw-team-member"><span class="sm-hw-contact-dot" style="background:#f59e0b;margin:0"></span><span class="sm-hw-team-name">Mike Rodriguez</span><span class="sm-hw-team-status" style="background:#10b981"></span></div>
								<div class="sm-hw-team-member"><span class="sm-hw-contact-dot" style="background:#ec4899;margin:0"></span><span class="sm-hw-team-name">Jess Turner</span><span class="sm-hw-team-status" style="background:#a1a1aa"></span></div>
								<div class="sm-hw-team-member"><span class="sm-hw-contact-dot" style="background:#10b981;margin:0"></span><span class="sm-hw-team-name">Alex Chen</span><span class="sm-hw-team-status" style="background:#10b981"></span></div>
							</div>
						</div>
					</div>
					<!-- Scheduler -->
					<div class="sm-showcase-cell sm-showcase-wide opacity-0" aria-hidden="true">
						<div class="sm-mock-widget">
							<div class="sm-mock-header"><span class="sm-mock-title">Scheduler</span><span class="sm-mock-pill">This week</span></div>
							<div class="sm-mock-scheduler">
								<div class="sm-mock-sched-day"><span class="sm-mock-sched-label">Mon</span><div class="sm-mock-sched-slots"><div class="sm-mock-sched-event sm-mock-sched-meeting">Team standup<span>9 AM</span></div><div class="sm-mock-sched-event sm-mock-sched-task">Client review<span>2 PM</span></div></div></div>
								<div class="sm-mock-sched-day"><span class="sm-mock-sched-label">Tue</span><div class="sm-mock-sched-slots"><div class="sm-mock-sched-event sm-mock-sched-call">Sales call — Acme<span>10:30 AM</span></div></div></div>
								<div class="sm-mock-sched-day sm-mock-sched-today"><span class="sm-mock-sched-label">Wed</span><div class="sm-mock-sched-slots"><div class="sm-mock-sched-event sm-mock-sched-meeting">Design review<span>11 AM</span></div><div class="sm-mock-sched-event sm-mock-sched-task">Send proposal<span>3 PM</span></div></div></div>
								<div class="sm-mock-sched-day"><span class="sm-mock-sched-label">Thu</span><div class="sm-mock-sched-slots"><div class="sm-mock-sched-event sm-mock-sched-call">Onboarding — Nova<span>9 AM</span></div></div></div>
								<div class="sm-mock-sched-day"><span class="sm-mock-sched-label">Fri</span><div class="sm-mock-sched-slots"><div class="sm-mock-sched-event sm-mock-sched-meeting">Sprint retro<span>4 PM</span></div></div></div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</section>

		<!-- ─── Quote ─── -->
		<div class="sm-quote">
			<div class="sm-quote-mark" aria-hidden="true">&ldquo;</div>
			<p class="sm-quote-text opacity-0">
				&ldquo;Design is so simple. That&rsquo;s why it is so <em>complicated.</em>&rdquo;
			</p>
			<p class="sm-quote-attr opacity-0">&mdash; Paul Rand</p>
			<p class="sm-quote-earnest opacity-0">
				<strong><span class="sm-brand">Earnest</span></strong> applies the same standard for your business<span class="sm-accent-dot">.</span>
			</p>
		</div>

		<!-- ─── Calculator ─── -->
		<section ref="calcRef" class="sm-calc">
			<div class="sm-calc-header">
				<h2 class="sm-calc-title opacity-0">
					What are you <em>spending</em> today<span class="sm-accent-dot">?</span>
				</h2>
				<p class="sm-calc-sub opacity-0">Drag to see how <span class="sm-brand">Earnest</span> compares to your current tool stack.</p>
			</div>
			<div class="sm-calc-widget opacity-0">
				<div class="sm-calc-row">
					<label class="sm-calc-label">
						<span>Number of tools</span>
						<span class="sm-calc-value">{{ toolCount }}</span>
					</label>
					<input type="range" :min="3" :max="15" v-model.number="toolCount" class="sm-range" />
				</div>
				<div class="sm-calc-row">
					<label class="sm-calc-label">
						<span>Avg. cost per tool</span>
						<span class="sm-calc-value">${{ avgToolCost }}/mo</span>
					</label>
					<input type="range" :min="10" :max="100" :step="5" v-model.number="avgToolCost" class="sm-range" />
				</div>
				<div class="sm-calc-result">
					<div class="sm-calc-current">
						<span class="sm-calc-result-label">Current stack</span>
						<span class="sm-calc-amount">${{ currentStackCost }}<small>/mo</small></span>
					</div>
					<div class="sm-calc-arrow">&rarr;</div>
					<div class="sm-calc-earnest">
						<span class="sm-calc-result-label"><span class="sm-brand">Earnest</span> Studio</span>
						<span class="sm-calc-amount sm-calc-amount-accent">$149<small>/mo</small></span>
					</div>
				</div>
				<div class="sm-calc-savings" v-if="savings > 0">
					You save <strong>${{ savings }}/mo</strong> &mdash; that&rsquo;s <strong>${{ savings * 12 }}/yr</strong> back in your pocket.
				</div>
				<div class="sm-calc-savings sm-calc-savings-muted" v-else>
					And you get connected AI intelligence that {{ toolCount }} separate tools can never provide.
				</div>
			</div>
		</section>

		<!-- ─── Token Costs ─── -->
		<section class="sm-tokens">
			<div class="sm-tokens-inner">
				<div class="sm-tokens-sidebar">
					<div class="sm-section-label sm-section-label-light opacity-0">AI transparency</div>
					<h3 class="sm-tokens-title opacity-0">Transparent AI costs<span class="sm-accent-dot">.</span></h3>
					<p class="sm-tokens-sub opacity-0">Every feature shows its token cost before you use it. No surprises.</p>
				</div>
				<div class="sm-tokens-body">
					<div class="sm-tokens-list">
						<div v-for="item in tokenCosts" :key="item.name" class="sm-token-row opacity-0">
							<span class="sm-token-name">{{ item.name }}</span>
							<span class="sm-token-cost">{{ item.tokens }}</span>
							<span class="sm-token-real">~{{ item.cost }}</span>
						</div>
					</div>
					<p class="sm-tokens-note opacity-0">
						Studio plan (400K tokens/mo) supports ~50 marketing reports or ~250 email drafts per month. Need more? Instant self-serve refills.
					</p>
				</div>
			</div>
		</section>

		<!-- ─── Testimonials ─── -->
		<section ref="testimonialsRef" v-if="testimonials.length" class="sm-testimonials">
			<h3 class="sm-testimonials-title opacity-0">What people are saying<span class="sm-accent-dot">.</span></h3>
			<div class="sm-testimonials-grid">
				<div v-for="t in testimonials" :key="t.id" class="sm-testimonial ios-card opacity-0">
					<p class="sm-testimonial-quote">&ldquo;{{ t.quote }}&rdquo;</p>
					<div class="sm-testimonial-author">
						<img v-if="t.avatarUrl" :src="t.avatarUrl" :alt="t.name" loading="lazy" class="sm-testimonial-avatar" />
						<div>
							<div class="sm-testimonial-name">{{ t.name }}</div>
							<div class="sm-testimonial-role">{{ t.role }}</div>
						</div>
					</div>
				</div>
			</div>
		</section>

		<!-- ─── Logo Carousel ─── -->
		<section v-if="logos.length" class="sm-logos">
			<p class="sm-logos-label opacity-0">Trusted by</p>
			<div class="sm-logos-track">
				<div class="sm-logos-scroll">
					<img v-for="(logo, i) in [...logos, ...logos]" :key="i" :src="logo.url" :alt="logo.name" class="sm-logo-img" />
				</div>
			</div>
		</section>

		<!-- ─── Pricing ─── -->
		<section ref="pricingRef" id="pricing" class="sm-pricing">
			<div class="sm-pricing-header">
				<h2 class="sm-pricing-title opacity-0">
					<em>Honest</em> pricing<span class="sm-accent-dot">.</span><br />
					No surprises<span class="sm-accent-dot">.</span>
				</h2>
				<p class="sm-pricing-sub opacity-0">
					One price. Your whole team. Cancel any time &mdash; we'd rather earn your business than trap it.
				</p>
			</div>
			<div class="sm-plans-grid">
				<div v-for="(plan, index) in plans" :key="index" class="sm-plan opacity-0" :class="{ 'sm-plan-featured': plan.featured }">
					<div v-if="plan.featured" class="sm-plan-badge">Most popular</div>
					<div class="sm-plan-name">{{ plan.name }}</div>
					<div class="sm-plan-price">
						<sup>$</sup>{{ plan.price }}<span>/mo</span>
					</div>
					<div class="sm-plan-desc">{{ plan.desc }}</div>
					<ul class="sm-plan-features">
						<li v-for="(feat, fi) in plan.features" :key="fi">
							<UIcon name="i-lucide-check" class="sm-plan-check" />
							{{ feat }}
						</li>
					</ul>
					<button class="sm-plan-btn" :class="{ 'sm-plan-btn-accent': plan.featured }" @click="showComingSoon = true">
						{{ plan.cta.label }}
					</button>
				</div>
			</div>
		</section>

		<!-- ─── Footer ─── -->
		<footer class="sm-footer">
			<div class="sm-footer-inner">
				<span class="sm-footer-copy">&copy; {{ new Date().getFullYear() }} <span class="sm-brand">Earnest</span></span>
				<nav class="sm-footer-links">
					<nuxt-link to="/privacy-policy">Privacy Policy</nuxt-link>
					<nuxt-link to="/terms-of-service">Terms of Service</nuxt-link>
				</nav>
			</div>
		</footer>
		<!-- ─── Coming Soon Dialog ─── -->
		<Dialog :open="showComingSoon" @update:open="(v) => { showComingSoon = v; if (!v) resetComingSoon(); }">
			<DialogContent class="sm-coming-soon-dialog">
				<template v-if="!comingSoonSuccess">
					<DialogHeader>
						<DialogTitle class="sm-cs-title">Coming soon<span class="sm-accent-dot">.</span></DialogTitle>
						<DialogDescription class="sm-cs-desc">
							We are preparing to launch by May of 2026. Join the list to stay updated. <UIcon name="i-lucide-rocket" class="sm-cs-rocket" />
						</DialogDescription>
					</DialogHeader>
					<form class="sm-cs-form" @submit.prevent="submitComingSoon">
						<input
							v-model="comingSoonName"
							type="text"
							placeholder="Your name"
							class="sm-cs-input"
							autocomplete="name"
						/>
						<input
							v-model="comingSoonEmail"
							type="email"
							placeholder="Email address"
							class="sm-cs-input"
							autocomplete="email"
						/>
						<p v-if="comingSoonError" class="sm-cs-error">{{ comingSoonError }}</p>
						<button type="submit" class="sm-btn-primary sm-cs-submit" :disabled="comingSoonSubmitting">
							{{ comingSoonSubmitting ? 'Joining...' : 'Stay updated' }}
						</button>
					</form>
				</template>
				<template v-else>
					<div class="sm-cs-success">
						<UIcon name="i-lucide-check-circle" class="sm-cs-success-icon" />
						<h3 class="sm-cs-title">You're on the list<span class="sm-accent-dot">.</span></h3>
						<p class="sm-cs-desc">We'll let you know when <span class="sm-brand">Earnest</span> is ready.</p>
						<button class="sm-btn-ghost sm-cs-close" @click="showComingSoon = false; resetComingSoon()">Close</button>
					</div>
				</template>
			</DialogContent>
		</Dialog>
	</div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import '~/assets/css/sellsheet-modern.css';

gsap.registerPlugin(ScrollTrigger);

// ── Refs ──
const heroRef = ref(null);
const truthRef = ref(null);
const aiRef = ref(null);
const featuresRef = ref(null);
const pricingRef = ref(null);
const replacesRef = ref(null);
const heroCycleRef = ref(null);
const calcRef = ref(null);
const showcaseRef = ref(null);
const testimonialsRef = ref(null);

// ── Scroll-aware nav ──
const navScrolled = ref(false);
const hoveredOrbit = ref(-1);
const orbitAutoActive = ref(true);
let orbitInterval = null;
let orbitResumeTimeout = null;

function startOrbitAutoRotate() {
	if (orbitInterval) return;
	orbitAutoActive.value = true;
	let idx = 0;
	orbitInterval = setInterval(() => {
		if (!orbitAutoActive.value) return;
		hoveredOrbit.value = idx;
		idx = (idx + 1) % replacedTools.length;
	}, 2000);
}

function pauseOrbitAutoRotate() {
	orbitAutoActive.value = false;
	if (orbitResumeTimeout) clearTimeout(orbitResumeTimeout);
}

function resumeOrbitAutoRotate() {
	if (orbitResumeTimeout) clearTimeout(orbitResumeTimeout);
	orbitResumeTimeout = setTimeout(() => {
		orbitAutoActive.value = true;
	}, 3000);
}

const expandedFeature = ref(-1);

// ── Coming Soon dialog ──
const showComingSoon = ref(false);
const comingSoonName = ref('');
const comingSoonEmail = ref('');
const comingSoonSubmitting = ref(false);
const comingSoonSuccess = ref(false);
const comingSoonError = ref('');

async function submitComingSoon() {
	comingSoonError.value = '';
	if (!comingSoonName.value.trim() || !comingSoonEmail.value.trim()) {
		comingSoonError.value = 'Please fill in both fields.';
		return;
	}
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(comingSoonEmail.value)) {
		comingSoonError.value = 'Please enter a valid email address.';
		return;
	}
	comingSoonSubmitting.value = true;
	try {
		const contacts = useDirectusItems('contacts');
		const contact = await contacts.create({
			first_name: comingSoonName.value.trim(),
			email: comingSoonEmail.value.trim(),
			source: 'sellsheet-coming-soon',
			email_subscribed: true,
			status: 'published',
		});
		if (contact?.id) {
			const listContacts = useDirectusItems('mailing_list_contacts');
			await listContacts.create({
				list_id: 1,
				contact_id: contact.id,
				subscribed: true,
			});
		}
		comingSoonSuccess.value = true;
	} catch (e) {
		comingSoonError.value = 'Something went wrong. Please try again.';
	} finally {
		comingSoonSubmitting.value = false;
	}
}

function resetComingSoon() {
	comingSoonName.value = '';
	comingSoonEmail.value = '';
	comingSoonSuccess.value = false;
	comingSoonError.value = '';
}
const aiChipTextRef = ref(null);
const aiChipTexts = [
	'AI analyzing 142 contacts...',
	'AI scanning revenue trends...',
	'AI drafting social posts...',
	'AI scoring CRM health...',
	'AI building marketing plan...',
	'AI generating email campaign...',
	'AI forecasting pipeline...',
	'AI suggesting goals...',
	'AI reviewing project timelines...',
	'AI composing newsletters...',
	'AI optimizing brand strategy...',
];
function onScroll() {
	navScrolled.value = window.scrollY > 80;
}

// ── A/B Testing ──
const { trackPageView, trackEvent } = useABTest();

// ── Calculator ──
const toolCount = ref(8);
const avgToolCost = ref(40);
const currentStackCost = computed(() => toolCount.value * avgToolCost.value);
const savings = computed(() => currentStackCost.value - 149);

// ── Token Costs ──
const tokenCosts = [
	{ name: 'AI chat reply', tokens: '~500', cost: '$0.001' },
	{ name: 'Social caption', tokens: '~600', cost: '$0.001' },
	{ name: 'Email draft', tokens: '~1,500', cost: '$0.004' },
	{ name: 'Card scan (vision)', tokens: '~2,500', cost: '$0.007' },
	{ name: 'CRM analysis', tokens: '~3,000', cost: '$0.008' },
	{ name: 'Command Center', tokens: '~5,000', cost: '$0.013' },
	{ name: 'Marketing plan', tokens: '~8K–15K', cost: '$0.03–0.06' },
];

// ── Directus data ──
const directusUrl = useRuntimeConfig().public.directusUrl || 'https://admin.earnest.guru';
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
		// Testimonials not available
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
		// Logos not available
	}
}

if (import.meta.client) {
	fetchTestimonials();
	fetchLogos();
}

// ── Content data ──
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
	{ label: 'Activity Timeline', icon: 'i-lucide-activity' },
	{ label: 'iCal Sync', icon: 'i-lucide-rss' },
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
	{ name: 'Calendly', replaces: 'CRM scheduling', icon: 'i-lucide-calendar' },
	{ name: 'HubSpot', replaces: 'Unified CRM', icon: 'i-lucide-users' },
	{ name: 'Lattice', replaces: 'Goal tracking', icon: 'i-lucide-target' },
	{ name: 'Isolated AI', replaces: 'AI assistant', icon: 'i-lucide-sparkles' },
];

const aiCapabilities = [
	{
		title: 'Connected intelligence',
		desc: 'Every other platform analyzes its own data in isolation. EARNEST connects AI to your entire operation — people, companies, projects, revenue, conversations, campaigns, and goals — simultaneously. The result is insight no single-purpose tool can produce.',
	},
	{
		title: 'Brand awareness',
		desc: 'Set brand direction, goals, target audience, and positioning per client, per team, per organization. Every AI feature reads this context. Social posts, email campaigns, CRM strategies, and marketing plans all sound like your business — not a generic template.',
	},
	{
		title: 'Marketing intelligence',
		desc: 'Feed EARNEST a client. It reads their brand direction, pipeline stage, contact history, email and social performance, and stated goals — then generates a complete multi-channel marketing plan with email sequences, social cadence, content themes, KPIs, and a 4-week action calendar.',
	},
	{
		title: 'Productivity engine',
		desc: 'Scans every module in real time — tickets, projects, tasks, invoices, deals, channels, social, and goals — then surfaces prioritized actions instantly. No AI tokens. Pure algorithmic intelligence that loads the moment you open EARNEST.',
	},
];

const numberWords = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
const toolCountWord = computed(() => {
	const count = replacedTools.length;
	return numberWords[count] || String(count);
});

const features = [
	{ name: 'Productivity Engine', icon: 'i-lucide-zap', desc: 'Your command center. Scans tickets, projects, tasks, invoices, channels, social, deals, and goals — then surfaces prioritized actions, urgent items, and intelligent suggestions. No AI tokens needed — pure algorithmic intelligence that loads instantly every time you open Earnest.' },
	{ name: 'CRM Intelligence', icon: 'i-lucide-scan-search', desc: 'AI reads across your entire business — contacts, clients, projects, tickets, invoices, deals, and goals — then generates health scores, pipeline forecasts, growth plans, and contact strategies tailored to your brand positioning and objectives.' },
	{ name: 'Health Snapshots', icon: 'i-lucide-activity', desc: 'Instant CRM and marketing health scores computed from your real data — no AI tokens, no waiting. Algorithmic analysis of contacts, revenue trends, overdue items, and pipeline health gives you a live pulse on your business the moment you open the dashboard.' },
	{ name: 'Marketing AI Analyze', icon: 'i-lucide-bar-chart-3', desc: 'AI scans your entire business — contacts, social, email, clients, revenue — and returns a marketing health score, actionable insights, and multi-channel campaign plans. Analyze for a specific client or your whole organization. One click.' },
	{ name: 'AI Strategy Engine', icon: 'i-lucide-brain', desc: 'Your data becomes your strategist. AI connects the dots across every module to generate campaigns, spot opportunities, and surface insights no isolated tool can see.' },
	{ name: 'Brand Awareness AI', icon: 'i-lucide-palette', desc: 'Set brand direction, goals, target audience, and location per client. Every AI feature — from CRM analysis to social posts to email campaigns — uses this context to generate suggestions aligned with your positioning. Not generic advice. Your brand, your voice, your market.' },
	{ name: 'Social AI Generate', icon: 'i-lucide-sparkles', desc: 'Schedule to Instagram, LinkedIn, Facebook, and Threads. AI generates platform-optimized posts, hashtags, and image suggestions — all informed by your brand direction and target audience — in seconds.' },
	{ name: 'Email Marketing AI', icon: 'i-lucide-mail', desc: 'Block-based newsletter builder with AI-powered content generation. Describe your email and get a complete template — subject line, sections, images, and copy — all tuned to your brand voice and audience.' },
	{ name: 'Goal Suggestions', icon: 'i-lucide-target', desc: 'AI suggests strategic goals based on your actual data, brand direction, and business objectives — financial, networking, performance, marketing, or custom. Track progress with periodic snapshots and let the productivity engine factor your goals into daily priorities.' },
	{ name: 'Project Management', icon: 'i-lucide-folder-kanban', desc: "Kanban boards, task lists, timelines, file attachments, and a command-center project dashboard with stats, document uploads, invoices, and activity feeds. Your team always knows what's next." },
	{ name: 'People & Companies', icon: 'i-lucide-building-2', desc: 'Every person and company in one unified CRM — clients, contacts, prospects, and networking connections from CardDesk. Brand context, goals, services, and the full history of every conversation and project.' },
	{ name: 'Quick Tasks & AI To-Dos', icon: 'i-lucide-check-square', desc: 'Personal task lists with AI-powered suggestions, day and week scheduling, motivational progress tracking, and confetti celebrations. AI generates task ideas based on your workload and brand context so nothing falls through the cracks.' },
	{ name: 'AI Token Management', icon: 'i-lucide-coins', desc: 'Admins control AI usage per member — set monthly budgets, toggle access on and off, monitor usage across the team. Purchase token add-on packages when you need more. Full visibility into who uses what.' },
	{ name: 'Client Access Control', icon: 'i-lucide-shield-check', desc: 'Role-based client visibility with team assignments and individual overrides. Owners and admins see everything. Managers and members see only the clients assigned to their teams — plus any individual access grants.' },
	{ name: 'Invoicing & Billing', icon: 'i-lucide-receipt', desc: 'Stripe-powered invoices, proposals, payment tracking, and PDF generation. Get paid on time.' },
	{ name: 'Team Channels', icon: 'i-lucide-message-square', desc: "Slack-style messaging built into your workspace. Conversations stay with the work they're about." },
	{ name: 'Phone & Video', icon: 'i-lucide-video', desc: 'Twilio-powered calling and Daily.co video meetings linked to your CRM pipeline. Click-to-call contacts, record calls, host team video, and auto-log meetings as lead activities — all without leaving Earnest.' },
	{ name: 'Calendar & CRM Hub', icon: 'i-lucide-calendar', desc: 'Calendar-first scheduling with meetings, follow-ups, and lead touchpoints on one view. Link meetings to your pipeline, auto-log CRM activities, and schedule directly from lead profiles. Google/Outlook sync, iCal feeds, public booking pages, and Daily.co video built in.' },
	{ name: 'CardDesk', icon: 'i-lucide-credit-card', desc: 'Turn every business card and networking event into a CRM relationship. Scan cards with AI vision, track follow-ups, and gamify your networking with XP, levels, and badges.' },
	{ name: 'Earnest Companion (E\u00B2)', icon: 'i-lucide-smartphone', desc: 'Your business in your pocket. Tasks, messages, contacts, and AI on the go — a mobile-first companion that keeps you connected to everything in Earnest.' },
];

const plans = [
	{
		name: 'Solo',
		price: '49',
		desc: 'For the one-person shop doing serious work.',
		featured: false,
		features: ['1 team seat', 'Every feature included', 'Projects, tickets & invoicing', 'CRM, social & email marketing', 'AI Command Center & Intelligence', 'CardDesk & Companion apps', '5 client portal seats', '100K AI tokens/month', '25 card scans/month'],
		cta: { label: 'Get started', to: '/register' },
	},
	{
		name: 'Studio',
		price: '149',
		desc: 'For the team that means business.',
		featured: true,
		features: ['8 team seats', 'Everything in Solo', 'Team channels & video meetings', 'AI Token Management', '15 client portal seats', '400K AI tokens/month', '150 card scans/month', '$408/yr if billed annually'],
		cta: { label: 'Start free trial', to: '/register' },
	},
	{
		name: 'Agency',
		price: '299',
		desc: 'For the business that has grown into something real.',
		featured: false,
		features: ['15 team seats', 'Everything in Studio', 'Unlimited client portal seats', 'Priority support + onboarding call', '1M AI tokens/month', '500 card scans/month', '$2,491/yr if billed annually'],
		cta: { label: 'Talk to us', to: '/register' },
	},
];

// ── GSAP ──
let ctx;

onMounted(() => {
	window.addEventListener('scroll', onScroll, { passive: true });
	onScroll();
	startOrbitAutoRotate();

	ctx = gsap.context(() => {
		// Hero timeline
		const heroTl = gsap.timeline({ delay: 0.3 });
		heroTl
			.fromTo('.sm-hero-kicker', { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.7, ease: 'power3.out' })
			.fromTo('.sm-hero-wordmark', { opacity: 0, y: 24, scale: 0.96 }, { opacity: 1, y: 0, scale: 1, duration: 0.9, ease: 'power3.out' }, '-=0.4')
			.fromTo('.sm-hero-period', { opacity: 0, y: -20 }, { opacity: 1, y: 0, duration: 0.5, ease: 'back.out(1.5)' }, '-=0.3')
			.fromTo('.sm-hero-tagline', { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.7, ease: 'power3.out' }, '-=0.3')
			.fromTo('.sm-hero-sub', { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.7, ease: 'power3.out' }, '-=0.4')
			.fromTo('.sm-hero-actions', { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.7, ease: 'power3.out' }, '-=0.4')
		// Hero background widgets — subtle entrance, gentle float
		const hwEls = document.querySelectorAll('.sm-hw');
		hwEls.forEach((el, i) => {
			gsap.fromTo(el,
				{ opacity: 0, y: 10 },
				{ opacity: 1, y: 0, duration: 0.6, ease: 'power2.out', delay: 0.4 + (i * 0.1) }
			);
			gsap.to(el, {
				y: `random(-5, 5)`,
				duration: `random(6, 10)`,
				ease: 'sine.inOut',
				repeat: -1,
				yoyo: true,
				delay: i * 0.8,
			});
		});

		gsap.to('.sm-hero-widgets', {
			y: -60,
			scrollTrigger: { trigger: '.sm-hero', start: 'top top', end: 'bottom top', scrub: true },
		});

		// AI chip text cycler
		if (aiChipTextRef.value) {
			let aiIdx = 0;
			const aiInterval = setInterval(() => {
				if (!aiChipTextRef.value) return;
				aiIdx = (aiIdx + 1) % aiChipTexts.length;
				gsap.to(aiChipTextRef.value, {
					opacity: 0, duration: 0.25, ease: 'power2.in',
					onComplete: () => {
						if (!aiChipTextRef.value) return;
						aiChipTextRef.value.textContent = aiChipTexts[aiIdx];
						gsap.to(aiChipTextRef.value, { opacity: 1, duration: 0.25, ease: 'power2.out' });
					}
				});
			}, 3000);
			onUnmounted(() => clearInterval(aiInterval));
		}

		// Word cycler
		if (heroCycleRef.value) {
			const wrap = heroCycleRef.value.parentElement;
			wrap.style.width = heroCycleRef.value.offsetWidth + 'px';

			const cycleTl = gsap.timeline({ delay: 2.5, repeat: -1, repeatDelay: 4 });
			cycleWords.forEach((word, i) => {
				if (i === 0) return;
				const isLastWord = i === cycleWords.length - 1;
				cycleTl
					.to(heroCycleRef.value, { opacity: 0, y: -12, duration: 0.2, ease: 'power2.in' })
					.call(() => {
						if (!heroCycleRef.value) return;
						heroCycleRef.value.textContent = word;
						gsap.to(wrap, { width: heroCycleRef.value.offsetWidth, duration: 0.2, ease: 'power2.out' });
					})
					.fromTo(heroCycleRef.value, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.3, ease: 'power2.out' })
					.to({}, { duration: isLastWord ? 2 : 0.8 });
			});
			onUnmounted(() => cycleTl.kill());
		}

		// Section reveal helper
		const reveal = (sectionRef, selector, opts = {}) => {
			if (!sectionRef.value) return;
			const els = sectionRef.value.querySelectorAll(selector);
			els.forEach((el, i) => {
				gsap.fromTo(
					el,
					{ opacity: 0, y: 30, ...(opts.from || {}) },
					{
						opacity: 1,
						y: 0,
						...(opts.to || {}),
						duration: opts.duration || 0.6,
						ease: opts.ease || 'power3.out',
						scrollTrigger: { trigger: el, start: opts.start || 'top 88%', toggleActions: 'play none none none' },
						delay: i * (opts.stagger || 0.08),
					},
				);
			});
		};

		// Reveal all sections
		reveal(replacesRef, '.sm-kicker, .sm-orbit-ring, .sm-replaces-cta');
		reveal(truthRef, '.sm-section-label, .sm-truth-title, .sm-truth-text, .sm-truth-visual');
		// Insight cards (inside truth body)
		reveal(truthRef, '.sm-truth-card', { stagger: 0.08 });
		reveal(aiRef, '.sm-ai-headline, .sm-ai-lede, .sm-ai-card', { from: { scale: 0.97 }, to: { scale: 1 } });
		// Header elements — staggered as a group
		reveal(featuresRef, '.sm-section-label, .sm-features-big, .sm-features-title, .sm-features-sub, .sm-features-count', { start: 'top 95%', stagger: 0.08 });
		// Accordion items — each triggers individually when it enters viewport, no stagger
		// Accordion items — each triggers individually, fast and smooth
		if (featuresRef.value) {
			featuresRef.value.querySelectorAll('.sm-feature-accordion').forEach((el) => {
				gsap.fromTo(el,
					{ opacity: 0, y: 10 },
					{ opacity: 1, y: 0, duration: 0.25, ease: 'power2.out',
						scrollTrigger: { trigger: el, start: 'top 99%', toggleActions: 'play none none none' }
					}
				);
			});
		}

		// Parallax background charts
		// Truth chart is sticky — no GSAP parallax needed
		// Features chart is sticky — no GSAP parallax needed
		gsap.to('.sm-parallax-ai', {
			y: -50,
			scrollTrigger: { trigger: '.sm-ai', start: 'top bottom', end: 'bottom top', scrub: true },
		});

		// Showcase
		reveal(showcaseRef, '.sm-kicker, .sm-showcase-title', { stagger: 0.08 });
		reveal(showcaseRef, '.sm-showcase-cell', { stagger: 0, duration: 0.4, start: 'top 95%' });

		// Quote
		gsap.fromTo('.sm-quote-text', { opacity: 0, y: 24, scale: 0.98 }, { opacity: 1, y: 0, scale: 1, duration: 0.7, ease: 'power3.out', scrollTrigger: { trigger: '.sm-quote', start: 'top 88%' } });
		gsap.fromTo('.sm-quote-attr', { opacity: 0 }, { opacity: 1, duration: 0.6, ease: 'power3.out', scrollTrigger: { trigger: '.sm-quote', start: 'top 88%' }, delay: 0.15 });
		gsap.fromTo('.sm-quote-earnest', { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.6, ease: 'power3.out', scrollTrigger: { trigger: '.sm-quote', start: 'top 88%' }, delay: 0.3 });

		// Calculator, tokens, testimonials, logos, pricing
		reveal(calcRef, '.sm-calc-title, .sm-calc-sub, .sm-calc-widget');
		reveal({ value: document.querySelector('.sm-tokens') }, '.sm-section-label-light, .sm-tokens-title, .sm-tokens-sub, .sm-token-row, .sm-tokens-note', { start: 'top 98%', stagger: 0, duration: 0.3, from: { y: 12 } });
		if (testimonialsRef.value) reveal(testimonialsRef, '.sm-testimonials-title, .sm-testimonial');
		reveal({ value: document.querySelector('.sm-logos') }, '.sm-logos-label');
		reveal(pricingRef, '.sm-pricing-title, .sm-pricing-sub, .sm-plan');

		trackPageView('sellsheet-modern');
	});
});

onUnmounted(() => {
	window.removeEventListener('scroll', onScroll);
	if (ctx) ctx.revert();
	if (orbitInterval) clearInterval(orbitInterval);
	if (orbitResumeTimeout) clearTimeout(orbitResumeTimeout);
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

