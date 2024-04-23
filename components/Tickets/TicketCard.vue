<!-- eslint-disable no-console -->
<script setup>
const { updateItem } = useDirectusItems();
import { onClickOutside } from '@vueuse/core';

const props = defineProps({
	ticket: {
		type: Object,
		default: null,
	},
});

const alert = computed(() => {
	if (props.ticket.due_date && props.ticket.category !== 'Completed') {
		if (isPastOrFuture(props.ticket.due_date) === 'past') {
			return true;
		} else {
			return false;
		}
	} else {
		return false;
	}
});

const isOpen = ref(false);

const ticketImage = ref(null);

const editable = ref(false);

function makeEditable() {
	editable.value = !editable.value;
}

const state = ref({
	title: props.ticket.title,
	description: props.ticket.description,
	file: props.ticket.file,
	files: props.ticket.files,
});

async function updateticket() {
	const result = await updateItem('tickets', props.ticket?.id, state.value);
	console.log(result);
	editable.value = false;
}

const ticketCard = ref(null);

onClickOutside(ticketCard, (event) => {
	if (editable.value) {
		console.log(event);
		updateticket();
	}
});

const handleDelete = (file) => {
	console.log('handleDelete', file);
	console.log(file);
	// state.files.value = files;
};

const handleSuccess = (files) => {
	console.log(files);
	// state.files.value = files;
};

const minimize = ref(false);

if (props.ticket.category === 'Completed') {
	minimize.value = true;
}
</script>
<template>
	<div
		ref="ticketCard"
		class="w-full flex flex-col items-center justify-between border bg-white dark:border-gray-700 dark:bg-gray-900 ticket-card"
		:class="{ minimize: minimize }"
		:data-id="ticket.id"
	>
		<div v-if="alert" class="w-full bg-red-500 p-2 text-white uppercase text-xs">
			<UIcon name="i-heroicons-exclamation-triangle-solid" size="lg" class="-mb-[2px]" />
			Due {{ getRelativeTime(ticket.due_date) }}
		</div>
		<div class="pt-4 relative w-full flex flex-col items-start justify-start px-4 bg-white dark:bg-gray-900">
			<div class="absolute right-4 top-4">
				<UIcon
					v-if="!minimize && ticket.category === 'Completed'"
					name="i-heroicons-arrows-pointing-in"
					class="cursor-pointer mr-2"
					@click.prevent="minimize = !minimize"
				/>
				<UIcon
					v-else-if="minimize && ticket.category === 'Completed'"
					name="i-heroicons-arrows-pointing-out"
					class="cursor-pointer mr-2"
					@click.prevent="minimize = !minimize"
				/>
				<UIcon v-if="editable" name="i-heroicons-lock-open" class="cursor-pointer mr-2" @click.prevent="updateticket" />
				<UIcon v-else name="i-heroicons-lock-closed" class="cursor-pointer mr-2" @click.prevent="makeEditable" />

				<!-- @click.prevent="openModal(ticket, 'update')" -->
				<UPopover mode="hover" :popper="{ placement: 'bottom', arrow: true }" class="inline-block mr-[4px] -mb-[5px]">
					<UIcon name="i-heroicons-information-circle" />
					<template #panel>
						<div class="p-4 ticket-card__created">
							<p v-if="ticket.date_updated" class="mb-1">
								Updated {{ getRelativeTime(ticket.date_updated) }} by {{ ticket.user_updated.first_name }}
								{{ getFirstLetter(ticket.user_updated.last_name) }}
							</p>
							<p class="">
								Created {{ getRelativeTime(ticket.date_created) }} by {{ ticket.user_created.first_name }}
								{{ getFirstLetter(ticket.user_created.last_name) }}
							</p>
						</div>
					</template>
				</UPopover>
			</div>

			<div class="w-full flex flex-row items-center justify-between font-bold ticket-card__due">
				<h5
					v-if="ticket.due_date && ticket.category !== 'Completed'"
					class="uppercase leading-4"
					:class="{ 'alert font-bold': alert }"
				>
					<UIcon v-if="alert" name="i-heroicons-exclamation-triangle-solid" size="lg" class="-mb-[2px]" />
					Due: {{ format(ticket.due_date, 'ddd MMM D @ h:mmA') }}
					<!-- <span class="block italic font-bold"></span> -->
					<UIcon v-if="alert" name="i-heroicons-exclamation-triangle-solid" size="lg" class="-mb-[2px]" />
				</h5>
				<h5 v-if="ticket.category === 'Completed'" class="uppercase">
					Completed on {{ getFriendlyDateThree(ticket.date_updated) }}
				</h5>
				<UAvatar
					v-if="ticket.category !== 'Completed' && !ticket.due_date"
					icon="i-heroicons-calendar-days"
					size="xs"
					class="shadow border"
				/>
			</div>
			<div class="w-full flex flex-row mt-4 mb-1 ticket-card__category">
				<p class="uppercase inline-block font-bold tracking-wide" :class="slugify(ticket.category)">
					{{ ticket.category }}
				</p>
				<!-- <UIcon v-if="alert" name="i-heroicons-exclamation-triangle-solid" /> -->
			</div>
			<!-- <h3 class="uppercase relative flex items-center justify-center ticket-card__title">
				{{ state.title }}
			</h3> -->
			<UInput
				v-model="state.title"
				class="w-full uppercase relative flex items-center justify-center ticket-card__title p-0 border-none outline-0 shadow-none"
				:disabled="!editable"
				:class="{ editable: editable }"
			/>

			<!-- <div class="ticket-card__description" v-html="ticket.description"></div> -->
			<h3 class="w-full uppercase mt-2 pb-0 mb-1 tracking-wide font-bold text-[8px] border-b">Description:</h3>
			<FormTiptap
				v-model="state.description"
				class="w-full ticket-card__description"
				:disabled="!editable"
				:class="{ editable: editable }"
			/>
		</div>
		<!-- <div class="w-full relative">
			<ticketsUsers :item="ticket.id" collection="tickets" />
			<CommentsContainer :item="ticket.id" collection="tickets" />
		</div> -->
		<ticketsticketCardFooter :item="ticket.id" collection="tickets" :comments-total="ticket.comments.length" />
		<!-- <UModal v-model="isOpen">
			<div class="p-4 rounded-none">
				<img
					:src="`https://admin.1033lenox.com/assets/${state.file}?key=large`"
					:alt="'ticket: ' + state.title"
					class=""
				/>
			</div>
		</UModal>-->
	</div>
</template>
<style>
.ticket-card.minimize {
	box-shadow: 0px -2px 12px rgba(0, 0, 0, 0.1);
	@apply h-28 transition-all duration-200 -mt-14 first:mt-0 first:shadow z-10;
}
.ticket-card.minimize:hover {
	@apply -mt-8 first:mt-0;
}
.ticket-card {
	animation: updated 0.35s var(--curve);
	background: var(--white);
	@apply rounded-md shadow-lg mb-8 overflow-hidden;

	&__category {
		font-weight: bolder;
		font-family: var(--font-bold);

		p {
			background: var(--lightGrey);
			color: var(--white);
			font-size: 7px;
			@apply font-bold uppercase px-2 py-1 rounded-full;
		}

		.scheduled {
			background: var(--cyan);
			color: var(--black);
		}

		.in-progress {
			background: var(--green);
			color: var(--black);
		}

		span {
			color: red;
			@apply inline-block ml-2 border-2 border-red-500;
		}
	}

	&__title {
		font-size: 18px;
		@apply font-bold pb-1;
		input {
			font-size: 18px;

			box-shadow: none !important;
			@apply w-full px-0 transition-all duration-200 border border-white dark:bg-gray-900 dark:border-gray-900;
		}
		&.editable {
			input {
				@apply border px-2 border-gray-200 dark:bg-gray-900 dark:border-gray-800;
			}
		}
	}

	&__due {
		font-size: 12px;
		font-weight: bolder;
		font-family: var(--font-bold);

		.alert {
			@apply text-red-500;
		}
	}

	&__description {
		font-size: 12px;
		@apply w-full pb-2;
		&.editable {
			.tiptap-container {
				@apply border border-gray-200 dark:bg-gray-900 dark:border-gray-800;
			}
		}
		strong {
			font-weight: 900;
			font-family: var(--font-bold);
		}

		ul,
		ol {
			list-style-type: disc;
			padding: 0 1rem;
		}

		blockquote {
			padding-left: 1rem;
			border-left: 2px solid rgba(#0d0d0d, 0.1);
		}
	}

	&__created {
		font-size: 10px;
		background: var(--grey);
		@apply text-white font-bold flex flex-col items-start justify-between uppercase;
	}
}

.ticket-card.alert {
	@apply border-2 border-red-500;
}

/* .updated {
	animation: updated 0.35s var(--curve);
}

@keyframes updated {
	0% {
		transform: scale(1);
		background: #f9f9f9;
	}

	50% {
		transform: scale(1.02);
		background: var(--white);
	}

	to {
		transform: scale(1);
		background: #f9f9f9;
	}
} */
</style>
