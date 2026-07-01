<!--
  FormModal — shared chrome for every form-collection modal in the app
  (new X / edit X / delete X). Originally a centered UModal; since the
  iOS UX sweep (P2, 2026-05-20) it renders as an iOS bottom sheet so
  every consumer modal — Contacts, Projects, Tickets, Invoices,
  Proposals, Contracts, Lists, Leads, Expenses, etc. — feels native on
  touch and stays consistent with the Studio sheets ([[project_studio_ios_native]]).

  API is unchanged from the UModal era:
    - Pass `title`, `isEditing`, `saving`, `submitDisabled`, optional
      `statuses` + `currentStatus` for FormStatusTimeline.
    - Default slot is the form body (no overflow constraint — the sheet
      scrolls its body up to 88vh).
    - Emits `submit`, `delete`, `status-change`.
    - `detailRoute` renders the "Full Details →" link in the footer.

  The sheet's pinned footer slot keeps Delete + Save visible while long
  forms scroll (e.g. ProjectsFormModal with timeline stages).
-->
<template>
	<AppsAppBottomSheet v-model="isOpen" :title="title">
		<FormStatusTimeline
			v-if="isEditing && statuses.length"
			:currentStatus="currentStatus"
			:statuses="statuses"
			:collection="collection"
			:itemId="itemId"
			class="mb-4"
			@status-change="$emit('status-change', $event)"
		/>

		<form @submit.prevent="$emit('submit')" class="space-y-4">
			<slot />
		</form>

		<template #footer>
			<!-- Left: destructive + secondary nav, kept away from Save -->
			<div class="flex items-center gap-2">
				<UTooltip v-if="isEditing && canDelete" text="Delete">
					<Button
						variant="ghost"
						size="icon-sm"
						class="text-destructive hover:text-destructive hover:bg-destructive/10"
						:disabled="saving"
						@click="$emit('delete')"
					>
						<Icon name="lucide:trash-2" class="h-3.5 w-3.5" />
					</Button>
				</UTooltip>
				<NuxtLink
					v-if="isEditing && detailRoute"
					:to="detailRoute"
					class="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors"
				>
					Full Details
					<Icon name="lucide:chevron-right" class="w-3 h-3" />
				</NuxtLink>
			</div>
			<!-- Right: primary action -->
			<Button size="sm" :disabled="saving || submitDisabled" @click="$emit('submit')">
				<Icon v-if="saving" name="lucide:loader-2" class="h-3.5 w-3.5 mr-1 animate-spin" />
				<Icon v-else name="lucide:save" class="h-3.5 w-3.5 mr-1" />
				{{ submitLabel || (isEditing ? 'Save' : 'Create') }}
			</Button>
		</template>
	</AppsAppBottomSheet>
</template>

<script setup>
import { Button } from '~/components/ui/button';

defineProps({
	title: { type: String, required: true },
	isEditing: { type: Boolean, default: false },
	saving: { type: Boolean, default: false },
	submitDisabled: { type: Boolean, default: false },
	canDelete: { type: Boolean, default: true },
	submitLabel: { type: String, default: null },
	statuses: { type: Array, default: () => [] },
	currentStatus: { type: String, default: '' },
	collection: { type: String, default: '' },
	itemId: { type: [String, Number], default: null },
	detailRoute: { type: [String, Object], default: null },
});

defineEmits(['submit', 'delete', 'status-change']);

const isOpen = defineModel({ default: false });
</script>
