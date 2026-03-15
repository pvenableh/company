<script setup lang="ts">
definePageMeta({
	title: 'Setup Guide',
});

const { user } = useDirectusAuth();
const activeSection = ref('overview');

const sections = [
	{ id: 'overview', label: 'Overview', icon: 'i-heroicons-home' },
	{ id: 'register', label: 'Register & Create Org', icon: 'i-heroicons-user-plus' },
	{ id: 'roles', label: 'Roles & Permissions', icon: 'i-heroicons-shield-check' },
	{ id: 'members', label: 'Invite Members', icon: 'i-heroicons-envelope' },
	{ id: 'teams', label: 'Set Up Teams', icon: 'i-heroicons-user-group' },
	{ id: 'clients', label: 'Add Clients', icon: 'i-heroicons-building-office-2' },
	{ id: 'contacts', label: 'Add Contacts', icon: 'i-heroicons-identification' },
	{ id: 'client-access', label: 'Client Portal Access', icon: 'i-heroicons-lock-open' },
	{ id: 'workflow', label: 'Organize Workflow', icon: 'i-heroicons-arrows-right-left' },
];

const currentIndex = computed(() => sections.findIndex((s) => s.id === activeSection.value));
const canGoNext = computed(() => currentIndex.value < sections.length - 1);
const canGoPrev = computed(() => currentIndex.value > 0);

const goNext = () => {
	if (canGoNext.value) activeSection.value = sections[currentIndex.value + 1].id;
};
const goPrev = () => {
	if (canGoPrev.value) activeSection.value = sections[currentIndex.value - 1].id;
};
</script>

<template>
	<div class="min-h-screen bg-background">
		<div class="max-w-7xl mx-auto px-4 pt-16 pb-12 sm:px-6 lg:px-8">
			<!-- Header -->
			<div class="flex items-center justify-between mb-8">
				<div>
					<h1 class="text-[28px] font-bold text-foreground tracking-tight leading-tight">Setup Guide</h1>
					<p class="text-[15px] text-muted-foreground mt-0.5">Everything you need to get your organization running</p>
				</div>
				<NuxtLink to="/" class="flex items-center gap-1.5 px-3.5 py-2 bg-primary text-primary-foreground rounded-full shadow-sm text-[13px] font-medium ios-press">
					<UIcon name="i-heroicons-arrow-left" class="w-4 h-4" />
					<span class="hidden sm:inline">Back to Dashboard</span>
				</NuxtLink>
			</div>

			<div class="grid grid-cols-1 lg:grid-cols-4 gap-6">
				<!-- Sidebar Navigation -->
				<div class="lg:col-span-1">
					<nav class="ios-card p-3 space-y-1 sticky top-20">
						<button
							v-for="section in sections"
							:key="section.id"
							@click="activeSection = section.id"
							class="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left text-sm transition-all duration-200"
							:class="activeSection === section.id
								? 'bg-primary/10 text-primary font-semibold'
								: 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'"
						>
							<UIcon :name="section.icon" class="w-4.5 h-4.5 shrink-0" />
							{{ section.label }}
						</button>
					</nav>
				</div>

				<!-- Content -->
				<div class="lg:col-span-3 space-y-6">
					<!-- Overview -->
					<div v-if="activeSection === 'overview'" class="ios-card p-6 space-y-6">
						<div>
							<h2 class="text-xl font-bold text-foreground mb-2">Welcome to Earnest</h2>
							<p class="text-sm text-muted-foreground leading-relaxed">
								Earnest is built around a simple hierarchy that keeps everything organized. Here's how the pieces fit together:
							</p>
						</div>

						<div class="bg-muted/30 rounded-xl p-5 font-mono text-sm text-foreground/80 leading-relaxed">
							<div>Organization <span class="text-muted-foreground">(your company)</span></div>
							<div class="ml-4">├── Teams <span class="text-muted-foreground">(groups within your company)</span></div>
							<div class="ml-4">├── Clients <span class="text-muted-foreground">(companies you serve)</span></div>
							<div class="ml-8">└── Contacts <span class="text-muted-foreground">(people at those companies)</span></div>
							<div class="ml-4">├── Projects <span class="text-muted-foreground">(work, tied to a client or team)</span></div>
							<div class="ml-4">├── Tickets <span class="text-muted-foreground">(tasks and issues)</span></div>
							<div class="ml-4">└── Members <span class="text-muted-foreground">(your team, each with a role)</span></div>
						</div>

						<div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
							<div class="border border-border rounded-xl p-4 text-center">
								<UIcon name="i-heroicons-building-office" class="w-8 h-8 text-primary mx-auto mb-2" />
								<p class="text-sm font-semibold text-foreground">Organization</p>
								<p class="text-xs text-muted-foreground mt-1">Your company is the top-level container. All data is scoped here.</p>
							</div>
							<div class="border border-border rounded-xl p-4 text-center">
								<UIcon name="i-heroicons-user-group" class="w-8 h-8 text-violet-500 mx-auto mb-2" />
								<p class="text-sm font-semibold text-foreground">Teams & Members</p>
								<p class="text-xs text-muted-foreground mt-1">Organize people into teams with roles that control access.</p>
							</div>
							<div class="border border-border rounded-xl p-4 text-center">
								<UIcon name="i-heroicons-building-office-2" class="w-8 h-8 text-emerald-500 mx-auto mb-2" />
								<p class="text-sm font-semibold text-foreground">Clients & Contacts</p>
								<p class="text-xs text-muted-foreground mt-1">Track the companies you serve and the people within them.</p>
							</div>
						</div>

						<div class="border-t border-border pt-4">
							<p class="text-xs text-muted-foreground">
								Everything is scoped to your <strong>organization</strong>. When you log in, select which org you're working in — projects, clients, contacts, and invoices are all filtered accordingly.
							</p>
						</div>
					</div>

					<!-- Register & Create Org -->
					<div v-if="activeSection === 'register'" class="ios-card p-6 space-y-6">
						<h2 class="text-xl font-bold text-foreground">Register & Create Your Organization</h2>

						<div class="space-y-4">
							<h3 class="text-sm font-semibold uppercase tracking-wide text-foreground/70">Quick Start</h3>
							<ol class="space-y-3 text-sm text-foreground/80">
								<li class="flex gap-3">
									<span class="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">1</span>
									<span>Navigate to the <strong>Register</strong> page and fill in your name, email, and password.</span>
								</li>
								<li class="flex gap-3">
									<span class="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">2</span>
									<span>Enter your <strong>Organization Name</strong> — this creates your company workspace automatically.</span>
								</li>
								<li class="flex gap-3">
									<span class="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">3</span>
									<span>You're set! The system creates 5 default roles, makes you the <strong>Owner</strong>, and logs you in.</span>
								</li>
							</ol>
						</div>

						<div class="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
							<div class="flex gap-2">
								<UIcon name="i-heroicons-light-bulb" class="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
								<div class="text-sm text-blue-800 dark:text-blue-200">
									<p class="font-medium">Organization Settings</p>
									<p class="mt-1 text-blue-700 dark:text-blue-300">After creating your org, visit <strong>Organization Settings</strong> to add your logo, brand color, and a 3-letter code used in invoice numbering.</p>
								</div>
							</div>
						</div>

						<div class="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
							<div class="flex gap-2">
								<UIcon name="i-heroicons-information-circle" class="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
								<p class="text-sm text-amber-800 dark:text-amber-200">You can belong to <strong>multiple organizations</strong> and switch between them at any time. Your selection is remembered across sessions.</p>
							</div>
						</div>
					</div>

					<!-- Roles & Permissions -->
					<div v-if="activeSection === 'roles'" class="ios-card p-6 space-y-6">
						<h2 class="text-xl font-bold text-foreground">Roles & Permissions</h2>
						<p class="text-sm text-muted-foreground">Every organization has 5 system roles that control what users can access.</p>

						<div class="space-y-3">
							<div class="flex items-start gap-3 p-3 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/10">
								<div class="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center shrink-0">
									<UIcon name="i-heroicons-crown" class="w-4 h-4 text-amber-600" />
								</div>
								<div>
									<p class="text-sm font-semibold text-foreground">Owner</p>
									<p class="text-xs text-muted-foreground">Full access to everything. Can manage billing, roles, and org settings.</p>
								</div>
							</div>
							<div class="flex items-start gap-3 p-3 rounded-xl border border-border">
								<div class="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
									<UIcon name="i-heroicons-shield-check" class="w-4 h-4 text-primary" />
								</div>
								<div>
									<p class="text-sm font-semibold text-foreground">Admin</p>
									<p class="text-xs text-muted-foreground">Full access to all features. Cannot delete the organization.</p>
								</div>
							</div>
							<div class="flex items-start gap-3 p-3 rounded-xl border border-border">
								<div class="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center shrink-0">
									<UIcon name="i-heroicons-briefcase" class="w-4 h-4 text-violet-500" />
								</div>
								<div>
									<p class="text-sm font-semibold text-foreground">Manager</p>
									<p class="text-xs text-muted-foreground">Manage projects, clients, contacts, and team members. Limited org-level settings.</p>
								</div>
							</div>
							<div class="flex items-start gap-3 p-3 rounded-xl border border-border">
								<div class="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
									<UIcon name="i-heroicons-user" class="w-4 h-4 text-emerald-500" />
								</div>
								<div>
									<p class="text-sm font-semibold text-foreground">Member</p>
									<p class="text-xs text-muted-foreground">View most data. Full control over their own tasks, tickets, and comments.</p>
								</div>
							</div>
							<div class="flex items-start gap-3 p-3 rounded-xl border border-border">
								<div class="w-8 h-8 rounded-lg bg-sky-500/10 flex items-center justify-center shrink-0">
									<UIcon name="i-heroicons-building-office-2" class="w-4 h-4 text-sky-500" />
								</div>
								<div>
									<p class="text-sm font-semibold text-foreground">Client</p>
									<p class="text-xs text-muted-foreground">Limited view scoped to their client record. Can see projects, create tickets, and send messages.</p>
								</div>
							</div>
						</div>

						<div class="bg-muted/30 rounded-xl p-4">
							<p class="text-sm text-foreground/80">
								Owners and Admins can customize role permissions at <NuxtLink to="/organization/roles" class="text-primary hover:underline font-medium">Organization &rarr; Roles</NuxtLink>. Each role has a permission matrix with Create/Read/Update/Delete flags across 18 feature areas.
							</p>
						</div>
					</div>

					<!-- Invite Members -->
					<div v-if="activeSection === 'members'" class="ios-card p-6 space-y-6">
						<h2 class="text-xl font-bold text-foreground">Invite Team Members</h2>

						<ol class="space-y-3 text-sm text-foreground/80">
							<li class="flex gap-3">
								<span class="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">1</span>
								<span>Go to <NuxtLink to="/organization" class="text-primary hover:underline font-medium">Organization</NuxtLink> and open the <strong>Members</strong> tab.</span>
							</li>
							<li class="flex gap-3">
								<span class="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">2</span>
								<span>Click <strong>Invite Member</strong> and enter their email address.</span>
							</li>
							<li class="flex gap-3">
								<span class="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">3</span>
								<span>Select a role — <strong>Admin</strong>, <strong>Manager</strong>, or <strong>Member</strong>.</span>
							</li>
							<li class="flex gap-3">
								<span class="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">4</span>
								<span>They'll receive an email invitation. New users create an account; existing users get added directly.</span>
							</li>
						</ol>

						<div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
							<div class="border border-border rounded-xl p-3 text-center">
								<div class="w-3 h-3 rounded-full bg-amber-400 mx-auto mb-2"></div>
								<p class="text-xs font-semibold text-foreground">Pending</p>
								<p class="text-[11px] text-muted-foreground">Invitation sent, waiting</p>
							</div>
							<div class="border border-border rounded-xl p-3 text-center">
								<div class="w-3 h-3 rounded-full bg-emerald-500 mx-auto mb-2"></div>
								<p class="text-xs font-semibold text-foreground">Active</p>
								<p class="text-[11px] text-muted-foreground">Accepted, full access</p>
							</div>
							<div class="border border-border rounded-xl p-3 text-center">
								<div class="w-3 h-3 rounded-full bg-red-400 mx-auto mb-2"></div>
								<p class="text-xs font-semibold text-foreground">Suspended</p>
								<p class="text-[11px] text-muted-foreground">Temporarily disabled</p>
							</div>
						</div>
					</div>

					<!-- Teams -->
					<div v-if="activeSection === 'teams'" class="ios-card p-6 space-y-6">
						<h2 class="text-xl font-bold text-foreground">Set Up Teams</h2>
						<p class="text-sm text-muted-foreground">Teams let you group members for better project management and collaboration.</p>

						<ol class="space-y-3 text-sm text-foreground/80">
							<li class="flex gap-3">
								<span class="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">1</span>
								<span>Go to <NuxtLink to="/organization/teams" class="text-primary hover:underline font-medium">Organization &rarr; Teams</NuxtLink>.</span>
							</li>
							<li class="flex gap-3">
								<span class="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">2</span>
								<span>Click <strong>Create Team</strong> and give it a name (e.g., "Design", "Development", "Sales").</span>
							</li>
							<li class="flex gap-3">
								<span class="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">3</span>
								<span>Add members and designate <strong>team managers</strong> who can oversee the team's work.</span>
							</li>
							<li class="flex gap-3">
								<span class="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">4</span>
								<span>Assign projects to teams so everyone has context on what they're working on.</span>
							</li>
						</ol>

						<div class="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
							<div class="flex gap-2">
								<UIcon name="i-heroicons-light-bulb" class="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
								<div class="text-sm text-blue-800 dark:text-blue-200">
									<p class="font-medium">Team Visibility</p>
									<p class="mt-1 text-blue-700 dark:text-blue-300"><strong>Admins and Managers</strong> can see all teams. <strong>Members</strong> only see teams they belong to. Use the team filter in the sidebar to scope your view.</p>
								</div>
							</div>
						</div>
					</div>

					<!-- Clients -->
					<div v-if="activeSection === 'clients'" class="ios-card p-6 space-y-6">
						<h2 class="text-xl font-bold text-foreground">Add Clients</h2>
						<p class="text-sm text-muted-foreground">Clients represent the companies your organization serves.</p>

						<ol class="space-y-3 text-sm text-foreground/80">
							<li class="flex gap-3">
								<span class="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">1</span>
								<span>Go to <NuxtLink to="/clients" class="text-primary hover:underline font-medium">Clients</NuxtLink> and click <strong>Add Client</strong>.</span>
							</li>
							<li class="flex gap-3">
								<span class="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">2</span>
								<span>Enter the client's <strong>name</strong>, <strong>website</strong>, <strong>industry</strong>, and a short <strong>code</strong> for invoicing.</span>
							</li>
							<li class="flex gap-3">
								<span class="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">3</span>
								<span>Set their status: <strong>Active</strong>, <strong>Prospect</strong>, <strong>Inactive</strong>, or <strong>Churned</strong>.</span>
							</li>
							<li class="flex gap-3">
								<span class="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">4</span>
								<span>Add <strong>billing contacts</strong> (name/email pairs) for invoice delivery — these don't need user accounts.</span>
							</li>
						</ol>

						<div class="bg-muted/30 rounded-xl p-4">
							<p class="text-sm font-medium text-foreground mb-2">Client Detail View</p>
							<p class="text-xs text-muted-foreground">Each client's page shows linked <strong>contacts</strong>, <strong>projects</strong>, <strong>tickets</strong>, and <strong>invoices</strong> — giving you a 360-degree view of the relationship.</p>
						</div>

						<div class="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
							<div class="flex gap-2">
								<UIcon name="i-heroicons-light-bulb" class="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
								<p class="text-sm text-blue-800 dark:text-blue-200">Use the <strong>client filter</strong> in the sidebar to scope your entire view to a single client. Select "Organization" to see only internal work.</p>
							</div>
						</div>
					</div>

					<!-- Contacts -->
					<div v-if="activeSection === 'contacts'" class="ios-card p-6 space-y-6">
						<h2 class="text-xl font-bold text-foreground">Add Contacts</h2>
						<p class="text-sm text-muted-foreground">Contacts are individual people — typically at client companies, partners, or prospects.</p>

						<div class="space-y-4">
							<h3 class="text-sm font-semibold uppercase tracking-wide text-foreground/70">How Contacts Relate to Clients</h3>
							<div class="bg-muted/30 rounded-xl p-5 space-y-2 text-sm text-foreground/80">
								<div class="flex items-center gap-2">
									<UIcon name="i-heroicons-building-office-2" class="w-5 h-5 text-emerald-500" />
									<span><strong>Client</strong> = a company (e.g., "Acme Corp")</span>
								</div>
								<div class="flex items-center gap-2">
									<UIcon name="i-heroicons-user" class="w-5 h-5 text-blue-500" />
									<span><strong>Contact</strong> = a person (e.g., "Jane Smith, VP of Marketing")</span>
								</div>
								<div class="ml-7 text-xs text-muted-foreground space-y-1">
									<p>Multiple contacts can be linked to one client.</p>
									<p>One contact can be marked as the client's <strong>primary contact</strong>.</p>
								</div>
							</div>
						</div>

						<div class="space-y-4">
							<h3 class="text-sm font-semibold uppercase tracking-wide text-foreground/70">Contact Categories</h3>
							<div class="flex flex-wrap gap-2">
								<span v-for="cat in ['Client', 'Prospect', 'Architect', 'Developer', 'Hospitality', 'Partner', 'Media']" :key="cat"
									class="px-3 py-1.5 rounded-full text-xs font-medium bg-muted/50 text-foreground/70 border border-border">
									{{ cat }}
								</span>
							</div>
						</div>

						<div class="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
							<div class="flex gap-2">
								<UIcon name="i-heroicons-light-bulb" class="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
								<p class="text-sm text-blue-800 dark:text-blue-200">Need to add many contacts at once? Use <NuxtLink to="/contacts/import" class="underline font-medium">CSV Import</NuxtLink> to upload and map your contact data in bulk.</p>
							</div>
						</div>

						<div class="space-y-4">
							<h3 class="text-sm font-semibold uppercase tracking-wide text-foreground/70">Email Engagement</h3>
							<p class="text-xs text-muted-foreground">Contacts have built-in email tracking: subscription status, bounce detection, open/click metrics, and mailing list memberships for targeted campaigns.</p>
						</div>
					</div>

					<!-- Client Portal Access -->
					<div v-if="activeSection === 'client-access'" class="ios-card p-6 space-y-6">
						<h2 class="text-xl font-bold text-foreground">Client Portal Access</h2>
						<p class="text-sm text-muted-foreground">Give clients limited access so they can view progress, submit tickets, and communicate with your team.</p>

						<ol class="space-y-3 text-sm text-foreground/80">
							<li class="flex gap-3">
								<span class="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">1</span>
								<span>Go to <NuxtLink to="/organization" class="text-primary hover:underline font-medium">Organization</NuxtLink> &rarr; <strong>Members</strong> tab.</span>
							</li>
							<li class="flex gap-3">
								<span class="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">2</span>
								<span>Click <strong>Invite Client</strong> and enter their email.</span>
							</li>
							<li class="flex gap-3">
								<span class="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">3</span>
								<span>Select which <strong>Client record</strong> to scope them to — they'll only see data for that client.</span>
							</li>
						</ol>

						<div class="border border-border rounded-xl overflow-hidden">
							<div class="bg-muted/30 px-4 py-2.5 border-b border-border">
								<p class="text-xs font-semibold uppercase tracking-wide text-foreground/70">What Client Users Can Do</p>
							</div>
							<div class="p-4 space-y-2 text-sm">
								<div class="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
									<UIcon name="i-heroicons-check" class="w-4 h-4" />
									<span>View projects and appointments for their client</span>
								</div>
								<div class="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
									<UIcon name="i-heroicons-check" class="w-4 h-4" />
									<span>Create tickets to report issues or make requests</span>
								</div>
								<div class="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
									<UIcon name="i-heroicons-check" class="w-4 h-4" />
									<span>Send messages and comments</span>
								</div>
								<div class="flex items-center gap-2 text-red-500">
									<UIcon name="i-heroicons-x-mark" class="w-4 h-4" />
									<span>Cannot see other clients' data or internal projects</span>
								</div>
								<div class="flex items-center gap-2 text-red-500">
									<UIcon name="i-heroicons-x-mark" class="w-4 h-4" />
									<span>Cannot access organization settings</span>
								</div>
							</div>
						</div>
					</div>

					<!-- Workflow -->
					<div v-if="activeSection === 'workflow'" class="ios-card p-6 space-y-6">
						<h2 class="text-xl font-bold text-foreground">Organize Your Workflow</h2>
						<p class="text-sm text-muted-foreground">With everything set up, here's the recommended order for best results.</p>

						<div class="space-y-2">
							<div v-for="(step, i) in [
								'Create your Organization',
								'Configure org settings (logo, brand color, code)',
								'Invite your team members with appropriate roles',
								'Create teams (Design, Development, Sales, etc.)',
								'Add your clients',
								'Add contacts and link them to clients',
								'Set primary contacts for each client',
								'Create projects (assign to teams and/or clients)',
								'Invite key client contacts to the platform',
							]" :key="i"
								class="flex items-center gap-3 p-2.5 rounded-lg text-sm"
								:class="i < 3 ? 'bg-emerald-50 dark:bg-emerald-900/10 text-emerald-800 dark:text-emerald-200' : 'text-foreground/80'"
							>
								<span class="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
									:class="i < 3 ? 'bg-emerald-500/20 text-emerald-600' : 'bg-muted text-muted-foreground'">
									{{ i + 1 }}
								</span>
								{{ step }}
							</div>
						</div>

						<div class="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
							<div class="border border-border rounded-xl p-4">
								<div class="flex items-center gap-2 mb-2">
									<UIcon name="i-heroicons-funnel" class="w-5 h-5 text-primary" />
									<p class="text-sm font-semibold text-foreground">Client Filter</p>
								</div>
								<p class="text-xs text-muted-foreground">Use the client filter in the sidebar to scope your view: <strong>All</strong>, <strong>Organization</strong> (internal only), or a <strong>specific client</strong>.</p>
							</div>
							<div class="border border-border rounded-xl p-4">
								<div class="flex items-center gap-2 mb-2">
									<UIcon name="i-heroicons-users" class="w-5 h-5 text-violet-500" />
									<p class="text-sm font-semibold text-foreground">Team Filter</p>
								</div>
								<p class="text-xs text-muted-foreground">Filter by team to see only their projects and work. Great for standups, workload reviews, and assignment.</p>
							</div>
						</div>
					</div>

					<!-- Navigation buttons -->
					<div class="flex items-center justify-between pt-2">
						<button
							@click="goPrev"
							:disabled="!canGoPrev"
							class="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-xl transition-colors disabled:opacity-30 disabled:cursor-not-allowed hover:bg-muted/50 text-foreground"
						>
							<UIcon name="i-heroicons-arrow-left" class="w-4 h-4" />
							Previous
						</button>
						<span class="text-xs text-muted-foreground">{{ currentIndex + 1 }} / {{ sections.length }}</span>
						<button
							@click="goNext"
							:disabled="!canGoNext"
							class="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-xl transition-colors disabled:opacity-30 disabled:cursor-not-allowed bg-primary text-primary-foreground hover:bg-primary/90"
						>
							Next
							<UIcon name="i-heroicons-arrow-right" class="w-4 h-4" />
						</button>
					</div>
				</div>
			</div>
		</div>
	</div>
</template>
