<template>
	<div class="w-full relative group/card">
		<!-- Card Preview -->
		<div class="w-full cursor-pointer transition-transform duration-300">
			<LeadsLeadPipelineCard :lead="element" @edit="openFormModal" />
		</div>

		<!-- Quick Actions (hover) -->
		<div class="absolute top-1.5 right-1.5 flex items-center gap-0.5 opacity-0 group-hover/card:opacity-100 transition-opacity z-10">
			<UTooltip text="Archive">
				<button
					class="p-1 rounded-md bg-card/90 backdrop-blur border border-border/50 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
					@click.stop="handleArchive"
				>
					<UIcon name="i-heroicons-archive-box" class="w-3 h-3" />
				</button>
			</UTooltip>
			<UTooltip text="Junk">
				<button
					class="p-1 rounded-md bg-card/90 backdrop-blur border border-border/50 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
					@click.stop="handleJunk"
				>
					<UIcon name="i-heroicons-trash" class="w-3 h-3" />
				</button>
			</UTooltip>
		</div>

		<!-- Quick Edit Modal -->
		<LeadsFormModal
			v-model="showFormModal"
			:lead="element"
			:organization-id="element?.organization?.id || element?.organization"
			@updated="handleUpdated"
			@deleted="handleDeleted"
			@convert="openConversionModal"
			@lost="openLostReasonModal"
		/>

		<!-- Conversion Modal -->
		<LeadsConversionModal
			v-model="showConversionModal"
			:lead="element"
			@converted="handleConverted"
			@cancelled="handleConversionCancelled"
		/>

		<!-- Lost Reason Modal -->
		<LeadsLostReasonModal
			v-model="showLostReasonModal"
			:lead="element"
			@lost="handleLost"
			@cancelled="handleLostCancelled"
		/>
	</div>
</template>

<script setup>
const { triggerRefresh } = useLeadsStore();
const { archiveLead, junkLead } = useLeads();
const toast = useToast();

const props = defineProps({
	element: {
		type: Object,
		required: true,
	},
});

const showFormModal = ref(false);
const showConversionModal = ref(false);
const showLostReasonModal = ref(false);

const openFormModal = () => {
	showFormModal.value = true;
};

const openConversionModal = () => {
	showFormModal.value = false;
	showConversionModal.value = true;
};

const openLostReasonModal = () => {
	showFormModal.value = false;
	showLostReasonModal.value = true;
};

const handleUpdated = () => {
	triggerRefresh();
};

const handleDeleted = () => {
	triggerRefresh();
};

const handleConverted = () => {
	triggerRefresh();
};

const handleConversionCancelled = () => {
	// Lead stays in its current column — no revert needed
};

const handleLost = () => {
	triggerRefresh();
};

const handleLostCancelled = () => {
	// Lead stays in its current column — no revert needed
};

const handleArchive = async () => {
	try {
		await archiveLead(props.element.id);
		toast.add({ title: 'Lead archived', color: 'green' });
		triggerRefresh();
	} catch {
		toast.add({ title: 'Failed to archive lead', color: 'red' });
	}
};

const handleJunk = async () => {
	try {
		await junkLead(props.element.id);
		toast.add({ title: 'Lead marked as junk', color: 'yellow' });
		triggerRefresh();
	} catch {
		toast.add({ title: 'Failed to mark as junk', color: 'red' });
	}
};
</script>
