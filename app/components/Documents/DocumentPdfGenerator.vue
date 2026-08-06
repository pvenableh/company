<script setup lang="ts">
/**
 * Generic PDF generator for any document inside a `.doc-shell`. Captures
 * the wrapper, replaces brand assets to be CORS-safe, and exports as
 * letter-sized PDF. Pairs with DocumentShell so invoice/proposal/contract
 * all use the same export pipeline.
 *
 * jspdf and html2canvas are loaded lazily inside generatePDF so SSR
 * (vite-node) never tries to evaluate the minified ES bundles.
 *
 * Pagination: the captured canvas is often taller than one letter page.
 * We slice it into letter-height (11in − margins) strips and addPage()
 * per strip, so a multi-page proposal/contract/invoice flows across pages
 * instead of being squashed onto one. Any block the composer flagged with
 * a page break (`.doc__block--page-break`, e.g. the cover) forces a cut at
 * its bottom edge so those boundaries always start a fresh page.
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
			// Before rasterizing, capture the vertical position of every
			// explicit page break so we can force a page cut there. These are
			// the blocks the composer flagged with `page_break_after` (and the
			// cover), rendered as `.doc__block--page-break`. We cut AFTER each
			// such block's bottom edge. Offsets are in CSS px relative to the
			// clone's top; they get scaled into canvas px below.
			const cloneTop = clone.getBoundingClientRect().top;
			const forcedBreaksCss = Array.from(
				clone.querySelectorAll<HTMLElement>('.doc__block--page-break'),
			)
				.map((b) => b.getBoundingClientRect().bottom - cloneTop)
				.filter((y) => y > 0);

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
			const pageHeight = 11;
			const margin = 0.5;
			const availableWidth = pageWidth - 2 * margin;
			const availableHeight = pageHeight - 2 * margin;

			// Ratio between rasterized canvas px and the clone's layout px,
			// used to translate CSS-px break offsets into canvas space.
			const pxRatio = canvas.width / clone.offsetWidth;
			// One letter page's worth of content, in canvas px.
			const pagePx = Math.floor((availableHeight * canvas.width) / availableWidth);
			// Forced cut points in canvas px — sorted, de-duped, in-bounds.
			const forcedBreaks = Array.from(
				new Set(forcedBreaksCss.map((y) => Math.round(y * pxRatio))),
			)
				.filter((y) => y > 0 && y < canvas.height)
				.sort((a, b) => a - b);

			// Reusable scratch canvas we blit each page slice onto.
			const slice = document.createElement('canvas');
			const sctx = slice.getContext('2d');

			let top = 0;
			let first = true;
			// Guard against pathological loops (0-height slices).
			let guard = 0;
			while (top < canvas.height && guard++ < 1000) {
				// A page is at most `pagePx` tall, but a forced break falling
				// inside this window ends the page early so a flagged boundary
				// always starts fresh on the next page.
				let bottom = Math.min(top + pagePx, canvas.height);
				const nextBreak = forcedBreaks.find((y) => y > top && y < bottom);
				if (nextBreak) bottom = nextBreak;
				const sliceHeight = bottom - top;
				if (sliceHeight <= 0) break;

				slice.width = canvas.width;
				slice.height = sliceHeight;
				if (sctx) {
					sctx.fillStyle = bg;
					sctx.fillRect(0, 0, slice.width, slice.height);
					sctx.drawImage(
						canvas,
						0, top, canvas.width, sliceHeight, // source rect
						0, 0, canvas.width, sliceHeight, // dest rect
					);
				}

				const imgHeight = (sliceHeight * availableWidth) / canvas.width;
				if (!first) pdf.addPage();
				pdf.addImage(
					slice.toDataURL('image/png', 1.0),
					'PNG', margin, margin, availableWidth, imgHeight, '', 'FAST',
				);
				first = false;
				top = bottom;
			}

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
		<EButton
			size="sm"
			variant="outline"
			:ui="{ rounded: 'rounded-full' }"
			icon="i-heroicons-document-arrow-down"
			class="text-gray-500 dark:text-gray-400"
			:disabled="isGenerating"
			@click="generatePDF"
		>
			<span class="hidden sm:inline ml-1">PDF</span>
		</EButton>
		<div
			v-if="isGenerating"
			class="absolute inset-0 flex items-center justify-center bg-white/50 dark:bg-gray-800/50 rounded-full"
		>
			<EIcon name="lucide:loader-2" class="w-4 h-4 animate-spin text-gray-500" />
		</div>
	</div>
</template>
