<script setup>
const props = defineProps({
	url: { type: String, required: true },
});

const preview = ref(null);
const loading = ref(true);
const failed = ref(false);

onMounted(async () => {
	try {
		const data = await $fetch('/api/link-preview', {
			params: { url: props.url },
		});
		if (data?.title || data?.description || data?.image) {
			preview.value = data;
		} else {
			failed.value = true;
		}
	} catch {
		failed.value = true;
	} finally {
		loading.value = false;
	}
});
</script>

<template>
	<a
		v-if="preview && !failed"
		:href="url"
		target="_blank"
		rel="noopener noreferrer"
		class="link-preview"
	>
		<img v-if="preview.image" :src="preview.image" :alt="preview.title || ''" class="link-preview-img" />
		<div class="link-preview-body">
			<span v-if="preview.siteName" class="link-preview-site">{{ preview.siteName }}</span>
			<span v-if="preview.title" class="link-preview-title">{{ preview.title }}</span>
			<span v-if="preview.description" class="link-preview-desc">{{ preview.description }}</span>
		</div>
	</a>
</template>

<style scoped>
@reference "~/assets/css/tailwind.css";

.link-preview {
	display: flex;
	gap: 12px;
	margin-top: 8px;
	padding: 10px;
	border-radius: 10px;
	border: 1px solid hsl(var(--border) / 0.5);
	background: hsl(var(--muted) / 0.12);
	text-decoration: none;
	color: inherit;
	overflow: hidden;
	transition: background 0.15s;
	max-width: 480px;
}

.link-preview:hover {
	background: hsl(var(--muted) / 0.25);
}

.link-preview-img {
	width: 80px;
	height: 64px;
	object-fit: cover;
	border-radius: 6px;
	flex-shrink: 0;
}

.link-preview-body {
	display: flex;
	flex-direction: column;
	gap: 2px;
	min-width: 0;
}

.link-preview-site {
	font-size: 9px;
	font-weight: 700;
	text-transform: uppercase;
	letter-spacing: 0.06em;
	color: hsl(var(--muted-foreground));
}

.link-preview-title {
	font-size: 13px;
	font-weight: 600;
	color: hsl(var(--foreground));
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.link-preview-desc {
	font-size: 11px;
	color: hsl(var(--muted-foreground));
	display: -webkit-box;
	-webkit-line-clamp: 2;
	-webkit-box-orient: vertical;
	overflow: hidden;
}
</style>
