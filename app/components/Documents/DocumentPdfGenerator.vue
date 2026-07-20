<script setup lang="ts">
/**
 * Generic PDF generator for any document inside a `.doc-shell`. Captures
 * the wrapper, replaces brand assets to be CORS-safe, and exports as
 * letter-sized PDF. Pairs with DocumentShell so invoice/proposal/contract
 * all use the same export pipeline.
 *
 * jspdf and html2canvas are loaded lazily inside generatePDF so SSR
 * (vite-node) never tries to evaluate the minified ES bundles.
 */

const props = defineProps<{
	/** CSS selector for the doc-shell wrapper to capture. */
	selector?: string;
	/** Filename for the saved PDF (without `.pdf`). */
	filename: string;
	/** Optional accent color for buttons inside the PDF render. */
	accent?: string | null;
}>();

const isGenerating = ref(false);

async function generatePDF() {
	if (isGenerating.value) return;
	isGenerating.value = true;
	try {
		const [{ jsPDF }, html2canvasMod] = await Promise.all([
			import('jspdf'),
			import('html2canvas'),
		]);
		const html2canvas = (html2canvasMod as any).default || html2canvasMod;
		const sel = props.selector || '.doc-shell';
		const el = document.querySelector(sel) as HTMLElement | null;
		if (!el) {
			console.error(`PDF target not found: ${sel}`);
			return;
		}
		const clone = el.cloneNode(true) as HTMLElement;

		// Strip the PDF download button itself from the clone
		clone.querySelectorAll('.doc-pdf-btn').forEach((b) => b.remove());

		// Strip page-controls (e.g. action buttons in document headers)
		clone.querySelectorAll('[data-pdf-strip]').forEach((b) => b.remove());

		// A document is a PRINTED artifact — it is always light, whatever the app
		// theme is. Documents render inside `.doc-shell`, which owns its own
		// light token set (--doc-bg), so we take the background from there.
		// Never from the app chrome: with dark mode on, the computed background
		// of a node outside .doc-shell is near-black and the PDF came out dark.
		const shell = el.closest('.doc-shell') || el.querySelector('.doc-shell');
		const shellBg = shell ? window.getComputedStyle(shell).backgroundColor : '';
		const isUsable = (c: string) => !!c && c !== 'transparent' && !/rgba\(\s*0,\s*0,\s*0,\s*0\s*\)/.test(c);
		const bg = isUsable(shellBg) ? shellBg : '#ffffff';

		// Style the clone for capture: fixed width, no shadow/border, off-screen
		clone.style.cssText = `
			width: 750px;
			max-width: 100%;
			padding: 48px 32px;
			background: ${bg};
			position: absolute;
			top: 0;
			left: -9999px;
			border: none;
			box-shadow: none;
		`;

		document.body.appendChild(clone);
		try {
			const canvas = await html2canvas(clone, {
				scale: 2,
				logging: false,
				useCORS: true,
				backgroundColor: bg,
				removeContainer: true,
				imageTimeout: 0,
				windowWidth: 750,
				windowHeight: clone.offsetHeight,
			});

			const pdf = new jsPDF({ format: 'letter', unit: 'in', compress: true });
			const pageWidth = 8.5;
			const margin = 0.5;
			const availableWidth = pageWidth - 2 * margin;
			const imgHeight = (canvas.height * availableWidth) / canvas.width;
			pdf.addImage(canvas.toDataURL('image/png', 1.0), 'PNG', margin, margin, availableWidth, imgHeight, '', 'FAST');
			pdf.save(`${props.filename}.pdf`);
		} finally {
			if (clone.parentNode) clone.parentNode.removeChild(clone);
		}
	} catch (err) {
		console.error('PDF generation failed:', err);
	} finally {
		isGenerating.value = false;
	}
}
</script>

<template>
	<div class="relative inline-block doc-pdf-btn">
		<UButton
			size="sm"
			variant="outline"
			:ui="{ rounded: 'rounded-full' }"
			icon="i-heroicons-document-arrow-down"
			class="text-gray-500 dark:text-gray-400"
			:disabled="isGenerating"
			@click="generatePDF"
		>
			<span class="hidden sm:inline ml-1">PDF</span>
		</UButton>
		<div
			v-if="isGenerating"
			class="absolute inset-0 flex items-center justify-center bg-white/50 dark:bg-gray-800/50 rounded-full"
		>
			<UIcon name="lucide:loader-2" class="w-4 h-4 animate-spin text-gray-500" />
		</div>
	</div>
</template>
