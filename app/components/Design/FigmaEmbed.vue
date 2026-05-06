<script setup lang="ts">
import type { ComputedRef } from 'vue';

interface SyncBus {
	onFrame: (cb: (nodeId: string) => void) => () => void;
	sendFrame: (nodeId: string) => void;
	isPresenter: ComputedRef<boolean>;
}

const props = defineProps<{
	url: string;
	syncBus?: SyncBus;
	title?: string;
}>();

const FIGMA_ORIGIN = 'https://www.figma.com';

const iframeRef = ref<HTMLIFrameElement | null>(null);

// Track the most recent remote-applied nodeId so we don't echo it back
// when Figma fires PRESENTED_NODE_CHANGED in response to our navigate command.
const lastAppliedRemoteNodeId = ref<string | null>(null);

const embedSrc = computed(() => {
	if (!props.url) return '';
	// Figma's embed wrapper accepts the full original URL as a `url=` param.
	// Any node-id query param on the source URL is preserved automatically because
	// we encode the whole thing.
	return `${FIGMA_ORIGIN}/embed?embed_host=earnest&url=${encodeURIComponent(props.url)}`;
});

const handleMessage = (e: MessageEvent) => {
	if (e.origin !== FIGMA_ORIGIN) return;
	const data = e.data;
	if (!data || typeof data !== 'object') return;
	if (data.type !== 'PRESENTED_NODE_CHANGED') return;

	const nodeId: string | undefined = data.data?.presentedNodeId;
	if (!nodeId) return;

	// Echo guard: this change was driven by a remote NAVIGATE we just applied.
	if (lastAppliedRemoteNodeId.value === nodeId) {
		lastAppliedRemoteNodeId.value = null;
		return;
	}

	if (props.syncBus && props.syncBus.isPresenter.value) {
		props.syncBus.sendFrame(nodeId);
	}
};

let unsubscribe: (() => void) | null = null;

onMounted(() => {
	window.addEventListener('message', handleMessage);

	if (props.syncBus) {
		unsubscribe = props.syncBus.onFrame((nodeId: string) => {
			const win = iframeRef.value?.contentWindow;
			if (!win || !nodeId) return;
			lastAppliedRemoteNodeId.value = nodeId;
			win.postMessage(
				{ type: 'NAVIGATE_TO_FRAME_AND_CLOSE_OVERLAYS', data: { nodeId } },
				FIGMA_ORIGIN,
			);
		});
	}
});

onBeforeUnmount(() => {
	window.removeEventListener('message', handleMessage);
	if (unsubscribe) unsubscribe();
});
</script>

<template>
	<iframe
		v-if="embedSrc"
		ref="iframeRef"
		:title="title || 'Figma'"
		:src="embedSrc"
		class="w-full h-full border-0"
		allow="fullscreen; clipboard-read; clipboard-write"
		allowfullscreen
	/>
	<div v-else class="flex items-center justify-center h-full text-xs text-muted-foreground">
		No Figma URL provided
	</div>
</template>
