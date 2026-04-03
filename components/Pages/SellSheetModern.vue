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
					<nuxt-link to="/register" class="sm-btn-primary">Start for free</nuxt-link>
					<a href="#features" class="sm-btn-ghost">See how it works</a>
				</div>
			</div>
			<!-- Floating glass cards (desktop only) -->
			<!-- Orbiting Widget Cloud -->
			<div class="sm-orbit-cloud" aria-hidden="true">
				<!-- Widget 1: Revenue sparkline -->
				<div class="sm-orbit sm-orbit-1 opacity-0">
					<div class="sm-float-card glass-thin">
						<div class="sm-float-header">
							<span class="sm-float-label">Revenue</span>
							<span class="sm-float-trend sm-float-trend-up">+12%</span>
						</div>
						<div class="sm-float-big">$24.8k</div>
						<svg class="sm-float-spark" viewBox="0 0 100 24" fill="none">
							<path d="M0,20 L12,17 L25,19 L38,13 L50,15 L63,9 L75,6 L88,8 L100,3" stroke="var(--sm-text)" stroke-width="1.5" fill="none" stroke-linecap="round"/>
						</svg>
					</div>
				</div>
				<!-- Widget 2: Tasks -->
				<div class="sm-orbit sm-orbit-2 opacity-0">
					<div class="sm-float-card glass-thin">
						<div class="sm-float-header"><span class="sm-float-label">Tasks</span></div>
						<div class="sm-float-checks">
							<div class="sm-check"><span class="sm-check-box sm-check-done"></span><span class="sm-check-text">Brand audit</span></div>
							<div class="sm-check"><span class="sm-check-box sm-check-done"></span><span class="sm-check-text">Social campaign</span></div>
							<div class="sm-check"><span class="sm-check-box"></span><span class="sm-check-text">Email sequence</span></div>
						</div>
					</div>
				</div>
				<!-- Widget 3: Score -->
				<div class="sm-orbit sm-orbit-3 opacity-0">
					<div class="sm-float-card glass-thin sm-float-card-compact">
						<div class="sm-float-score">87</div>
						<div class="sm-float-score-label">Health</div>
					</div>
				</div>
				<!-- Widget 4: Mini pipeline -->
				<div class="sm-orbit sm-orbit-4 opacity-0">
					<div class="sm-float-card glass-thin sm-float-card-compact">
						<div class="sm-float-header"><span class="sm-float-label">Pipeline</span></div>
						<div class="sm-float-pipe">
							<div class="sm-float-pipe-bar" style="width:100%"></div>
							<div class="sm-float-pipe-bar" style="width:65%;opacity:0.6"></div>
							<div class="sm-float-pipe-bar" style="width:35%;opacity:0.3"></div>
						</div>
						<div class="sm-float-pipe-val">$84k</div>
					</div>
				</div>
				<!-- Widget 5: AI chip -->
				<div class="sm-orbit sm-orbit-5 opacity-0">
					<div class="sm-float-card glass-thin sm-float-card-compact">
						<div class="sm-float-ai-chip">
							<UIcon name="i-lucide-sparkles" style="width:12px;height:12px" />
							<span>AI analyzing 142 contacts...</span>
						</div>
					</div>
				</div>
			</div>
		</section>

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
			<div class="sm-replaces-grid">
				<div v-for="(tool, i) in replacedTools" :key="i" class="sm-replaces-card ios-card opacity-0">
					<UIcon :name="tool.icon" class="sm-replaces-icon" />
					<span class="sm-replaces-name">{{ tool.name }}</span>
					<span class="sm-replaces-for">{{ tool.replaces }}</span>
					<div class="sm-replaces-strike" aria-hidden="true"></div>
				</div>
			</div>
			<p class="sm-replaces-cta opacity-0">
				All of this. <strong>One login<span class="sm-accent-dot">.</span></strong>
			</p>
		</section>

		<!-- Parallax truth background (full-width, outside constrained section) -->
		<div class="sm-parallax-truth-wrap">
			<div class="sm-parallax-chart sm-parallax-truth" aria-hidden="true">
				<svg viewBox="0 0 600 200" fill="none" preserveAspectRatio="none">
					<path d="M0,180 C60,170 100,140 150,130 C200,120 230,125 280,100 C330,75 370,80 420,55 C470,30 520,40 560,25 C580,18 590,20 600,15" stroke="rgba(0,0,0,0.04)" stroke-width="2" fill="none" stroke-linecap="round"/>
					<path d="M0,180 C60,170 100,140 150,130 C200,120 230,125 280,100 C330,75 370,80 420,55 C470,30 520,40 560,25 C580,18 590,20 600,15 L600,200 L0,200Z" fill="rgba(0,0,0,0.015)"/>
					<path d="M0,190 C80,185 140,165 200,158 C260,150 300,155 360,135 C420,115 460,120 520,100 C560,88 580,90 600,82" stroke="rgba(0,0,0,0.025)" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-dasharray="4 4"/>
				</svg>
			</div>
		</div>
		<!-- ─── Truth ─── -->
		<section ref="truthRef" class="sm-truth">
			<div class="sm-truth-sidebar">
				<div class="sm-truth-label opacity-0">The honest case</div>
			</div>
			<div class="sm-truth-body">
				<h2 class="sm-truth-title opacity-0">
					Your business runs on {{ toolCountWord }} tools. It should run on
					<span class="sm-truth-highlight">one source of truth</span><span class="sm-accent-dot">.</span>
				</h2>
				<p class="sm-truth-text opacity-0">
					You have a project tool. An invoice tool. A social tool. A phone system. A shared inbox. A calendar. A goal
					tracker. And Slack to hold it all together. {{ toolCountWord }} tools. {{ toolCountWord }} logins. Zero
					collective knowledge.
				</p>
				<p class="sm-truth-text opacity-0">
					<strong>EARNEST replaces the pile.</strong>
					One platform, one login, one source of truth where the work actually lives &mdash; from the first conversation to the
					final payment. Nothing to integrate. Nothing to re-explain. Every page is an actionable experience &mdash; not a report you read, but a surface you work from.
				</p>
				<p class="sm-truth-text opacity-0">
					And because everything is in one place,
					<strong>AI can see the whole business</strong>
					&mdash; not just a slice of it. It reads your contacts, clients, projects, revenue, deals, goals, campaigns,
					and brand direction together, then connects the dots to build strategies, forecasts, and plans that no
					isolated tool can produce. Your marketing plan knows your pipeline. Your CRM analysis knows your brand voice.
					Your goal suggestions know your financials.
					<em>That</em> is the difference.
				</p>
				<p class="sm-truth-text opacity-0">
					Intuitive movement between every module. Financials surface who owes you money. Your CRM shows who needs attention. Goals show you one number &mdash; your progress &mdash; and what to do next. Two companion apps &mdash; CardDesk for networking and E&sup2; for mobile &mdash; keep everything connected on the go.
				</p>
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
					<!-- Gantt bars -->
					<rect x="40" y="30" width="280" height="18" rx="9" fill="rgba(255,255,255,0.06)"/>
					<rect x="120" y="87" width="360" height="18" rx="9" fill="rgba(255,255,255,0.04)"/>
					<rect x="200" y="144" width="240" height="18" rx="9" fill="rgba(255,255,255,0.05)"/>
					<rect x="320" y="201" width="300" height="18" rx="9" fill="rgba(255,255,255,0.03)"/>
					<rect x="80" y="258" width="200" height="18" rx="9" fill="rgba(255,255,255,0.04)"/>
					<rect x="440" y="315" width="260" height="18" rx="9" fill="rgba(255,255,255,0.05)"/>
					<rect x="520" y="372" width="180" height="18" rx="9" fill="rgba(255,255,255,0.03)"/>
					<!-- Dependency connectors -->
					<path d="M320,48 L320,60 L200,60 L200,87" stroke="rgba(255,255,255,0.04)" stroke-width="1" fill="none"/>
					<path d="M440,105 L440,120 L320,120 L320,144" stroke="rgba(255,255,255,0.04)" stroke-width="1" fill="none"/>
					<path d="M620,210 L620,240 L440,240 L440,258" stroke="rgba(255,255,255,0.04)" stroke-width="1" fill="none"/>
					<!-- Today marker -->
					<line x1="380" y1="0" x2="380" y2="400" stroke="rgba(0,191,255,0.08)" stroke-width="1.5" stroke-dasharray="6 4"/>
				</svg>
			</div>
			<div class="sm-ai-inner">
				<p class="sm-kicker sm-kicker-light opacity-0">What one platform makes possible</p>
				<h2 class="sm-ai-headline opacity-0">
					Your data talks<span class="sm-accent-dot">.</span><br />
					<span class="sm-ai-em">AI listens<span class="sm-accent-dot">.</span></span>
				</h2>
				<p class="sm-ai-lede opacity-0">
					Most tools bolt AI onto one channel. EARNEST gives AI the full picture &mdash; people, companies, projects,
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
			<div class="sm-features-header">
				<p class="sm-features-big opacity-0">Everything</p>
				<h2 class="sm-features-title opacity-0">
					your business needs<span class="sm-accent-dot">.</span><br />
					<em class="sm-features-em">Nothing</em> it doesn't<span class="sm-accent-dot">.</span>
				</h2>
				<p class="sm-features-sub opacity-0">Built for teams who are serious about their work<span class="sm-accent-dot">.</span></p>
			</div>
			<div class="sm-features-hero-grid">
				<div v-for="(f, i) in features.slice(0, 4)" :key="i" class="sm-feature-card sm-feature-hero ios-card opacity-0">
					<div class="sm-feature-top">
						<UIcon :name="f.icon" class="sm-feature-icon" />
						<span class="sm-feature-num">{{ String(i + 1).padStart(2, '0') }}</span>
					</div>
					<div class="sm-feature-name">{{ f.name }}</div>
					<div class="sm-feature-desc">{{ f.desc }}</div>
				</div>
			</div>
			<div class="sm-features-grid">
				<div v-for="(f, i) in features.slice(4)" :key="i + 4" class="sm-feature-card ios-card opacity-0">
					<div class="sm-feature-top">
						<UIcon :name="f.icon" class="sm-feature-icon" />
						<span class="sm-feature-num">{{ String(i + 5).padStart(2, '0') }}</span>
					</div>
					<div class="sm-feature-name">{{ f.name }}</div>
					<div class="sm-feature-desc">{{ f.desc }}</div>
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
				<strong>EARNEST</strong> applies the same standard for your business<span class="sm-accent-dot">.</span>
			</p>
		</div>

		<!-- ─── Calculator ─── -->
		<section ref="calcRef" class="sm-calc">
			<div class="sm-calc-header">
				<h2 class="sm-calc-title opacity-0">
					What are you <em>spending</em> today<span class="sm-accent-dot">?</span>
				</h2>
				<p class="sm-calc-sub opacity-0">Drag to see how Earnest compares to your current tool stack.</p>
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
						<span class="sm-calc-result-label">Earnest Studio</span>
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
				<h3 class="sm-tokens-title opacity-0">Transparent AI costs<span class="sm-accent-dot">.</span></h3>
				<p class="sm-tokens-sub opacity-0">Every feature shows its token cost before you use it. No surprises.</p>
				<div class="sm-tokens-grid">
					<div v-for="item in tokenCosts" :key="item.name" class="sm-token-card opacity-0">
						<div class="sm-token-name">{{ item.name }}</div>
						<div class="sm-token-cost">{{ item.tokens }}</div>
						<div class="sm-token-real">~{{ item.cost }}</div>
					</div>
				</div>
				<p class="sm-tokens-note opacity-0">
					Studio plan (400K tokens/mo) supports ~50 marketing reports or ~250 email drafts per month. Need more? Instant self-serve refills.
				</p>
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
					<nuxt-link :to="plan.cta.to" class="sm-plan-btn" :class="{ 'sm-plan-btn-accent': plan.featured }">
						{{ plan.cta.label }}
					</nuxt-link>
				</div>
			</div>
		</section>

		<!-- ─── Footer ─── -->
		<footer class="sm-footer">
			<div class="sm-footer-inner">
				<span class="sm-footer-copy">&copy; {{ new Date().getFullYear() }} Earnest</span>
				<nav class="sm-footer-links">
					<nuxt-link to="/privacy-policy">Privacy Policy</nuxt-link>
					<nuxt-link to="/terms-of-service">Terms of Service</nuxt-link>
				</nav>
			</div>
		</footer>
	</div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

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
			.fromTo('.sm-orbit', { opacity: 0, scale: 0.8 }, { opacity: 1, scale: 1, duration: 1, ease: 'power3.out', stagger: 0.12 }, '-=0.3');

		// Orbit widgets parallax
		document.querySelectorAll('.sm-orbit').forEach((el, i) => {
			gsap.to(el, {
				y: -30 - (i * 15),
				scrollTrigger: { trigger: '.sm-hero', start: 'top top', end: 'bottom top', scrub: true },
			});
		});

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
						heroCycleRef.value.textContent = word;
						gsap.to(wrap, { width: heroCycleRef.value.offsetWidth, duration: 0.2, ease: 'power2.out' });
					})
					.fromTo(heroCycleRef.value, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.3, ease: 'power2.out' })
					.to({}, { duration: isLastWord ? 2 : 0.8 });
			});
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
		reveal(replacesRef, '.sm-kicker, .sm-replaces-card, .sm-replaces-cta');
		reveal(truthRef, '.sm-truth-label, .sm-truth-title, .sm-truth-text');
		reveal(aiRef, '.sm-kicker-light, .sm-ai-headline, .sm-ai-lede, .sm-ai-card', { from: { scale: 0.97 }, to: { scale: 1 } });
		reveal(featuresRef, '.sm-features-big, .sm-features-title, .sm-features-sub, .sm-feature-card', { start: 'top 95%', stagger: 0.05 });

		// Parallax background charts
		gsap.to('.sm-parallax-truth', {
			y: -60,
			scrollTrigger: { trigger: '.sm-parallax-truth-wrap', start: 'top bottom', end: 'bottom top', scrub: true },
		});
		// Features chart is sticky — no GSAP parallax needed
		gsap.to('.sm-parallax-ai', {
			y: -50,
			scrollTrigger: { trigger: '.sm-ai', start: 'top bottom', end: 'bottom top', scrub: true },
		});

		// Showcase
		reveal(showcaseRef, '.sm-kicker, .sm-showcase-title, .sm-showcase-cell', { stagger: 0.1, from: { scale: 0.96 }, to: { scale: 1 } });

		// Quote
		gsap.fromTo('.sm-quote-text', { opacity: 0, y: 24, scale: 0.98 }, { opacity: 1, y: 0, scale: 1, duration: 0.7, ease: 'power3.out', scrollTrigger: { trigger: '.sm-quote', start: 'top 88%' } });
		gsap.fromTo('.sm-quote-attr', { opacity: 0 }, { opacity: 1, duration: 0.6, ease: 'power3.out', scrollTrigger: { trigger: '.sm-quote', start: 'top 88%' }, delay: 0.15 });
		gsap.fromTo('.sm-quote-earnest', { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.6, ease: 'power3.out', scrollTrigger: { trigger: '.sm-quote', start: 'top 88%' }, delay: 0.3 });

		// Calculator, tokens, testimonials, logos, pricing
		reveal(calcRef, '.sm-calc-title, .sm-calc-sub, .sm-calc-widget');
		reveal({ value: document.querySelector('.sm-tokens') }, '.sm-tokens-title, .sm-tokens-sub, .sm-token-card, .sm-tokens-note');
		if (testimonialsRef.value) reveal(testimonialsRef, '.sm-testimonials-title, .sm-testimonial');
		reveal({ value: document.querySelector('.sm-logos') }, '.sm-logos-label');
		reveal(pricingRef, '.sm-pricing-title, .sm-pricing-sub, .sm-plan');

		trackPageView('sellsheet-modern');
	});
});

onUnmounted(() => {
	window.removeEventListener('scroll', onScroll);
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
/* ═══════════════════════════════════════════
   SellSheetModern — Stripe × iOS
   ═══════════════════════════════════════════ */

.sell-modern {
	--sm-bg: #ffffff;
	--sm-bg-alt: #f7f7f8;
	--sm-dark: #0a0a0a;
	--sm-text: #0a0a0a;
	--sm-text-2: #52525b;
	--sm-muted: #a1a1aa;
	--sm-accent: #0a0a0a;
	--sm-accent-light: #f4f4f5;
	--sm-border: rgba(0, 0, 0, 0.06);
	--sm-pop: #00bfff;

	background: var(--sm-bg);
	color: var(--sm-text);
	font-family: var(--font-proxima-regular);
	-webkit-font-smoothing: antialiased;
	margin-top: 0;
	overflow-x: hidden;
}

.sm-accent-dot {
	color: var(--sm-pop);
	font-size: 1.2em;
	line-height: 0;
	margin-left: 0.02em;
}

/* ─── GLASS NAV ─── */
.sm-nav {
	position: fixed;
	top: 0;
	left: 0;
	right: 0;
	z-index: 50;
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 14px 28px;
	background: transparent;
	transition: background 0.35s cubic-bezier(0.16, 1, 0.3, 1),
		border-color 0.35s cubic-bezier(0.16, 1, 0.3, 1),
		backdrop-filter 0.35s cubic-bezier(0.16, 1, 0.3, 1);
	border-bottom: 1px solid transparent;
}
.sm-nav-scrolled {
	background: rgba(255, 255, 255, 0.82);
	backdrop-filter: saturate(180%) blur(20px);
	-webkit-backdrop-filter: saturate(180%) blur(20px);
	border-bottom-color: rgba(0, 0, 0, 0.06);
}
.sm-nav-brand {
	color: var(--sm-text);
	text-decoration: none;
	display: flex;
	flex-direction: column;
	align-items: flex-start;
	gap: 0;
	line-height: 1;
}
.sm-nav-tagline {
	font-family: var(--font-signature);
	font-size: 10px;
	color: var(--sm-muted);
	white-space: nowrap;
	margin-top: 2px;
}
.sm-nav-links {
	display: flex;
	gap: 32px;
}
@media (max-width: 700px) {
	.sm-nav-links { display: none; }
}
.sm-nav-link {
	font-size: 12px;
	font-weight: 500;
	text-transform: uppercase;
	letter-spacing: 0.1em;
	color: var(--sm-muted);
	text-decoration: none;
	transition: color 0.2s;
}
.sm-nav-link:hover { color: var(--sm-text); }
.sm-nav-signin {
	display: inline-flex;
	align-items: center;
	padding: 8px 24px;
	border: 1px solid var(--sm-border);
	border-radius: 100px;
	font-size: 12px;
	font-weight: 500;
	letter-spacing: 0.06em;
	text-transform: uppercase;
	color: var(--sm-text);
	text-decoration: none;
	transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}
.sm-nav-signin:hover {
	background: var(--sm-text);
	color: white;
	border-color: var(--sm-text);
}

/* ─── HERO ─── */
.sm-hero {
	min-height: 100svh;
	display: flex;
	align-items: center;
	justify-content: center;
	text-align: center;
	padding: 140px 24px 100px;
	position: relative;
	overflow: hidden;
}
.sm-hero-mesh {
	position: absolute;
	inset: 0;
	background:
		radial-gradient(ellipse at 20% 50%, rgba(0, 0, 0, 0.03), transparent 50%),
		radial-gradient(ellipse at 80% 20%, rgba(16, 185, 129, 0.04), transparent 50%),
		radial-gradient(ellipse at 50% 80%, rgba(0, 0, 0, 0.02), transparent 50%);
	background-size: 200% 200%;
	animation: meshDrift 20s ease-in-out infinite alternate;
}
@keyframes meshDrift {
	0% { background-position: 0% 0%; }
	50% { background-position: 100% 50%; }
	100% { background-position: 50% 100%; }
}
.sm-hero-content {
	position: relative;
	z-index: 1;
	max-width: 800px;
}
.sm-hero-kicker {
	font-size: 12px;
	font-weight: 500;
	text-transform: uppercase;
	letter-spacing: 0.14em;
	color: var(--sm-muted);
	margin-bottom: 40px;
}
.sm-hero-wordmark {
	font-family: var(--font-bauer-bodoni);
	font-size: clamp(64px, 16vw, 180px);
	font-weight: 400;
	letter-spacing: -0.02em;
	line-height: 0.9;
	color: var(--sm-text);
	white-space: nowrap;
}
.sm-hero-period {
	color: var(--sm-accent);
	display: inline-block;
}
.sm-hero-tagline {
	font-family: var(--font-signature);
	font-size: clamp(28px, 4.5vw, 50px);
	font-weight: 400;
	color: var(--sm-text-2);
	margin-top: 20px;
}
.sm-cycle-wrap {
	display: inline-block;
	position: relative;
	text-align: center;
	vertical-align: bottom;
}
.sm-cycle {
	display: inline-block;
	color: var(--sm-pop);
	vertical-align: bottom;
}
.sm-hero-sub {
	font-size: 15px;
	color: var(--sm-muted);
	margin-top: 16px;
	letter-spacing: 0.02em;
}
.sm-hero-actions {
	display: flex;
	gap: 14px;
	margin-top: 48px;
	justify-content: center;
	flex-wrap: wrap;
}

/* Buttons */
.sm-btn-primary {
	background: var(--sm-accent);
	color: white;
	border: none;
	padding: 14px 32px;
	border-radius: 100px;
	font-size: 14px;
	font-weight: 500;
	letter-spacing: 0.02em;
	cursor: pointer;
	transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
	text-decoration: none;
}
.sm-btn-primary:hover {
	transform: translateY(-1px);
	box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
}
.sm-btn-ghost {
	background: transparent;
	color: var(--sm-muted);
	border: 1px solid var(--sm-border);
	padding: 14px 32px;
	border-radius: 100px;
	font-size: 14px;
	font-weight: 500;
	letter-spacing: 0.02em;
	cursor: pointer;
	transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
	text-decoration: none;
}
.sm-btn-ghost:hover {
	border-color: var(--sm-text);
	color: var(--sm-text);
}

/* Orbiting widget cloud */
.sm-orbit-cloud {
	position: absolute;
	inset: 0;
	z-index: 2;
	pointer-events: none;
}
@media (max-width: 1100px) {
	.sm-orbit-cloud { display: none; }
}
.sm-orbit {
	position: absolute;
}
.sm-orbit-1 {
	left: 3%;
	top: 38%;
	animation: smDrift1 8s ease-in-out infinite alternate;
}
.sm-orbit-2 {
	right: 4%;
	top: 28%;
	animation: smDrift2 9s ease-in-out infinite alternate;
}
.sm-orbit-3 {
	left: 8%;
	top: 18%;
	animation: smDrift3 7s ease-in-out infinite alternate;
}
.sm-orbit-4 {
	right: 6%;
	top: 62%;
	animation: smDrift4 10s ease-in-out infinite alternate;
}
.sm-orbit-5 {
	left: 15%;
	top: 72%;
	animation: smDrift5 8.5s ease-in-out infinite alternate;
}
@keyframes smDrift1 { 0% { transform: translate(0, 0); } 100% { transform: translate(12px, -18px); } }
@keyframes smDrift2 { 0% { transform: translate(0, 0); } 100% { transform: translate(-15px, 12px); } }
@keyframes smDrift3 { 0% { transform: translate(0, 0); } 100% { transform: translate(8px, 14px); } }
@keyframes smDrift4 { 0% { transform: translate(0, 0); } 100% { transform: translate(-10px, -16px); } }
@keyframes smDrift5 { 0% { transform: translate(0, 0); } 100% { transform: translate(14px, -8px); } }
.sm-float-card {
	padding: 20px 24px;
	border-radius: 20px;
	border: 1px solid rgba(0, 0, 0, 0.06);
	box-shadow: 0 8px 32px rgba(0, 0, 0, 0.06);
	min-width: 180px;
}
.sm-float-header {
	display: flex;
	justify-content: space-between;
	align-items: center;
	margin-bottom: 8px;
}
.sm-float-label {
	font-size: 10px;
	font-weight: 600;
	text-transform: uppercase;
	letter-spacing: 0.1em;
	color: var(--sm-muted);
}
.sm-float-trend {
	font-size: 10px;
	font-weight: 600;
	letter-spacing: 0.02em;
}
.sm-float-trend-up { color: #10b981; }
.sm-float-big {
	font-size: 22px;
	font-weight: 700;
	color: var(--sm-text);
	margin-bottom: 6px;
}
.sm-float-spark {
	width: 100%;
	height: 28px;
	display: block;
}
.sm-float-legend {
	display: flex;
	gap: 12px;
	margin-top: 8px;
}
.sm-float-legend-item {
	font-size: 9px;
	color: var(--sm-muted);
	display: flex;
	align-items: center;
	gap: 4px;
}
.sm-float-dot {
	width: 6px;
	height: 6px;
	border-radius: 50%;
	flex-shrink: 0;
}
.sm-float-badge {
	font-size: 9px;
	font-weight: 500;
	color: var(--sm-muted);
	background: var(--sm-bg-alt);
	padding: 2px 8px;
	border-radius: 100px;
}

/* Mini Kanban (hero float) */
.sm-mini-kanban {
	display: flex;
	gap: 6px;
	margin-top: 4px;
}
.sm-mini-col {
	flex: 1;
	display: flex;
	flex-direction: column;
	gap: 4px;
}
.sm-mini-col-head {
	font-size: 8px;
	font-weight: 600;
	text-transform: uppercase;
	letter-spacing: 0.06em;
	color: var(--sm-muted);
	padding-bottom: 4px;
	border-bottom: 2px solid;
}
.sm-mini-col-cyan { border-color: #06b6d4; }
.sm-mini-col-green { border-color: #22c55e; }
.sm-mini-col-emerald { border-color: #10b981; }
.sm-mini-task {
	height: 10px;
	background: var(--sm-bg-alt);
	border-radius: 3px;
	border: 1px solid var(--sm-border);
}
.sm-mini-task-accent { border-left: 2px solid var(--sm-accent); }
.sm-mini-task-done { opacity: 0.4; }

/* Compact float card variant */
.sm-float-card-compact {
	padding: 14px 18px;
	min-width: auto;
}
.sm-float-score {
	font-size: 28px;
	font-weight: 700;
	color: #10b981;
	line-height: 1;
}
.sm-float-score-label {
	font-size: 9px;
	font-weight: 600;
	text-transform: uppercase;
	letter-spacing: 0.08em;
	color: var(--sm-muted);
	margin-top: 2px;
}
.sm-float-pipe {
	display: flex;
	flex-direction: column;
	gap: 3px;
	margin-top: 6px;
}
.sm-float-pipe-bar {
	height: 4px;
	background: var(--sm-text);
	border-radius: 2px;
}
.sm-float-pipe-val {
	font-size: 14px;
	font-weight: 700;
	color: var(--sm-text);
	margin-top: 4px;
}
.sm-float-ai-chip {
	display: flex;
	align-items: center;
	gap: 6px;
	font-size: 10px;
	color: var(--sm-text-2);
}
.sm-float-checks {
	display: flex;
	flex-direction: column;
	gap: 6px;
}
.sm-check {
	display: flex;
	align-items: center;
	gap: 6px;
}
.sm-check-box {
	width: 12px;
	height: 12px;
	border-radius: 3px;
	border: 1.5px solid var(--sm-border);
	flex-shrink: 0;
}
.sm-check-done {
	background: var(--sm-text);
	border-color: var(--sm-text);
}
.sm-check-text {
	font-size: 10px;
	color: var(--sm-text-2);
}

/* ─── MARQUEE ─── */
.sm-marquee {
	border-top: 1px solid var(--sm-border);
	border-bottom: 1px solid var(--sm-border);
	padding: 12px 0;
	background: var(--sm-dark);
	overflow: hidden;
}
.sm-marquee-track {
	display: flex;
	white-space: nowrap;
	animation: smMarquee 18s linear infinite;
}
.sm-marquee-item {
	font-size: 12px;
	font-weight: 500;
	color: rgba(255, 255, 255, 0.85);
	padding: 0 28px;
	flex-shrink: 0;
	display: inline-flex;
	align-items: center;
	gap: 8px;
	letter-spacing: 0.06em;
	text-transform: uppercase;
}
.sm-marquee-icon {
	width: 13px;
	height: 13px;
	color: var(--sm-accent);
	flex-shrink: 0;
}
.sm-marquee-dot {
	width: 4px;
	height: 4px;
	border-radius: 50%;
	background: var(--sm-accent);
	margin: 0 4px;
	flex-shrink: 0;
}
@keyframes smMarquee {
	from { transform: translateX(0); }
	to { transform: translateX(-50%); }
}

/* ─── KICKER (reusable) ─── */
.sm-kicker {
	font-size: 11px;
	font-weight: 600;
	text-transform: uppercase;
	letter-spacing: 0.12em;
	color: var(--sm-muted);
	margin-bottom: 40px;
	text-align: center;
}
.sm-kicker-light {
	font-size: 11px;
	font-weight: 600;
	text-transform: uppercase;
	letter-spacing: 0.12em;
	color: var(--sm-muted);
	margin-bottom: 32px;
}

/* ─── REPLACES ─── */
.sm-replaces {
	padding: 140px 32px;
	max-width: 1100px;
	margin: 0 auto;
	text-align: center;
}
@media (max-width: 700px) { .sm-replaces { padding: 80px 16px; } }
.sm-replaces-grid {
	display: grid;
	grid-template-columns: repeat(4, 1fr);
	gap: 16px;
	margin-bottom: 48px;
}
@media (max-width: 900px) { .sm-replaces-grid { grid-template-columns: repeat(3, 1fr); } }
@media (max-width: 600px) { .sm-replaces-grid { grid-template-columns: repeat(2, 1fr); } }
.sm-replaces-card {
	padding: 24px 16px;
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 8px;
	position: relative;
	transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.3s cubic-bezier(0.16, 1, 0.3, 1);
	cursor: default;
}
.sm-replaces-card:hover {
	transform: translateY(-3px);
	box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
}
.sm-replaces-card:active {
	transform: scale(0.97);
}
.sm-replaces-strike {
	position: absolute;
	top: 50%;
	left: 15%;
	right: 15%;
	height: 2px;
	background: var(--sm-accent);
	opacity: 0.2;
	transform: rotate(-12deg);
	pointer-events: none;
}
.sm-replaces-icon {
	width: 22px;
	height: 22px;
	color: var(--sm-muted);
	transition: color 0.2s;
}
.sm-replaces-card:hover .sm-replaces-icon { color: var(--sm-accent); }
.sm-replaces-name {
	font-size: 14px;
	font-weight: 600;
	color: var(--sm-text);
}
.sm-replaces-for {
	font-size: 11px;
	color: var(--sm-muted);
	letter-spacing: 0.02em;
}
.sm-replaces-cta {
	font-size: clamp(24px, 4vw, 36px);
	font-weight: 500;
	color: var(--sm-text);
}
.sm-replaces-cta strong {
	font-weight: 700;
	color: var(--sm-text);
}

/* ─── PARALLAX BACKGROUND CHARTS ─── */
.sm-parallax-chart {
	position: absolute;
	pointer-events: none;
	z-index: 0;
	opacity: 1;
}
.sm-parallax-chart svg {
	width: 100%;
	height: 100%;
}
.sm-parallax-truth-wrap {
	position: relative;
	width: 100%;
	height: 0;
	overflow: visible;
	pointer-events: none;
}
.sm-parallax-truth {
	position: absolute;
	top: 0;
	left: 0;
	width: 100%;
	height: 400px;
}
.sm-parallax-features {
	position: sticky;
	top: 0;
	width: 100%;
	height: 100vh;
	margin-bottom: -100vh;
	z-index: 0;
	pointer-events: none;
}
.sm-parallax-ai {
	left: 0;
	right: 0;
	top: 0;
	bottom: 0;
	width: 100%;
	height: 100%;
}

/* ─── TRUTH ─── */
.sm-truth {
	position: relative;
	overflow: visible;
	padding: 140px 32px;
	max-width: 1100px;
	margin: 0 auto;
	display: grid;
	grid-template-columns: 200px 1fr;
	gap: 80px;
	align-items: start;
}
@media (max-width: 700px) {
	.sm-truth { grid-template-columns: 1fr; gap: 32px; padding: 80px 24px; }
}
.sm-truth-sidebar {
	position: sticky;
	top: 100px;
	z-index: 1;
}
.sm-truth-body {
	position: relative;
	z-index: 1;
}
@media (max-width: 700px) { .sm-truth-sidebar { position: static; } }
.sm-truth-label {
	font-size: 11px;
	font-weight: 600;
	text-transform: uppercase;
	letter-spacing: 0.12em;
	color: var(--sm-text);
	padding-left: 16px;
	border-left: 2px solid var(--sm-text);
}
.sm-truth-title {
	font-size: clamp(32px, 4vw, 52px);
	font-weight: 600;
	line-height: 1.15;
	letter-spacing: -0.02em;
	margin-bottom: 32px;
}
.sm-truth-highlight {
	color: var(--sm-text);
	text-decoration: underline;
	text-decoration-color: var(--sm-pop);
	text-underline-offset: 4px;
	text-decoration-thickness: 2px;
}
.sm-truth-text {
	font-size: 17px;
	line-height: 1.85;
	color: var(--sm-text-2);
	margin-bottom: 20px;
}
.sm-truth-text strong {
	color: var(--sm-text);
	font-weight: 600;
}

/* ─── AI CAPABILITIES ─── */
.sm-ai {
	background: var(--sm-dark);
	padding: 140px 32px;
	position: relative;
	overflow: hidden;
}
.sm-ai::before {
	content: '';
	position: absolute;
	inset: 0;
	background: radial-gradient(ellipse at 30% 0%, rgba(16, 185, 129, 0.08) 0%, transparent 60%);
	pointer-events: none;
}
.sm-ai-inner {
	max-width: 1100px;
	margin: 0 auto;
	position: relative;
	z-index: 1;
}
.sm-ai-headline {
	font-size: clamp(36px, 6vw, 64px);
	font-weight: 600;
	line-height: 1.1;
	letter-spacing: -0.02em;
	color: white;
	margin-bottom: 28px;
}
.sm-ai-em {
	color: var(--sm-pop);
}
.sm-ai-lede {
	font-family: var(--font-proxima-light);
	font-size: 18px;
	line-height: 1.8;
	color: rgba(255, 255, 255, 0.55);
	max-width: 620px;
	margin-bottom: 64px;
}
.sm-ai-grid {
	display: grid;
	grid-template-columns: repeat(2, 1fr);
	gap: 20px;
}
@media (max-width: 700px) { .sm-ai-grid { grid-template-columns: 1fr; } }
.sm-ai-card {
	background: rgba(255, 255, 255, 0.04);
	border: 1px solid rgba(255, 255, 255, 0.08);
	border-radius: 20px;
	padding: 36px 32px;
	transition: box-shadow 0.35s cubic-bezier(0.16, 1, 0.3, 1), background 0.35s;
}
.sm-ai-card:hover {
	background: rgba(255, 255, 255, 0.06);
	box-shadow: 0 0 40px rgba(0, 0, 0, 0.04);
}
.sm-ai-num {
	font-size: 11px;
	font-weight: 600;
	letter-spacing: 0.15em;
	color: var(--sm-accent);
	margin-bottom: 16px;
	display: block;
}
.sm-ai-card-title {
	font-size: 22px;
	font-weight: 600;
	color: white;
	margin-bottom: 10px;
	letter-spacing: -0.01em;
}
.sm-ai-card-desc {
	font-size: 14px;
	line-height: 1.7;
	color: rgba(255, 255, 255, 0.45);
}

/* ─── FEATURES ─── */
.sm-features {
	position: relative;
	overflow: visible;
	padding: 140px 32px;
	max-width: 1200px;
	margin: 0 auto;
}
@media (max-width: 700px) { .sm-features { padding: 80px 16px; } }
.sm-features-header {
	margin-bottom: 64px;
	position: relative;
	z-index: 1;
}
.sm-features-hero-grid,
.sm-features-grid {
	position: relative;
	z-index: 1;
}
.sm-features-big {
	font-size: clamp(48px, 7vw, 80px);
	font-weight: 700;
	letter-spacing: -0.03em;
	line-height: 0.9;
	color: var(--sm-text);
	margin-bottom: 8px;
}
.sm-features-title {
	font-size: clamp(28px, 4vw, 44px);
	font-weight: 600;
	letter-spacing: -0.02em;
	line-height: 1.2;
}
.sm-features-em {
	font-style: italic;
	text-decoration: underline;
	text-decoration-color: var(--sm-pop);
	text-underline-offset: 4px;
	text-decoration-thickness: 2px;
}
.sm-features-sub {
	font-size: 16px;
	color: var(--sm-muted);
	margin-top: 12px;
}
.sm-features-hero-grid {
	display: grid;
	grid-template-columns: repeat(2, 1fr);
	gap: 16px;
	margin-bottom: 16px;
}
@media (max-width: 700px) { .sm-features-hero-grid { grid-template-columns: 1fr; } }
.sm-features-grid {
	display: grid;
	grid-template-columns: repeat(3, 1fr);
	gap: 16px;
}
@media (max-width: 900px) { .sm-features-grid { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 600px) { .sm-features-grid { grid-template-columns: 1fr; } }
.sm-feature-card {
	padding: 32px;
	transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.3s cubic-bezier(0.16, 1, 0.3, 1);
	cursor: default;
}
.sm-feature-card:hover {
	transform: translateY(-3px);
	box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
}
.sm-feature-card:active { transform: scale(0.97); }
.sm-feature-hero { padding: 40px 36px; }
.sm-feature-top {
	display: flex;
	align-items: center;
	justify-content: space-between;
	margin-bottom: 14px;
}
.sm-feature-icon {
	width: 20px;
	height: 20px;
	color: var(--sm-muted);
	transition: color 0.2s;
}
.sm-feature-card:hover .sm-feature-icon {
	color: var(--sm-pop);
}
.sm-feature-hero .sm-feature-icon {
	width: 24px;
	height: 24px;
}
.sm-feature-num {
	font-size: 11px;
	font-weight: 600;
	letter-spacing: 0.15em;
	color: var(--sm-muted);
}
.sm-feature-name {
	font-size: 20px;
	font-weight: 600;
	color: var(--sm-text);
	margin-bottom: 10px;
	letter-spacing: -0.01em;
}
.sm-feature-hero .sm-feature-name { font-size: 24px; }
.sm-feature-desc {
	font-size: 14px;
	line-height: 1.7;
	color: var(--sm-muted);
}

/* ─── SHOWCASE ─── */
.sm-showcase {
	background: var(--sm-bg-alt);
	padding: 140px 32px;
}
@media (max-width: 700px) { .sm-showcase { padding: 80px 16px; } }
.sm-showcase-inner {
	max-width: 1200px;
	margin: 0 auto;
}
.sm-showcase-title {
	font-size: clamp(32px, 4vw, 48px);
	font-weight: 600;
	letter-spacing: -0.02em;
	margin-bottom: 56px;
	text-align: center;
}
.sm-showcase-grid {
	display: grid;
	grid-template-columns: 1fr 1fr;
	grid-template-rows: auto auto;
	gap: 16px;
}
@media (max-width: 900px) { .sm-showcase-grid { grid-template-columns: 1fr; } }
.sm-showcase-cell {
	animation: smFloat 6s ease-in-out infinite alternate;
}
.sm-showcase-cell:nth-child(2) { animation-delay: -1s; }
.sm-showcase-cell:nth-child(3) { animation-delay: -2s; }
.sm-showcase-cell:nth-child(4) { animation-delay: -3s; }
.sm-showcase-cell:nth-child(5) { animation-delay: -4s; }
.sm-showcase-cell:nth-child(6) { animation-delay: -5s; }
@keyframes smFloat {
	0% { transform: translateY(0); }
	100% { transform: translateY(-4px); }
}
.sm-showcase-large {
	grid-column: span 1;
}
.sm-showcase-small {
	/* Bottom 4 cells share the bottom two rows */
}
/* Bottom row: 4 items across both columns */
.sm-showcase-grid > .sm-showcase-small:nth-child(3) { grid-column: 1; }
.sm-showcase-grid > .sm-showcase-small:nth-child(4) { grid-column: 2; }
.sm-showcase-grid > .sm-showcase-small:nth-child(5) { grid-column: 1; }
.sm-showcase-grid > .sm-showcase-small:nth-child(6) { grid-column: 2; }

/* Widget base */
.sm-mock-widget {
	background: white;
	border: 1px solid var(--sm-border);
	border-radius: 20px;
	padding: 24px;
	height: 100%;
	box-shadow: 0 2px 12px rgba(0, 0, 0, 0.04);
}
.sm-mock-widget-dark {
	background: var(--sm-dark);
	border-color: rgba(255, 255, 255, 0.08);
}
.sm-mock-header {
	display: flex;
	justify-content: space-between;
	align-items: center;
	margin-bottom: 16px;
}
.sm-mock-title {
	font-size: 12px;
	font-weight: 600;
	text-transform: uppercase;
	letter-spacing: 0.08em;
	color: var(--sm-text);
}
.sm-mock-pill {
	font-size: 9px;
	font-weight: 500;
	color: var(--sm-muted);
	background: var(--sm-bg-alt);
	padding: 3px 10px;
	border-radius: 100px;
	border: 1px solid var(--sm-border);
}

/* Revenue Chart Mock */
.sm-mock-chart {
	width: 100%;
	height: 110px;
	display: block;
	margin-bottom: 8px;
}
.sm-mock-legend {
	display: flex;
	gap: 16px;
	justify-content: center;
}
.sm-mock-legend-item {
	font-size: 10px;
	color: var(--sm-muted);
	display: flex;
	align-items: center;
	gap: 5px;
}
.sm-mock-dot {
	width: 7px;
	height: 7px;
	border-radius: 50%;
	flex-shrink: 0;
}

/* Stats Row Mock */
.sm-mock-stats {
	display: grid;
	grid-template-columns: repeat(4, 1fr);
	gap: 12px;
	margin-top: 16px;
}
@media (max-width: 500px) { .sm-mock-stats { grid-template-columns: repeat(2, 1fr); } }
.sm-mock-stat {
	background: white;
	border: 1px solid var(--sm-border);
	border-radius: 14px;
	padding: 14px;
	text-align: center;
}
.sm-mock-stat-label {
	display: block;
	font-size: 9px;
	font-weight: 600;
	text-transform: uppercase;
	letter-spacing: 0.08em;
	color: var(--sm-muted);
	margin-bottom: 4px;
}
.sm-mock-stat-value {
	display: block;
	font-size: 20px;
	font-weight: 700;
	color: var(--sm-text);
	line-height: 1.1;
}
.sm-mock-stat-trend {
	display: block;
	font-size: 10px;
	font-weight: 600;
	margin-top: 2px;
}

/* Kanban Mock */
.sm-mock-kanban {
	display: flex;
	gap: 10px;
}
.sm-mock-kan-col {
	flex: 1;
	display: flex;
	flex-direction: column;
	gap: 8px;
}
.sm-mock-kan-head {
	font-size: 10px;
	font-weight: 600;
	text-transform: uppercase;
	letter-spacing: 0.06em;
	color: var(--sm-muted);
	padding-bottom: 8px;
	border-bottom: 2px solid;
	display: flex;
	justify-content: space-between;
	align-items: center;
}
.sm-mock-kan-count {
	font-size: 9px;
	font-weight: 500;
	background: var(--sm-bg-alt);
	padding: 1px 6px;
	border-radius: 100px;
}
.sm-mock-kan-card {
	background: var(--sm-bg-alt);
	border: 1px solid var(--sm-border);
	border-radius: 10px;
	padding: 10px 12px;
}
.sm-mock-kan-active {
	border-left: 2px solid var(--sm-accent);
}
.sm-mock-kan-done {
	opacity: 0.5;
}
.sm-mock-kan-title {
	font-size: 11px;
	font-weight: 500;
	color: var(--sm-text);
	margin-bottom: 6px;
	line-height: 1.3;
}
.sm-mock-kan-meta {
	display: flex;
	justify-content: space-between;
	align-items: center;
}
.sm-mock-kan-tag {
	font-size: 8px;
	font-weight: 600;
	padding: 2px 7px;
	border-radius: 100px;
	text-transform: uppercase;
	letter-spacing: 0.04em;
}
.sm-mock-kan-avatars {
	display: flex;
	margin-left: auto;
}
.sm-mock-avatar {
	width: 16px;
	height: 16px;
	border-radius: 50%;
	background: var(--sm-accent);
	border: 1.5px solid white;
	margin-left: -4px;
}
.sm-mock-avatar:first-child { margin-left: 0; }

/* Productivity Meter Mock */
.sm-mock-meter {
	text-align: center;
	margin-bottom: 16px;
}
.sm-mock-score {
	font-size: 40px;
	font-weight: 700;
	color: #10b981;
	line-height: 1;
}
.sm-mock-score-bar {
	height: 6px;
	background: var(--sm-bg-alt);
	border-radius: 3px;
	margin: 10px 0 6px;
	overflow: hidden;
}
.sm-mock-score-fill {
	height: 100%;
	background: linear-gradient(to right, #10b981, #34d399);
	border-radius: 3px;
}
.sm-mock-score-label {
	font-size: 10px;
	font-weight: 600;
	color: #10b981;
	text-transform: uppercase;
	letter-spacing: 0.08em;
}
.sm-mock-meter-stats {
	display: flex;
	justify-content: center;
	gap: 20px;
}
.sm-mock-meter-stat {
	text-align: center;
}
.sm-mock-meter-num {
	display: block;
	font-size: 16px;
	font-weight: 700;
	line-height: 1;
}
.sm-mock-meter-lbl {
	display: block;
	font-size: 9px;
	color: var(--sm-muted);
	margin-top: 2px;
	text-transform: uppercase;
	letter-spacing: 0.04em;
}

/* Social Queue Mock */
.sm-mock-social {
	display: flex;
	flex-direction: column;
	gap: 10px;
}
.sm-mock-social-post {
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 8px 10px;
	background: var(--sm-bg-alt);
	border-radius: 10px;
	border: 1px solid var(--sm-border);
}
.sm-mock-social-icon {
	width: 24px;
	height: 24px;
	border-radius: 6px;
	color: white;
	font-size: 9px;
	font-weight: 700;
	display: flex;
	align-items: center;
	justify-content: center;
	flex-shrink: 0;
}
.sm-mock-social-body { flex: 1; min-width: 0; }
.sm-mock-social-text {
	font-size: 11px;
	font-weight: 500;
	color: var(--sm-text);
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}
.sm-mock-social-time {
	font-size: 9px;
	color: var(--sm-muted);
	margin-top: 1px;
}
.sm-mock-social-status {
	font-size: 8px;
	font-weight: 600;
	padding: 2px 8px;
	border-radius: 100px;
	text-transform: uppercase;
	letter-spacing: 0.04em;
	flex-shrink: 0;
}
.sm-mock-status-ready { background: #d1fae5; color: #065f46; }
.sm-mock-status-scheduled { background: #e0f2fe; color: #0369a1; }
.sm-mock-status-draft { background: #f5f5f5; color: #737373; }

/* CRM Pipeline Mock */
.sm-mock-pipeline {
	display: flex;
	flex-direction: column;
	gap: 10px;
}
.sm-mock-pipe-stage {
	position: relative;
	padding: 8px 12px;
	border-radius: 8px;
	display: flex;
	justify-content: space-between;
	align-items: center;
	overflow: hidden;
}
.sm-mock-pipe-bar {
	position: absolute;
	left: 0;
	top: 0;
	bottom: 0;
	border-radius: 8px;
}
.sm-mock-pipe-name {
	font-size: 11px;
	font-weight: 500;
	color: var(--sm-text);
	position: relative;
	z-index: 1;
}
.sm-mock-pipe-count {
	font-size: 12px;
	font-weight: 700;
	color: var(--sm-text);
	position: relative;
	z-index: 1;
}

/* AI Insight Mock */
.sm-mock-ai-insight {
	text-align: center;
}
.sm-mock-ai-score {
	margin-bottom: 4px;
}
.sm-mock-ai-num {
	font-size: 36px;
	font-weight: 700;
	color: #10b981;
	line-height: 1;
}
.sm-mock-ai-of {
	font-size: 14px;
	color: rgba(255, 255, 255, 0.3);
}
.sm-mock-ai-label {
	font-size: 10px;
	font-weight: 600;
	color: var(--sm-pop);
	text-transform: uppercase;
	letter-spacing: 0.08em;
	margin-bottom: 10px;
}
.sm-mock-ai-rec {
	font-size: 11px;
	line-height: 1.5;
	color: rgba(255, 255, 255, 0.45);
}

/* Wide showcase cell (full grid width) */
.sm-showcase-wide {
	grid-column: 1 / -1;
}

/* Chat / Channels Mock */
.sm-mock-chat {
	display: flex;
	flex-direction: column;
	gap: 14px;
}
.sm-mock-msg {
	display: flex;
	gap: 10px;
	align-items: flex-start;
}
.sm-mock-msg .sm-mock-avatar {
	margin-left: 0;
	width: 28px;
	height: 28px;
	border-radius: 8px;
	flex-shrink: 0;
	border: none;
}
.sm-mock-msg-body {
	flex: 1;
	min-width: 0;
}
.sm-mock-msg-head {
	display: flex;
	align-items: center;
	gap: 6px;
	margin-bottom: 3px;
}
.sm-mock-msg-name {
	font-size: 11px;
	font-weight: 600;
	color: var(--sm-text);
}
.sm-mock-msg-time {
	font-size: 9px;
	color: var(--sm-muted);
}
.sm-mock-msg-ai-badge {
	font-size: 8px;
	font-weight: 700;
	background: var(--sm-text);
	color: white;
	padding: 1px 5px;
	border-radius: 4px;
	text-transform: uppercase;
	letter-spacing: 0.04em;
}
.sm-mock-msg-text {
	font-size: 12px;
	line-height: 1.5;
	color: var(--sm-text-2);
}
.sm-mock-reactions {
	display: flex;
	gap: 6px;
	margin-top: 6px;
}
.sm-mock-reaction {
	font-size: 11px;
	background: var(--sm-bg-alt);
	border: 1px solid var(--sm-border);
	border-radius: 100px;
	padding: 2px 8px;
	cursor: default;
}
.sm-mock-comment-thread {
	margin-top: 8px;
	padding-left: 12px;
	border-left: 2px solid var(--sm-border);
}
.sm-mock-comment {
	display: flex;
	align-items: flex-start;
	gap: 6px;
}
.sm-mock-comment-avatar {
	width: 16px;
	height: 16px;
	border-radius: 4px;
	flex-shrink: 0;
}
.sm-mock-comment-text {
	font-size: 11px;
	color: var(--sm-text-2);
	line-height: 1.4;
}
.sm-mock-comment-text strong {
	color: var(--sm-text);
	font-weight: 600;
}

/* Gantt Chart Mock */
.sm-mock-gantt {
	display: flex;
	flex-direction: column;
	gap: 0;
}
.sm-mock-gantt-header {
	display: grid;
	grid-template-columns: 120px repeat(4, 1fr);
	gap: 0;
	padding-bottom: 8px;
	border-bottom: 1px solid var(--sm-border);
	margin-bottom: 4px;
}
@media (max-width: 600px) { .sm-mock-gantt-header { grid-template-columns: 80px repeat(4, 1fr); } }
.sm-mock-gantt-header span {
	font-size: 9px;
	font-weight: 600;
	text-transform: uppercase;
	letter-spacing: 0.08em;
	color: var(--sm-muted);
	text-align: center;
}
.sm-mock-gantt-header span:first-child { text-align: left; }
.sm-mock-gantt-row {
	display: grid;
	grid-template-columns: 120px 1fr;
	gap: 0;
	align-items: center;
	padding: 6px 0;
	border-bottom: 1px solid rgba(0,0,0,0.03);
}
@media (max-width: 600px) { .sm-mock-gantt-row { grid-template-columns: 80px 1fr; } }
.sm-mock-gantt-label {
	font-size: 11px;
	font-weight: 500;
	color: var(--sm-text);
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}
.sm-mock-gantt-track {
	position: relative;
	height: 12px;
	background: rgba(0,0,0,0.02);
	border-radius: 6px;
}
.sm-mock-gantt-bar {
	position: absolute;
	top: 0;
	height: 100%;
	border-radius: 6px;
}

/* ─── QUOTE ─── */
.sm-quote {
	background: var(--sm-dark);
	padding: 120px 32px;
	text-align: center;
	position: relative;
	overflow: hidden;
}
.sm-quote-mark {
	position: absolute;
	top: -40px;
	left: 50%;
	transform: translateX(-50%);
	font-size: 300px;
	color: rgba(255, 255, 255, 0.03);
	line-height: 1;
	pointer-events: none;
}
.sm-quote-text {
	font-family: var(--font-proxima-light);
	font-size: clamp(28px, 5vw, 48px);
	font-weight: 300;
	color: white;
	line-height: 1.3;
	max-width: 800px;
	margin: 0 auto;
	position: relative;
	z-index: 1;
}
.sm-quote-text em {
	font-style: normal;
	color: var(--sm-pop);
}
.sm-quote-attr {
	font-size: 13px;
	color: rgba(255, 255, 255, 0.35);
	letter-spacing: 0.1em;
	margin-top: 32px;
	text-transform: uppercase;
	position: relative;
	z-index: 1;
}
.sm-quote-earnest {
	font-size: clamp(18px, 3vw, 24px);
	color: rgba(255, 255, 255, 0.85);
	margin-top: 20px;
	position: relative;
	z-index: 1;
}

/* ─── CALCULATOR ─── */
.sm-calc {
	padding: 140px 32px;
	max-width: 800px;
	margin: 0 auto;
	background: var(--sm-bg);
}
@media (max-width: 700px) { .sm-calc { padding: 80px 16px; } }
.sm-calc-header { margin-bottom: 48px; }
.sm-calc-title {
	font-size: clamp(28px, 4vw, 42px);
	font-weight: 600;
	line-height: 1.1;
	letter-spacing: -0.02em;
}
.sm-calc-title em {
	font-style: italic;
	text-decoration: underline;
	text-decoration-color: var(--sm-pop);
	text-underline-offset: 4px;
	text-decoration-thickness: 2px;
}
.sm-calc-sub {
	font-size: 15px;
	color: var(--sm-muted);
	margin-top: 12px;
}
.sm-calc-widget {
	background: rgba(255, 255, 255, 0.85);
	backdrop-filter: saturate(200%) blur(30px);
	-webkit-backdrop-filter: saturate(200%) blur(30px);
	padding: 44px;
	border-radius: 24px;
	border: 1px solid var(--sm-border);
	box-shadow: 0 8px 32px rgba(0, 0, 0, 0.06);
}
@media (max-width: 700px) { .sm-calc-widget { padding: 24px; border-radius: 16px; } }
.sm-calc-row { margin-bottom: 28px; }
.sm-calc-label {
	display: flex;
	justify-content: space-between;
	font-size: 14px;
	color: var(--sm-text-2);
	margin-bottom: 10px;
}
.sm-calc-value {
	font-weight: 700;
	color: var(--sm-accent);
}
.sm-range {
	-webkit-appearance: none;
	width: 100%;
	height: 4px;
	background: var(--sm-border);
	border-radius: 2px;
	outline: none;
}
.sm-range::-webkit-slider-thumb {
	-webkit-appearance: none;
	width: 22px;
	height: 22px;
	background: var(--sm-accent);
	border-radius: 50%;
	cursor: pointer;
	transition: transform 0.15s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.15s;
}
.sm-range::-webkit-slider-thumb:hover {
	transform: scale(1.15);
	box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}
.sm-range::-webkit-slider-thumb:active {
	transform: scale(0.95);
}
.sm-calc-result {
	display: grid;
	grid-template-columns: 1fr auto 1fr;
	gap: 20px;
	align-items: center;
	margin-top: 36px;
	padding-top: 28px;
	border-top: 1px solid var(--sm-border);
}
@media (max-width: 500px) { .sm-calc-result { grid-template-columns: 1fr; text-align: center; } }
.sm-calc-result-label {
	font-size: 11px;
	text-transform: uppercase;
	letter-spacing: 0.06em;
	color: var(--sm-muted);
}
.sm-calc-amount {
	font-size: 40px;
	font-weight: 700;
	line-height: 1;
	display: block;
	margin-top: 6px;
}
.sm-calc-amount small {
	font-family: var(--font-proxima-light);
	font-size: 14px;
	color: var(--sm-muted);
	font-weight: 400;
}
.sm-calc-amount-accent { color: var(--sm-pop); }
.sm-calc-current { text-decoration: line-through; text-decoration-color: var(--sm-pop); text-decoration-thickness: 2px; }
.sm-calc-arrow {
	font-size: 28px;
	color: var(--sm-accent);
}
.sm-calc-savings {
	font-size: 15px;
	color: var(--sm-text-2);
	margin-top: 24px;
	text-align: center;
	font-style: italic;
}
.sm-calc-savings strong { color: var(--sm-pop); font-style: normal; }
.sm-calc-savings-muted { color: var(--sm-muted); }

/* ─── TOKEN COSTS ─── */
.sm-tokens {
	background: var(--sm-dark);
	padding: 100px 32px;
}
@media (max-width: 700px) { .sm-tokens { padding: 60px 16px; } }
.sm-tokens-inner {
	max-width: 1100px;
	margin: 0 auto;
}
.sm-tokens-title {
	font-size: clamp(22px, 3vw, 32px);
	font-weight: 600;
	color: white;
}
.sm-tokens-sub {
	font-size: 14px;
	color: rgba(255, 255, 255, 0.5);
	margin-top: 8px;
	margin-bottom: 32px;
}
.sm-tokens-grid {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
	gap: 12px;
}
.sm-token-card {
	background: rgba(255, 255, 255, 0.04);
	border: 1px solid rgba(255, 255, 255, 0.08);
	border-radius: 16px;
	padding: 20px;
	transition: background 0.25s;
}
.sm-token-card:hover { background: rgba(255, 255, 255, 0.08); }
.sm-token-name {
	font-size: 13px;
	color: rgba(255, 255, 255, 0.65);
	margin-bottom: 8px;
}
.sm-token-cost {
	font-size: 20px;
	font-weight: 700;
	color: white;
}
.sm-token-real {
	font-size: 11px;
	color: rgba(255, 255, 255, 0.3);
	margin-top: 4px;
}
.sm-tokens-note {
	font-size: 13px;
	font-style: italic;
	color: rgba(255, 255, 255, 0.3);
	margin-top: 24px;
	text-align: center;
}

/* ─── TESTIMONIALS ─── */
.sm-testimonials {
	padding: 120px 32px;
	max-width: 1100px;
	margin: 0 auto;
}
@media (max-width: 700px) { .sm-testimonials { padding: 60px 16px; } }
.sm-testimonials-title {
	font-size: clamp(22px, 3vw, 32px);
	font-weight: 600;
	margin-bottom: 40px;
}
.sm-testimonials-grid {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
	gap: 16px;
}
.sm-testimonial {
	padding: 28px;
	transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.3s;
	cursor: default;
}
.sm-testimonial:hover {
	transform: translateY(-2px);
	box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
}
.sm-testimonial:active { transform: scale(0.97); }
.sm-testimonial-quote {
	font-size: 15px;
	line-height: 1.65;
	color: var(--sm-text-2);
	margin-bottom: 20px;
}
.sm-testimonial-author {
	display: flex;
	align-items: center;
	gap: 12px;
}
.sm-testimonial-avatar {
	width: 36px;
	height: 36px;
	border-radius: 50%;
	object-fit: cover;
}
.sm-testimonial-name {
	font-size: 13px;
	font-weight: 600;
	color: var(--sm-text);
}
.sm-testimonial-role {
	font-size: 11px;
	color: var(--sm-muted);
}

/* ─── LOGOS ─── */
.sm-logos {
	padding: 64px 32px;
	text-align: center;
	overflow: hidden;
}
.sm-logos-label {
	font-size: 11px;
	text-transform: uppercase;
	letter-spacing: 0.12em;
	color: var(--sm-muted);
	margin-bottom: 24px;
}
.sm-logos-track {
	overflow: hidden;
	mask-image: linear-gradient(to right, transparent, black 10%, black 90%, transparent);
	-webkit-mask-image: linear-gradient(to right, transparent, black 10%, black 90%, transparent);
}
.sm-logos-scroll {
	display: flex;
	gap: 48px;
	align-items: center;
	animation: smLogos 30s linear infinite;
	width: max-content;
}
.sm-logo-img {
	height: 32px;
	width: auto;
	opacity: 0.35;
	filter: grayscale(1);
	transition: opacity 0.3s, filter 0.3s;
}
.sm-logo-img:hover {
	opacity: 1;
	filter: grayscale(0);
}
@keyframes smLogos {
	0% { transform: translateX(0); }
	100% { transform: translateX(-50%); }
}

/* ─── PRICING ─── */
.sm-pricing {
	padding: 140px 32px;
	max-width: 1100px;
	margin: 0 auto;
	background: var(--sm-bg-alt);
}
@media (max-width: 700px) { .sm-pricing { padding: 80px 16px; } }
.sm-pricing-header {
	margin-bottom: 64px;
	max-width: 600px;
}
.sm-pricing-title {
	font-size: clamp(28px, 4vw, 42px);
	font-weight: 600;
	line-height: 1.1;
	letter-spacing: -0.02em;
}
.sm-pricing-title em {
	font-style: italic;
	text-decoration: underline;
	text-decoration-color: var(--sm-pop);
	text-underline-offset: 4px;
	text-decoration-thickness: 2px;
}
.sm-pricing-sub {
	font-size: 15px;
	line-height: 1.7;
	color: var(--sm-muted);
	margin-top: 16px;
}

.sm-plans-grid {
	display: grid;
	grid-template-columns: repeat(3, 1fr);
	gap: 20px;
	align-items: start;
}
@media (max-width: 800px) { .sm-plans-grid { grid-template-columns: 1fr; max-width: 400px; } }

.sm-plan {
	background: white;
	border: 1px solid var(--sm-border);
	border-radius: 20px;
	padding: 40px 32px;
	position: relative;
	transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.3s;
}
.sm-plan:hover {
	transform: translateY(-3px);
	box-shadow: 0 12px 32px rgba(0, 0, 0, 0.08);
}
.sm-plan-featured {
	background: linear-gradient(to bottom, rgba(0, 0, 0, 0.02), white);
	border-color: rgba(0, 0, 0, 0.1);
	box-shadow: 0 4px 16px rgba(0, 0, 0, 0.04);
}
.sm-plan-badge {
	position: absolute;
	top: -12px;
	left: 50%;
	transform: translateX(-50%);
	background: var(--sm-accent);
	color: white;
	font-size: 10px;
	font-weight: 600;
	text-transform: uppercase;
	letter-spacing: 0.08em;
	padding: 5px 16px;
	border-radius: 100px;
	white-space: nowrap;
}
.sm-plan-name {
	font-size: 22px;
	font-weight: 700;
}
.sm-plan-price {
	font-size: 52px;
	font-weight: 700;
	line-height: 1;
	margin-top: 16px;
	letter-spacing: -0.02em;
}
.sm-plan-price sup {
	font-size: 22px;
	vertical-align: super;
	font-weight: 400;
}
.sm-plan-price span {
	font-family: var(--font-proxima-light);
	font-size: 14px;
	font-weight: 400;
	color: var(--sm-muted);
}
.sm-plan-desc {
	font-size: 13px;
	color: var(--sm-muted);
	margin-top: 8px;
	margin-bottom: 28px;
	padding-bottom: 28px;
	border-bottom: 1px solid var(--sm-border);
}
.sm-plan-features {
	list-style: none;
	display: flex;
	flex-direction: column;
	gap: 12px;
	padding: 0;
	margin: 0;
}
.sm-plan-features li {
	font-size: 13px;
	color: var(--sm-text-2);
	display: flex;
	align-items: flex-start;
	gap: 10px;
	line-height: 1.4;
}
.sm-plan-check {
	width: 16px;
	height: 16px;
	color: var(--sm-accent);
	flex-shrink: 0;
	margin-top: 1px;
}
.sm-plan-btn {
	display: block;
	width: 100%;
	margin-top: 32px;
	padding: 14px;
	text-align: center;
	font-size: 13px;
	font-weight: 500;
	letter-spacing: 0.04em;
	cursor: pointer;
	transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
	border: 1px solid var(--sm-border);
	border-radius: 100px;
	background: transparent;
	color: var(--sm-text);
	text-decoration: none;
	text-transform: uppercase;
}
.sm-plan-btn:hover {
	background: var(--sm-text);
	color: white;
	border-color: var(--sm-text);
}
.sm-plan-btn-accent {
	background: var(--sm-accent);
	border-color: var(--sm-accent);
	color: white;
}
.sm-plan-btn-accent:hover {
	background: var(--sm-accent);
	filter: brightness(1.1);
	transform: translateY(-1px);
	box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
	color: white;
	border-color: var(--sm-accent);
}

/* ─── FOOTER ─── */
.sm-footer {
	background: var(--sm-dark);
	border-top: 1px solid rgba(255, 255, 255, 0.06);
	padding: 32px 24px;
}
.sm-footer-inner {
	max-width: 1100px;
	margin: 0 auto;
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 1rem;
	flex-wrap: wrap;
}
.sm-footer-copy {
	font-size: 13px;
	color: rgba(255, 255, 255, 0.35);
}
.sm-footer-links {
	display: flex;
	gap: 20px;
}
.sm-footer-links a {
	font-size: 13px;
	color: rgba(255, 255, 255, 0.45);
	text-decoration: none;
	transition: color 0.2s;
}
.sm-footer-links a:hover {
	color: rgba(255, 255, 255, 0.8);
}
</style>
