<script setup lang="ts">
/**
 * AppSlideOver — right-side slide-over panel for one-deep app navigation.
 *
 * API mirrors ResponsiveModal so adoption is mechanical: v-model, title,
 * description, hideClose, preventClose. On mobile, falls back to a
 * bottom sheet (full width, slides up). On desktop, slides in from the
 * right at lg width (max-w-2xl).
 *
 * Two-deep flows should push to a full page instead of stacking
 * slide-overs. See `project_apps_layout_plan.md` for the navigation
 * depth rules.
 */

import { useMediaQuery } from '@vueuse/core'
import { cn } from '@/lib/utils'
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from '@/components/ui/sheet'

const { accent, accentStyle } = useAppAccent()

const props = withDefaults(
	defineProps<{
		modelValue?: boolean
		title?: string
		description?: string
		preventClose?: boolean
		hideClose?: boolean
		class?: string
		ui?: {
			content?: string
			header?: string
			body?: string
			footer?: string
			title?: string
			description?: string
		}
	}>(),
	{
		modelValue: false,
		preventClose: false,
		hideClose: false,
	}
)

const emit = defineEmits<{
	(e: 'update:modelValue', value: boolean): void
	(e: 'close'): void
}>()

const isOpen = computed({
	get: () => props.modelValue,
	set: (value) => {
		emit('update:modelValue', value)
		if (!value) emit('close')
	},
})

const isDesktop = useMediaQuery('(min-width: 768px)')
const sheetSide = computed(() => (isDesktop.value ? 'right' : 'bottom'))

const handleInteractOutside = (event: Event) => {
	if (props.preventClose) event.preventDefault()
}

const handleEscapeKeyDown = (event: KeyboardEvent) => {
	if (props.preventClose) event.preventDefault()
}
</script>

<template>
	<Sheet v-model:open="isOpen">
		<SheetTrigger v-if="$slots.trigger" as-child>
			<slot name="trigger" />
		</SheetTrigger>

		<SheetContent
			:side="sheetSide"
			:show-close-button="!hideClose"
			:style="accentStyle"
			:class="cn(
				'p-0 gap-0 flex flex-col app-slide-over__content',
				isDesktop ? 'w-full sm:max-w-2xl' : 'max-h-[90vh] rounded-t-xl',
				props.ui?.content,
				props.class,
			)"
			@interact-outside="handleInteractOutside"
			@escape-key-down="handleEscapeKeyDown"
		>
			<SheetHeader
				v-if="title || $slots.header"
				:class="cn('px-6 py-4 border-b border-border/40 text-left shrink-0 relative app-slide-over__header', props.ui?.header)"
			>
				<slot name="header">
					<div class="flex items-center gap-2">
						<span v-if="accent" class="app-slide-over__dot shrink-0" aria-hidden="true" />
						<div class="min-w-0">
							<SheetTitle v-if="title" :class="cn('truncate', props.ui?.title)">{{ title }}</SheetTitle>
							<SheetDescription v-if="description" :class="props.ui?.description">{{ description }}</SheetDescription>
						</div>
					</div>
				</slot>
			</SheetHeader>

			<div :class="cn('px-6 py-4 overflow-y-auto flex-1', props.ui?.body)">
				<slot />
			</div>

			<SheetFooter
				v-if="$slots.footer"
				:class="cn('px-6 py-4 border-t border-border/40 shrink-0', props.ui?.footer)"
			>
				<slot name="footer" />
			</SheetFooter>
		</SheetContent>
	</Sheet>
</template>

<style scoped>
@reference "~/assets/css/tailwind.css";

/* Thin accent stripe along the top of the slide-over header so users
 * can see at a glance which app they're inside while drilled in.
 */
.app-slide-over__header::before {
	content: '';
	position: absolute;
	top: 0;
	left: 0;
	right: 0;
	height: 2px;
	background: linear-gradient(
		90deg,
		hsl(var(--app-accent-h, 220) var(--app-accent-s, 10%) var(--app-accent-l, 48%)) 0%,
		hsl(var(--app-accent-h, 220) var(--app-accent-s, 10%) calc(var(--app-accent-l, 48%) + 12%)) 100%
	);
	opacity: 0.7;
	pointer-events: none;
}

.app-slide-over__dot {
	display: inline-block;
	width: 0.375rem;
	height: 0.375rem;
	border-radius: 9999px;
	background: hsl(var(--app-accent-h, 220) var(--app-accent-s, 10%) var(--app-accent-l, 48%));
	box-shadow: 0 0 0 3px hsl(var(--app-accent-h, 220) var(--app-accent-s, 10%) var(--app-accent-l, 48%) / 0.18);
}
</style>
