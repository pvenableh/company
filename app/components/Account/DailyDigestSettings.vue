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
import { DIGEST_SECTIONS, DIGEST_STYLES, CADENCE_LABELS, formatHour12 } from '~~/shared/digest';

const { selectedOrg } = useOrganization();
const {
	motivationalDigestEnabled,
	motivationalDigestCadence,
	motivationalDigestHour,
	motivationalDigestStyle,
	toggleDigestSection,
	isDigestSectionOn,
} = useAIPreferences();

const digestCadenceOptions = Object.entries(CADENCE_LABELS);
const digestHours = Array.from({ length: 24 }, (_, h) => ({ value: h, label: formatHour12(h) }));
const digestSections = DIGEST_SECTIONS;
const digestStyles = DIGEST_STYLES;

// The section pickers only shape the "Overview" framing; the action list is
// assembled from your live agenda, so we hide them when Action list is chosen.
const isActionsStyle = computed(() => motivationalDigestStyle.value === 'actions');

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
			<div>
				<div class="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5">Style</div>
				<div class="grid grid-cols-2 gap-2">
					<button
						v-for="opt in digestStyles"
						:key="opt.key"
						type="button"
						class="text-left rounded-2xl border p-3 transition-colors"
						:class="motivationalDigestStyle === opt.key
							? 'border-primary/40 bg-primary/5 ring-1 ring-primary/20'
							: 'border-input bg-background hover:border-primary/30'"
						@click="motivationalDigestStyle = opt.key"
					>
						<div class="flex items-center gap-1.5">
							<span
								class="size-3.5 rounded-full border shrink-0 grid place-items-center"
								:class="motivationalDigestStyle === opt.key ? 'border-primary' : 'border-muted-foreground/40'"
							>
								<span v-if="motivationalDigestStyle === opt.key" class="size-1.5 rounded-full bg-primary" />
							</span>
							<span class="text-xs font-medium">{{ opt.label }}</span>
						</div>
						<p class="text-[11px] text-muted-foreground mt-1 leading-snug">{{ opt.description }}</p>
					</button>
				</div>
			</div>

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

			<div v-if="!isActionsStyle">
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
			<p class="text-[10px] text-muted-foreground">
				{{ isActionsStyle
					? 'Pulled live from your agenda each morning — highest-priority items first, each linking straight to the task.'
					: 'Friday leans into wins; Monday into a fresh-week lift.' }}
			</p>
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
