<script setup lang="ts">
/**
 * signed_letter — cover-letter editor: greeting + markdown body + a sign-off
 * with the signer's name/title and an optional signature image. Mirrors the
 * Hue HUE-605 "introduction." page.
 */
import type { SignedLetterPayload } from '~~/shared/blocks/types';

const props = defineProps<{
	modelValue: SignedLetterPayload;
}>();

const emit = defineEmits<{
	'update:modelValue': [v: SignedLetterPayload];
}>();

function patch(p: Partial<SignedLetterPayload>) {
	emit('update:modelValue', { ...props.modelValue, ...p });
}
</script>

<template>
	<div class="space-y-2">
		<input
			:value="modelValue?.greeting || ''"
			placeholder="Greeting (optional) — e.g. Dear Camila,"
			class="w-full bg-transparent border-0 border-b border-transparent focus:border-border outline-none px-0 py-1 text-sm"
			@input="patch({ greeting: ($event.target as HTMLInputElement).value })"
		/>
		<textarea
			:value="modelValue?.body_markdown || ''"
			placeholder="Letter body (markdown supported)"
			rows="8"
			class="w-full bg-transparent border-0 focus:ring-0 outline-none resize-y text-sm leading-relaxed"
			@input="patch({ body_markdown: ($event.target as HTMLTextAreaElement).value })"
		/>
		<div class="border-t border-border/50 pt-2 space-y-2">
			<input
				:value="modelValue?.signoff || ''"
				placeholder="Sign-off — e.g. Sincerely,"
				class="w-full bg-transparent border-0 outline-none px-0 py-1 text-sm"
				@input="patch({ signoff: ($event.target as HTMLInputElement).value })"
			/>
			<input
				:value="modelValue?.signature_image_url || ''"
				placeholder="Signature image URL (optional)"
				class="w-full bg-transparent border-0 border-b border-transparent focus:border-border outline-none px-0 py-1 text-xs text-muted-foreground"
				@input="patch({ signature_image_url: ($event.target as HTMLInputElement).value })"
			/>
			<div class="grid grid-cols-2 gap-2">
				<input
					:value="modelValue?.signer_name || ''"
					placeholder="Signer name"
					class="w-full bg-transparent border-0 border-b border-transparent focus:border-border outline-none px-0 py-1 text-sm font-semibold"
					@input="patch({ signer_name: ($event.target as HTMLInputElement).value })"
				/>
				<input
					:value="modelValue?.signer_title || ''"
					placeholder="Signer title — e.g. creative director"
					class="w-full bg-transparent border-0 border-b border-transparent focus:border-border outline-none px-0 py-1 text-sm"
					@input="patch({ signer_title: ($event.target as HTMLInputElement).value })"
				/>
			</div>
		</div>
	</div>
</template>
