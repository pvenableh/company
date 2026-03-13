<template>
	<div class="relative w-full">
		<!-- Info Button - Always visible on mobile, hidden on desktop -->
		<UButton
			icon="i-heroicons-information-circle"
			size="sm"
			color="gray"
			variant="ghost"
			:ui="{
				rounded: 'rounded-full',
			}"
			class="!shadow lg:hidden"
			:trailing="false"
			@click="toggleMetadata"
		/>

		<!-- Mobile Popover - Shows when button is clicked on small screens -->
		<Teleport to="body">
			<Transition name="fade">
				<div
					v-if="showMetadata && isMobile"
					class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
					@click.self="showMetadata = false"
				>
					<div class="bg-card p-4 w-full max-w-sm relative">
						<div class="flex justify-between items-center absolute right-2 top-2">
							<UButton icon="i-heroicons-x-mark" size="sm" color="gray" variant="ghost" @click="showMetadata = false" />
						</div>
						<div class="flex flex-col">
							<div class="metadata-content">
								<h5 class="text-[9px] text-muted-foreground uppercase font-medium mb-1">Metadata:</h5>

								<p class="text-[9px] text-muted-foreground uppercase">
									<span class="opacity-50 mr-1">Ticket #:</span>
									{{ ticket?.id }}
								</p>

								<p v-if="ticket?.organization" class="text-[9px] text-muted-foreground uppercase">
									<span class="opacity-50 mr-1">Client:</span>
									{{ ticket?.organization.name }}
								</p>

								<p v-if="ticket?.team" class="text-[9px] text-muted-foreground uppercase">
									<span class="opacity-50 mr-1">Team:</span>
									{{ ticket?.team.name }}
								</p>

								<p v-if="ticket?.project" class="text-[9px] text-muted-foreground uppercase">
									<span class="opacity-50 mr-1">Project:</span>
									{{ ticket?.project.title }}
								</p>

								<p v-if="ticket?.user_created" class="text-[9px] text-muted-foreground uppercase">
									<span class="opacity-50 mr-1">Created by:</span>
									{{ ticket?.user_created.first_name }} {{ ticket?.user_created.last_name }}
								</p>

								<p v-if="ticket?.date_created" class="text-[9px] text-muted-foreground uppercase">
									<span class="opacity-50 mr-1">Created on:</span>
									{{ formatDate(ticket?.date_created) }}
								</p>
							</div>
						</div>
					</div>
				</div>
			</Transition>
		</Teleport>

		<!-- Desktop Display - Always visible on large screens, hidden on mobile -->
		<div class="hidden lg:block">
			<div class="metadata-content-desktop">
				<h5 class="text-[9px] text-muted-foreground uppercase mb-1">Metadata:</h5>

				<p class="text-[9px] text-muted-foreground uppercase">
					<span class="opacity-50 mr-1">Ticket #:</span>
					{{ ticket?.id }}
				</p>

				<p v-if="ticket?.organization" class="text-[9px] text-muted-foreground uppercase">
					<span class="opacity-50 mr-1">Client:</span>
					{{ ticket?.organization.name }}
				</p>

				<p v-if="ticket?.team" class="text-[9px] text-muted-foreground uppercase">
					<span class="opacity-50 mr-1">Team:</span>
					{{ ticket?.team.name }}
				</p>

				<p v-if="ticket?.project" class="text-[9px] text-muted-foreground uppercase">
					<span class="opacity-50 mr-1">Project:</span>
					{{ ticket?.project.title }}
				</p>

				<p v-if="ticket?.user_created" class="text-[9px] text-muted-foreground uppercase">
					<span class="opacity-50 mr-1">Created by:</span>
					{{ ticket?.user_created.first_name }} {{ ticket?.user_created.last_name }}
				</p>

				<p v-if="ticket?.date_created" class="text-[9px] text-muted-foreground uppercase">
					<span class="opacity-50 mr-1">Created on:</span>
					{{ formatDate(ticket?.date_created) }}
				</p>
			</div>
		</div>
	</div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';

const props = defineProps({
	ticket: {
		type: Object,
		required: true,
	},
});

const showMetadata = ref(false);
const isMobile = ref(false);

const checkMobile = () => {
	isMobile.value = window.innerWidth < 1024; // Using lg breakpoint (1024px)
};

const toggleMetadata = () => {
	showMetadata.value = !showMetadata.value;
};

const formatDate = (dateString, includeTime = false) => {
	if (!dateString) return '';
	const date = new Date(dateString);

	if (includeTime) {
		return date.toLocaleString('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit',
		});
	}

	return date.toLocaleDateString('en-US', {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
	});
};

// Add resize listener on mount
onMounted(() => {
	checkMobile();
	if (import.meta.client) {
		window.addEventListener('resize', checkMobile);
	}
});

// Clean up resize listener on unmount
onUnmounted(() => {
	if (import.meta.client) {
		window.removeEventListener('resize', checkMobile);
	}
});
</script>

<style scoped>
@reference "~/assets/css/tailwind.css";
.metadata-content {
	@apply bg-card p-2;
}

.metadata-content-desktop {
	@apply bg-card p-2;
}
</style>
