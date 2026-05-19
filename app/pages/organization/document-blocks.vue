<script setup lang="ts">
// Legacy alias — consolidated into /organization/documents-library?tab=blocks
// as part of the Document System overhaul (step 4: Documents Library surface).
// Kept as a thin redirect so any bookmarked URLs continue to resolve.
definePageMeta({ middleware: ['auth'] });
useHead({ title: 'Documents Library | Earnest' });
const router = useRouter();
onMounted(() => {
	router.replace('/organization/documents-library?tab=blocks');
});
</script>
<template>
	<div class="flex items-center justify-center py-16 t-text-muted text-sm">Redirecting to Documents Library…</div>
</template>
