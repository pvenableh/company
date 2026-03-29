<script setup>
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'vue-sonner';

const props = defineProps({
	title: { type: String, default: '' },
	text: { type: String, default: '' },
});

const route = useRoute();
const config = useRuntimeConfig();

const fullUrl = computed(() => {
	const base = config.public.siteUrl || 'https://huestudios.company';
	return `${base}${route.fullPath}`;
});

const copyLink = async () => {
	try {
		await navigator.clipboard.writeText(fullUrl.value);
		toast.success('Link copied to clipboard');
	} catch {
		// Fallback for older browsers
		const input = document.createElement('input');
		input.value = fullUrl.value;
		document.body.appendChild(input);
		input.select();
		document.execCommand('copy');
		document.body.removeChild(input);
		toast.success('Link copied to clipboard');
	}
};

const shareNative = async () => {
	if (navigator.share) {
		try {
			await navigator.share({
				title: props.title || document.title,
				text: props.text || '',
				url: fullUrl.value,
			});
		} catch (err) {
			// User cancelled — ignore
			if (err.name !== 'AbortError') console.error('Share failed:', err);
		}
	} else {
		copyLink();
	}
};

const shareViaEmail = () => {
	const subject = encodeURIComponent(props.title || document.title);
	const body = encodeURIComponent(`Check this out: ${fullUrl.value}`);
	window.open(`mailto:?subject=${subject}&body=${body}`, '_blank');
};
</script>

<template>
	<DropdownMenu>
		<DropdownMenuTrigger as-child>
			<button
				class="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
				title="Share"
			>
				<Icon name="lucide:share-2" class="w-4 h-4" />
			</button>
		</DropdownMenuTrigger>
		<DropdownMenuContent align="end" class="w-44">
			<DropdownMenuItem class="text-xs cursor-pointer" @click="copyLink">
				<Icon name="lucide:link" class="w-3.5 h-3.5 mr-2" />
				Copy link
			</DropdownMenuItem>
			<DropdownMenuItem class="text-xs cursor-pointer" @click="shareNative">
				<Icon name="lucide:share" class="w-3.5 h-3.5 mr-2" />
				Share
			</DropdownMenuItem>
			<DropdownMenuItem class="text-xs cursor-pointer" @click="shareViaEmail">
				<Icon name="lucide:mail" class="w-3.5 h-3.5 mr-2" />
				Send via email
			</DropdownMenuItem>
		</DropdownMenuContent>
	</DropdownMenu>
</template>
