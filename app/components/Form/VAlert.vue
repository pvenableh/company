<script setup lang="ts">
interface AlertProps {
	type: 'info' | 'success' | 'warning' | 'error';
}

const iconMap = {
	info: 'heroicons:information-circle-solid',
	success: 'heroicons:check-circle-solid',
	warning: 'heroicons:exclamation-triangle-solid',
	error: 'heroicons:x-circle-solid',
};

withDefaults(defineProps<AlertProps>(), {
	type: 'info',
});
</script>
<template>
	<div
		:class="[
			'p-4 dark:brightness-90 border-2',
			{
				'border-warning/30 text-warning': type === 'warning',
				'border-destructive/30 text-destructive': type === 'error',
				'border-success/30 text-success': type === 'success',
				'border-blue-500 text-blue-800 dark:text-blue-200': type === 'info',
			},
		]"
	>
		<div class="flex items-center">
			<div class="flex-shrink-0">
				<Icon
					:name="iconMap[type]"
					:class="[
						'w-6 h-6',
						{
							'text-warning': type === 'warning',
							'text-destructive': type === 'error',
							'text-success': type === 'success',
							'text-blue-500': type === 'info',
						},
					]"
					aria-hidden="true"
				/>
			</div>
			<div class="ml-3"><slot /></div>
		</div>
	</div>
</template>
