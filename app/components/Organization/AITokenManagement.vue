<template>
	<div class="space-y-6">
		<!-- Admin: Grant Comp Tokens (Directus system admins only) -->
		<div v-if="isDirectusAdmin" class="ios-card p-4 border border-warning/30 bg-warning/5">
			<div class="flex items-center justify-between mb-3">
				<h4 class="text-sm font-semibold text-foreground flex items-center gap-2">
					<EIcon name="i-heroicons-bolt" class="w-4 h-4 text-warning" />
					Grant Comp Tokens
					<span class="text-[10px] px-1.5 py-0.5 rounded bg-warning/10 text-warning font-medium">Admin</span>
				</h4>
			</div>
			<p class="text-xs text-muted-foreground mb-3">
				Bypass Stripe and add tokens directly to this org's prepaid balance — at Anthropic cost. Visible in the meter the moment you grant; consumed once the monthly limit is exhausted.
			</p>
			<div class="flex items-center gap-2">
				<EInput
					v-model="grantTokensInput"
					type="number"
					placeholder="e.g. 500000"
					class="flex-1 max-w-xs"
					size="sm"
				/>
				<EInput
					v-model="grantNoteInput"
					placeholder="Note (optional, e.g. team comp)"
					class="flex-1"
					size="sm"
				/>
				<EButton
					color="primary"
					size="sm"
					:loading="grantLoading"
					:disabled="!grantTokensInput || Number(grantTokensInput) <= 0"
					icon="i-heroicons-plus-circle"
					@click="grantTokens"
				>
					Grant
				</EButton>
			</div>
			<p v-if="lastGrantInfo" class="mt-2 text-[11px] text-muted-foreground">
				Last grant: <span class="font-mono text-success">+{{ formatTokens(lastGrantInfo.granted) }}</span>
				· new balance <span class="font-mono">{{ formatTokens(lastGrantInfo.newBalance) }}</span>
			</p>
		</div>

		<!-- Buy Tokens Section -->
		<div class="ios-card p-4">
			<div class="flex items-center justify-between mb-3">
				<h4 class="text-sm font-semibold text-foreground flex items-center gap-2">
					<EIcon name="i-heroicons-shopping-cart" class="w-4 h-4 text-primary" />
					Purchase AI Tokens
				</h4>
			</div>
			<p class="text-xs text-muted-foreground mb-4">
				Add more AI tokens to your organization when your monthly allotment runs low.
			</p>
			<div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
				<div
					v-for="pkg in tokenPackages"
					:key="pkg.id"
					class="border rounded-xl p-4 text-center transition-all cursor-pointer"
					:class="selectedPackage === pkg.id
						? 'border-primary bg-primary/5 ring-1 ring-primary'
						: 'border-border hover:border-primary/50'"
					@click="selectedPackage = pkg.id"
				>
					<p class="text-lg font-bold text-foreground">{{ pkg.name }}</p>
					<p class="text-2xl font-bold text-primary mt-1">${{ (pkg.priceInCents / 100).toFixed(2) }}</p>
					<p class="text-[10px] text-muted-foreground mt-1">{{ formatTokens(pkg.tokens) }} tokens</p>
				</div>
			</div>
			<div class="mt-4 flex justify-end">
				<EButton
					color="primary"
					:loading="purchaseLoading"
					:disabled="!selectedPackage"
					icon="i-heroicons-credit-card"
					@click="purchaseTokens"
				>
					Purchase Tokens
				</EButton>
			</div>
		</div>

		<!-- Purchase History — who bought AI tokens -->
		<div class="ios-card p-4">
			<div class="flex items-center justify-between mb-3">
				<h4 class="text-sm font-semibold text-foreground flex items-center gap-2">
					<EIcon name="i-heroicons-clock" class="w-4 h-4 text-primary" />
					Purchase History
				</h4>
			</div>
			<div v-if="purchasesLoading" class="text-xs text-muted-foreground py-4 text-center">Loading…</div>
			<div v-else-if="purchases.length === 0" class="text-xs text-muted-foreground py-4 text-center">
				No token purchases yet.
			</div>
			<div v-else class="divide-y divide-border/40">
				<div v-for="p in purchases" :key="p.id" class="flex items-center justify-between py-2.5 gap-3">
					<div class="flex items-center gap-3 min-w-0">
						<div class="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
							<EIcon name="i-heroicons-user" class="w-4 h-4 text-primary" />
						</div>
						<div class="min-w-0">
							<p class="text-sm font-medium text-foreground truncate">{{ p.buyer?.name || 'Unknown' }}</p>
							<p class="text-[11px] text-muted-foreground">
								{{ formatTokens(p.tokens) }} tokens · {{ formatPurchaseDate(p.dateCreated) }}
							</p>
						</div>
					</div>
					<div class="flex items-center gap-3 shrink-0">
						<div class="text-right">
							<p
								class="text-sm font-semibold"
								:class="p.status === 'refunded' ? 'text-muted-foreground line-through' : 'text-foreground'"
							>
								${{ (p.amountCents / 100).toFixed(2) }}
							</p>
							<p
								class="text-[10px] uppercase tracking-wider"
								:class="p.status === 'refunded' ? 'text-rose-500' : 'text-muted-foreground'"
							>
								{{ p.status }}
							</p>
						</div>
						<EButton
							v-if="isOrgAdminOrAbove && p.status !== 'refunded'"
							size="xs"
							color="red"
							variant="soft"
							:disabled="refundLoading"
							@click="refundTarget = p"
						>
							Refund
						</EButton>
					</div>
				</div>
			</div>
		</div>

		<!-- Refund confirmation -->
		<EModal v-model="showRefundConfirm">
			<div class="flex items-start gap-4">
				<div class="w-10 h-10 rounded-full bg-destructive/10 dark:bg-destructive/30 flex items-center justify-center shrink-0">
					<EIcon name="i-heroicons-arrow-uturn-left" class="w-5 h-5 text-destructive" />
				</div>
				<div class="flex-1">
					<h3 class="text-lg font-semibold text-foreground">Refund this token purchase?</h3>
					<p class="text-sm text-muted-foreground mt-2">
						<template v-if="refundTarget">
							Refunds <strong>${{ (refundTarget.amountCents / 100).toFixed(2) }}</strong> to
							{{ refundTarget.buyer?.name || 'the buyer' }} via Stripe and removes
							<strong>{{ formatTokens(refundTarget.tokens) }} tokens</strong> from this org's balance
							(floored at zero if some were already spent). This can't be undone.
						</template>
					</p>
					<div class="flex items-center gap-2 mt-6">
						<EButton color="red" :loading="refundLoading" @click="handleRefund">
							Refund {{ refundTarget ? `$${(refundTarget.amountCents / 100).toFixed(2)}` : '' }}
						</EButton>
						<EButton variant="ghost" :disabled="refundLoading" @click="refundTarget = null">
							Cancel
						</EButton>
					</div>
				</div>
			</div>
		</EModal>

		<!-- Org Monthly Limit -->
		<div class="ios-card p-4">
			<div class="flex items-center justify-between mb-3">
				<h4 class="text-sm font-semibold text-foreground flex items-center gap-2">
					<EIcon name="i-heroicons-adjustments-horizontal" class="w-4 h-4 text-primary" />
					Organization Token Limit
				</h4>
			</div>
			<p class="text-xs text-muted-foreground mb-4">
				Set a monthly cap on total AI tokens your organization can use. Leave blank for no limit.
			</p>
			<div class="flex items-center gap-3">
				<EInput
					v-model="orgLimitInput"
					type="number"
					placeholder="e.g. 5000000"
					class="flex-1 max-w-xs"
					size="sm"
				/>
				<span class="text-xs text-muted-foreground">tokens/month</span>
				<EButton
					color="primary"
					variant="soft"
					size="sm"
					:loading="savingOrgLimit"
					@click="saveOrgLimit"
				>
					Save
				</EButton>
			</div>
		</div>

		<!-- Member Management -->
		<div class="ios-card p-4">
			<div class="flex items-center justify-between mb-4">
				<h4 class="text-sm font-semibold text-foreground flex items-center gap-2">
					<EIcon name="i-heroicons-users" class="w-4 h-4 text-primary" />
					Member AI Access & Budgets
				</h4>
				<EButton
					color="gray"
					variant="ghost"
					size="xs"
					icon="i-heroicons-arrow-path"
					:loading="membersLoading"
					@click="loadMembers"
				>
					Refresh
				</EButton>
			</div>

			<div v-if="membersLoading" class="space-y-3">
				<div v-for="i in 3" :key="i" class="flex items-center gap-3 animate-pulse">
					<div class="w-10 h-10 rounded-full bg-muted/40" />
					<div class="flex-1">
						<div class="h-3 bg-muted/40 rounded w-32 mb-2" />
						<div class="h-2 bg-muted/40 rounded w-48" />
					</div>
				</div>
			</div>

			<div v-else-if="members.length" class="space-y-3">
				<div
					v-for="member in members"
					:key="member.id"
					class="flex items-center gap-3 p-3 rounded-xl border border-border/50 hover:bg-muted/10 transition-colors"
				>
					<!-- Avatar -->
					<div class="w-10 h-10 rounded-full bg-muted/50 flex items-center justify-center text-sm font-semibold text-muted-foreground flex-shrink-0">
						{{ member.name?.charAt(0)?.toUpperCase() || '?' }}
					</div>

					<!-- Info -->
					<div class="flex-1 min-w-0">
						<div class="flex items-center gap-2">
							<span class="text-sm font-medium text-foreground truncate">{{ member.name }}</span>
							<span class="text-[10px] px-1.5 py-0.5 rounded bg-muted/20 text-muted-foreground">{{ member.role }}</span>
						</div>
						<div class="flex items-center gap-3 mt-1">
							<span class="text-[10px] text-muted-foreground">{{ formatTokens(member.tokensUsedThisMonth) }} used this month</span>
							<span v-if="member.tokenBudget" class="text-[10px] text-muted-foreground">
								/ {{ formatTokens(member.tokenBudget) }} budget
							</span>
						</div>
						<!-- Usage bar -->
						<div v-if="member.tokenBudget" class="mt-1.5 w-full max-w-48">
							<div class="h-1.5 rounded-full bg-muted/30 overflow-hidden">
								<div
									class="h-full rounded-full transition-all"
									:class="member.tokensUsedThisMonth / member.tokenBudget > 0.8 ? 'bg-destructive' : 'bg-primary'"
									:style="{ width: Math.min(100, (member.tokensUsedThisMonth / member.tokenBudget) * 100) + '%' }"
								/>
							</div>
						</div>
					</div>

					<!-- Controls -->
					<div class="flex items-center gap-2 flex-shrink-0">
						<!-- Budget input. Controlled open state: an uncontrolled
						     <EPopover> (reka-ui) doesn't open in this app, and a
						     <EButton> trigger breaks as-child event forwarding — so we
						     drive open ourselves and use a native <button> trigger. -->
						<EPopover
							:open="openBudgetFor === member.id"
							@update:open="(v: boolean) => openBudgetFor = v ? member.id : null"
						>
							<button
								type="button"
								class="inline-flex items-center justify-center h-7 w-7 rounded-full text-muted-foreground hover:bg-muted/60 transition-colors"
								aria-label="Set token budget"
							>
								<EIcon name="i-heroicons-calculator" class="w-4 h-4" />
							</button>
							<template #panel>
								<div class="p-3 space-y-2 w-56">
									<p class="text-xs font-semibold text-foreground">Monthly Token Budget</p>
									<EInput
										v-model="editBudgets[member.id]"
										type="number"
										placeholder="No limit"
										size="sm"
									/>
									<div class="flex items-center gap-1.5">
										<EButton
											size="xs"
											color="primary"
											:loading="savingBudget === member.id"
											@click="saveMemberBudget(member.id)"
										>
											Save
										</EButton>
										<EButton
											v-if="member.tokenBudget"
											size="xs"
											color="gray"
											variant="ghost"
											@click="clearMemberBudget(member.id)"
										>
											Remove Limit
										</EButton>
									</div>
								</div>
							</template>
						</EPopover>

						<!-- AI Toggle -->
						<EToggle
							:model-value="member.aiEnabled"
							size="sm"
							@update:model-value="(val) => toggleMemberAI(member.id, val)"
						/>
					</div>
				</div>
			</div>

			<div v-else class="text-center py-8">
				<EIcon name="i-heroicons-users" class="w-10 h-10 text-gray-300 mx-auto mb-3" />
				<p class="text-sm text-muted-foreground">No members found</p>
			</div>
		</div>

		<!-- Plan Info -->
		<div v-if="planInfo" class="ios-card p-4">
			<h4 class="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
				<EIcon name="i-heroicons-information-circle" class="w-4 h-4 text-primary" />
				Plan Token Allocations
			</h4>
			<div class="space-y-2">
				<div
					v-for="plan in planInfo.plans"
					:key="plan.id"
					class="flex items-center justify-between p-2.5 rounded-lg"
					:class="plan.id === currentPlanId ? 'bg-primary/5 border border-primary/20' : 'bg-muted/10'"
				>
					<div class="flex items-center gap-2">
						<span class="text-sm font-medium text-foreground">{{ plan.name }}</span>
						<span v-if="plan.id === currentPlanId" class="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">Current</span>
					</div>
					<div class="text-right">
						<span class="text-sm font-bold text-foreground">{{ formatTokens(plan.aiTokens.monthlyAllotment) }}</span>
						<span class="text-[10px] text-muted-foreground ml-1">tokens/mo</span>
					</div>
				</div>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
const props = defineProps({
	organizationId: {
		type: String,
		required: true,
	},
	currentPlanId: {
		type: String,
		default: null,
	},
});

const { user } = useDirectusAuth();
const { isDirectusAdmin } = useViewAsOrgAdmin();
const { isOrgAdminOrAbove } = useOrgRole();
const { refresh: refreshTokenUsage } = useAITokens();
const toast = useToast();

// State
const members = ref<any[]>([]);
const membersLoading = ref(true);
const tokenPackages = ref<any[]>([]);
const selectedPackage = ref<string | null>(null);
const purchaseLoading = ref(false);
const planInfo = ref<any>(null);
const orgLimitInput = ref<string>('');
const savingOrgLimit = ref(false);
const editBudgets = ref<Record<string, string>>({});
const savingBudget = ref<string | null>(null);
// Which member's budget popover is open (controlled — see template).
const openBudgetFor = ref<string | null>(null);

// Admin grant state
const grantTokensInput = ref<string>('');
const grantNoteInput = ref<string>('');
const grantLoading = ref(false);
const lastGrantInfo = ref<{ granted: number; newBalance: number } | null>(null);

interface TokenPurchase {
	id: string;
	tokens: number;
	amountCents: number;
	packageId: string | null;
	status: string;
	dateCreated: string;
	buyer: { id: string; name: string; email: string | null } | null;
}
const purchases = ref<TokenPurchase[]>([]);
const purchasesLoading = ref(true);

// Refund state (org-admin action)
const refundTarget = ref<TokenPurchase | null>(null);
const refundLoading = ref(false);
const showRefundConfirm = computed({
	get: () => !!refundTarget.value,
	set: (v: boolean) => { if (!v) refundTarget.value = null; },
});

async function grantTokens() {
	const amount = Number(grantTokensInput.value);
	if (!Number.isFinite(amount) || amount <= 0) return;
	grantLoading.value = true;
	try {
		const res = await $fetch<{ granted: number; newBalance: number }>('/api/ai/manage/admin-grant', {
			method: 'POST',
			body: {
				organizationId: props.organizationId,
				tokens: amount,
				note: grantNoteInput.value || undefined,
			},
		});
		lastGrantInfo.value = { granted: res.granted, newBalance: res.newBalance };
		grantTokensInput.value = '';
		grantNoteInput.value = '';
		toast.add({
			title: 'Tokens granted',
			description: `+${formatTokens(res.granted)} · new balance ${formatTokens(res.newBalance)}`,
			color: 'green',
		});
		// Refresh the live meter (dock ring + tray strip + sidebar bar)
		await refreshTokenUsage();
	} catch (err: any) {
		toast.add({
			title: 'Grant failed',
			description: err?.data?.message || err?.message || 'Could not grant tokens',
			color: 'red',
		});
	} finally {
		grantLoading.value = false;
	}
}

// Load token purchase history (who bought AI tokens)
async function loadPurchases() {
	purchasesLoading.value = true;
	try {
		const data = await $fetch<{ purchases: TokenPurchase[] }>('/api/ai/manage/purchases', {
			params: { organizationId: props.organizationId },
		});
		purchases.value = data.purchases || [];
	} catch (err: any) {
		console.error('[AITokenManagement] Failed to load purchases:', err);
		purchases.value = [];
	} finally {
		purchasesLoading.value = false;
	}
}

// Refund a token purchase (org-admin) — refunds Stripe + reverses tokens.
async function handleRefund() {
	const p = refundTarget.value;
	if (!p || refundLoading.value) return;
	refundLoading.value = true;
	try {
		const res = await $fetch<{ tokensReversed: number; newBalance: number }>('/api/ai/manage/refund-purchase', {
			method: 'POST',
			body: { organizationId: props.organizationId, purchaseId: p.id },
		});
		toast.add({
			title: 'Refund issued',
			description: `$${(p.amountCents / 100).toFixed(2)} refunded · ${formatTokens(res.tokensReversed)} tokens reversed · new balance ${formatTokens(res.newBalance)}`,
			color: 'green',
		});
		refundTarget.value = null;
		await Promise.all([loadPurchases(), refreshTokenUsage()]);
	} catch (err: any) {
		toast.add({
			title: 'Refund failed',
			description: err?.data?.message || err?.message || 'Could not issue refund',
			color: 'red',
		});
	} finally {
		refundLoading.value = false;
	}
}

// Load members with AI settings
async function loadMembers() {
	membersLoading.value = true;
	try {
		const data = await $fetch<{ members: any[] }>('/api/ai/manage/members', {
			params: { organizationId: props.organizationId },
		});
		members.value = data.members || [];
		// Initialize budget edit values
		for (const m of members.value) {
			if (editBudgets.value[m.id] === undefined) {
				editBudgets.value[m.id] = m.tokenBudget ? String(m.tokenBudget) : '';
			}
		}
	} catch (err: any) {
		console.error('[AITokenManagement] Failed to load members:', err);
	} finally {
		membersLoading.value = false;
	}
}

// Load plan info and token packages
async function loadPlanInfo() {
	try {
		const data = await $fetch<any>('/api/ai/manage/plan-info');
		planInfo.value = data;
		tokenPackages.value = data.packages || [];
	} catch (err: any) {
		console.error('[AITokenManagement] Failed to load plan info:', err);
	}
}

// Load org token limit
const orgItems = useDirectusItems('organizations');
async function loadOrgLimit() {
	try {
		const org = await orgItems.get(props.organizationId, {
			fields: ['ai_token_limit_monthly'],
		}) as any;
		orgLimitInput.value = org?.ai_token_limit_monthly != null ? String(org.ai_token_limit_monthly) : '';
	} catch {
		// silent
	}
}

// Toggle member AI access
async function toggleMemberAI(userId: string, enabled: boolean) {
	try {
		await $fetch('/api/ai/manage/member-toggle', {
			method: 'POST',
			body: { organizationId: props.organizationId, userId, enabled },
		});
		const member = members.value.find((m) => m.id === userId);
		if (member) member.aiEnabled = enabled;
		toast.add({
			title: enabled ? 'Earnest Enabled' : 'Earnest Disabled',
			description: `Earnest access ${enabled ? 'enabled' : 'disabled'} for ${member?.name || 'member'}`,
			color: enabled ? 'green' : 'orange',
		});
	} catch (err: any) {
		toast.add({ title: 'Error', description: err.data?.message || 'Failed to update', color: 'red' });
	}
}

// Save member budget
async function saveMemberBudget(userId: string) {
	savingBudget.value = userId;
	const budgetVal = editBudgets.value[userId];
	const budget = budgetVal ? Number(budgetVal) : null;

	try {
		await $fetch('/api/ai/manage/member-budget', {
			method: 'POST',
			body: { organizationId: props.organizationId, userId, budget },
		});
		const member = members.value.find((m) => m.id === userId);
		if (member) member.tokenBudget = budget;
		openBudgetFor.value = null;
		toast.add({ title: 'Budget Updated', description: budget ? `Set to ${formatTokens(budget)} tokens/month` : 'Budget removed', color: 'green' });
	} catch (err: any) {
		toast.add({ title: 'Error', description: err.data?.message || 'Failed to save budget', color: 'red' });
	} finally {
		savingBudget.value = null;
	}
}

async function clearMemberBudget(userId: string) {
	editBudgets.value[userId] = '';
	await saveMemberBudget(userId);
}

// Save org limit
async function saveOrgLimit() {
	savingOrgLimit.value = true;
	const limit = orgLimitInput.value ? Number(orgLimitInput.value) : null;
	try {
		await $fetch('/api/ai/manage/org-limits', {
			method: 'POST',
			body: { organizationId: props.organizationId, monthlyLimit: limit },
		});
		toast.add({ title: 'Limit Updated', description: limit ? `Organization limit set to ${formatTokens(limit)} tokens/month` : 'Organization limit removed', color: 'green' });
	} catch (err: any) {
		toast.add({ title: 'Error', description: err.data?.message || 'Failed to save limit', color: 'red' });
	} finally {
		savingOrgLimit.value = false;
	}
}

// Purchase tokens
async function purchaseTokens() {
	if (!selectedPackage.value) return;
	purchaseLoading.value = true;
	try {
		const data = await $fetch<{ url: string }>('/api/stripe/tokens/checkout', {
			method: 'POST',
			body: {
				email: (user.value as any)?.email,
				packageId: selectedPackage.value,
				organizationId: props.organizationId,
			},
		});
		if (data.url) {
			window.location.href = data.url;
		}
	} catch (err: any) {
		toast.add({ title: 'Error', description: err.data?.message || 'Failed to start token purchase', color: 'red' });
	} finally {
		purchaseLoading.value = false;
	}
}

function formatTokens(n: number): string {
	if (!n) return '0';
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
	if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
	return String(n);
}

function formatPurchaseDate(iso: string): string {
	if (!iso) return '—';
	try {
		return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
	} catch {
		return '—';
	}
}

onMounted(() => {
	loadMembers();
	loadPlanInfo();
	loadOrgLimit();
	loadPurchases();
});
</script>
