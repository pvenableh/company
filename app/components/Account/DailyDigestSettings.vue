<!--
  DailyDigestSettings — the personal "here's your day" summary email: on/off,
  daily vs weekly cadence, send-time, which sections to include, and a self-test
  that emails your real digest now. This is a per-USER delivery preference (state
  is shared via useAIPreferences), so it lives in Account → Notifications — not
  on the org-level Communications floor. The header bell keeps a compact shortcut
  that links here.
-->
<script setup lang="ts">
import { toast } from 'vue-sonner';
import { Switch } from '@/components/ui/switch';
import { DIGEST_SECTIONS, CADENCE_LABELS, formatHour12 } from '~~/shared/digest';

const { selectedOrg } = useOrganization();
const {
	motivationalDigestEnabled,
	motivationalDigestCadence,
	motivationalDigestHour,
	motivationalDigestLeadWithActions,
	toggleDigestSection,
	isDigestSectionOn,
} = useAIPreferences();

const digestCadenceOptions = Object.entries(CADENCE_LABELS);
const digestHours = Array.from({ length: 24 }, (_, h) => ({ value: h, label: formatHour12(h) }));
const digestSections = DIGEST_SECTIONS;

// "Lead with my action list" only means something when the action-list block is
// actually included, so the framing switch only shows when that chip is on.
const actionsIncluded = computed(() => isDigestSectionOn('actions'));

const testingDigest = ref(false);
async function sendTestDigest() {
	testingDigest.value = true;
	try {
		const res = await $fetch<{ ok?: boolean; message?: string; reason?: string }>('/api/digest/test', {
			method: 'POST',
			body: { orgId: selectedOrg.value },
		});
		if (res?.ok) toast.success(res.message || 'Test digest sent — check your inbox');
		else toast.error(res?.reason || 'Could not send test digest');
	} catch (err: any) {
		toast.error(err?.data?.message || err?.message || 'Could not send test digest');
	} finally {
		testingDigest.value = false;
	}
}
</script>

<template>
	<div class="ios-card p-5 space-y-4">
		<div class="flex items-start justify-between gap-3">
			<div class="min-w-0">
				<p class="text-sm font-medium">Daily digest email</p>
				<p class="text-xs text-muted-foreground mt-0.5">
					A morning summary across Work, People, Money &amp; Marketing — plus wins and what to tackle.
				</p>
			</div>
			<Switch
				:model-value="motivationalDigestEnabled"
				class="mt-0.5 shrink-0"
				@update:model-value="motivationalDigestEnabled = $event"
			/>
		</div>

		<template v-if="motivationalDigestEnabled">
			<div class="grid grid-cols-2 gap-3">
				<div>
					<div class="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">How often</div>
					<select
						:value="motivationalDigestCadence"
						class="w-full text-xs rounded-md border border-input bg-background px-2 py-1.5 focus:outline-none"
						@change="e => motivationalDigestCadence = (e.target as HTMLSelectElement).value as any"
					>
						<option v-for="[val, label] in digestCadenceOptions" :key="val" :value="val">{{ label }}</option>
					</select>
				</div>
				<div>
					<div class="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Send at (your time)</div>
					<select
						:value="motivationalDigestHour"
						class="w-full text-xs rounded-md border border-input bg-background px-2 py-1.5 focus:outline-none"
						@change="e => motivationalDigestHour = Number((e.target as HTMLSelectElement).value)"
					>
						<option v-for="h in digestHours" :key="h.value" :value="h.value">{{ h.label }}</option>
					</select>
				</div>
			</div>

			<div>
				<div class="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5">What to include</div>
				<div class="flex flex-wrap gap-1.5">
					<button
						v-for="s in digestSections"
						:key="s.key"
						type="button"
						class="text-[10px] px-2.5 py-1 rounded-full border transition-colors"
						:class="isDigestSectionOn(s.key)
							? 'bg-primary/10 text-primary border-primary/30'
							: 'bg-muted/40 text-muted-foreground border-transparent hover:text-foreground'"
						@click="toggleDigestSection(s.key)"
					>
						{{ s.label }}
					</button>
				</div>
			</div>

			<!-- Framing: only meaningful when the action-list block is included. -->
			<div v-if="actionsIncluded" class="flex items-start justify-between gap-3 rounded-2xl border border-input bg-background p-3">
				<div class="min-w-0">
					<p class="text-xs font-medium">Lead with my action list</p>
					<p class="text-[11px] text-muted-foreground mt-0.5 leading-snug">
						Put the checklist up top and keep it lean — drops the scoreboard and shrinks the rest to a one-line summary.
					</p>
				</div>
				<Switch
					:model-value="motivationalDigestLeadWithActions"
					class="mt-0.5 shrink-0"
					@update:model-value="motivationalDigestLeadWithActions = $event"
				/>
			</div>

			<p class="text-[10px] text-muted-foreground">Friday leans into wins; Monday into a fresh-week lift.</p>
		</template>

		<!-- Self-test: emails your real digest now, bypassing the schedule. -->
		<button
			type="button"
			:disabled="testingDigest"
			class="text-xs text-primary hover:underline disabled:opacity-50"
			@click="sendTestDigest"
		>
			{{ testingDigest ? 'Sending…' : 'Send me a test digest now' }}
		</button>
	</div>
</template>
