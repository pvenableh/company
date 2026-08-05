<!--
  CustomizeButton — icon-only toggle for dashboard edit mode, meant to sit next
  to the Focus/Classic switch. System tooltip (title) shows the label. When
  editing, a small Reset appears beside it.
-->
<script setup lang="ts">
const { editing, toggleEditing, reset } = useDashboardLayout();
</script>

<template>
	<div class="inline-flex items-center gap-1.5">
		<button
			type="button"
			class="inline-flex items-center justify-center size-8 rounded-full border transition-colors"
			:class="editing
				? 'border-primary bg-primary text-primary-foreground'
				: 'border-border text-muted-foreground hover:text-foreground hover:bg-muted/60'"
			:title="editing ? 'Done arranging' : 'Customize dashboard'"
			:aria-label="editing ? 'Done arranging' : 'Customize dashboard'"
			:aria-pressed="editing"
			@click="toggleEditing"
		>
			<EIcon :name="editing ? 'i-heroicons-check' : 'i-heroicons-adjustments-horizontal'" class="w-4 h-4" />
		</button>
		<button
			v-if="editing"
			type="button"
			class="text-[11px] text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap"
			@click="reset"
		>Reset</button>
	</div>
</template>
