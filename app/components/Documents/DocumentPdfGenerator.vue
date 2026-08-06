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
 *
 * Running page chrome: when a `pageTemplate` is passed (and enabled), a
 * header (logo + right text) and footer (left text + "page N of M") are
 * drawn onto every page as a real text/vector layer — reserving top/bottom
 * bands so content never overlaps. The cover/title page is skipped so it
 * stays clean.
 */
import { resolvePageTemplate, type DocumentPageTemplate } from '~/composables/useDocumentTheme';

const props = defineProps<{
	/** CSS selector for the doc-shell wrapper to capture. */
	selector?: string;
	/** Filename for the saved PDF (without `.pdf`). */
	filename: string;
	/** Optional accent color — tints the page number in the running footer. */
	accent?: string | null;
	/** Running header/footer/page-number config. Chrome is off unless enabled. */
	pageTemplate?: DocumentPageTemplate | Record<string, any> | null;
	/** Org logo URL for the running header (loaded CORS-safe at export time). */
	logoUrl?: string | null;
}>();

const isGenerating = ref(false);

/** Parse a #rrggbb / #rgb color into [r,g,b]; fall back to a muted gray. */
function hexToRgb(hex: string | null | undefined): [number, number, number] {
	const fallback: [number, number, number] = [120, 120, 120];
	if (!hex) return fallback;
	let h = hex.trim().replace('#', '');
	if (h.length === 3) h = h.split('').map((c) => c + c).join('');
	if (h.length !== 6) return fallback;
	const n = parseInt(h, 16);
	if (Number.isNaN(n)) return fallback;
	return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Load an image URL into a data URL (+ natural dimensions), or null on failure. */
async function loadImageDataUrl(url: string): Promise<{ dataUrl: string; w: number; h: number } | null> {
	try {
		const res = await fetch(url, { mode: 'cors' });
		if (!res.ok) return null;
		const blob = await res.blob();
		const dataUrl = await new Promise<string>((resolve, reject) => {
			const fr = new FileReader();
			fr.onload = () => resolve(fr.result as string);
			fr.onerror = reject;
			fr.readAsDataURL(blob);
		});
		const dims = await new Promise<{ w: number; h: number }>((resolve, reject) => {
			const img = new Image();
			img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
			img.onerror = reject;
			img.src = dataUrl;
		});
		return { dataUrl, ...dims };
	} catch {
		return null;
	}
}

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

		// Resolve the running page-chrome config up front.
		const tpl = resolvePageTemplate(props.pageTemplate);
		const hasHeader = tpl.enabled && (tpl.show_logo && !!props.logoUrl || !!tpl.header_text);
		const hasFooter = tpl.enabled && (!!tpl.footer_text || tpl.show_page_numbers);
		// Load the header logo (CORS-safe data URL) before rasterizing.
		const logo = tpl.enabled && tpl.show_logo && props.logoUrl
			? await loadImageDataUrl(props.logoUrl)
			: null;

		document.body.appendChild(clone);
		try {
			// Before rasterizing, capture the vertical position of every explicit
			// page break (so we can force a page cut there) and the cover's bottom
			// (so we can skip running chrome on the title page). Offsets are in CSS
			// px relative to the clone's top; scaled to canvas px after capture.
			const cloneTop = clone.getBoundingClientRect().top;
			const forcedBreaksCss = Array.from(
				clone.querySelectorAll<HTMLElement>('.doc__block--page-break'),
			)
				.map((b) => b.getBoundingClientRect().bottom - cloneTop)
				.filter((y) => y > 0);
			const coverEl = clone.querySelector<HTMLElement>('.doc-cover-block, .doc__cover');
			const coverBottomCss = coverEl ? coverEl.getBoundingClientRect().bottom - cloneTop : 0;

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

			// Reserve top/bottom bands for the running chrome (0 when disabled).
			const headerBand = hasHeader ? 0.5 : 0;
			const footerBand = hasFooter ? 0.4 : 0;
			const contentHeight = pageHeight - 2 * margin - headerBand - footerBand;

			// Ratio between rasterized canvas px and the clone's layout px, used to
			// translate the CSS-px break/cover offsets into canvas space.
			const pxRatio = canvas.width / clone.offsetWidth;
			// One content-area's worth of the canvas, in canvas px.
			const pagePx = Math.floor((contentHeight * canvas.width) / availableWidth);
			const coverBottomPx = coverBottomCss * pxRatio;
			// Forced cut points in canvas px — sorted, de-duped, in-bounds.
			const forcedBreaks = Array.from(
				new Set(forcedBreaksCss.map((y) => Math.round(y * pxRatio))),
			)
				.filter((y) => y > 0 && y < canvas.height)
				.sort((a, b) => a - b);

			// First pass: compute the slice ranges (so we know the total page
			// count M before drawing "page N of M").
			const slices: { top: number; bottom: number; isCover: boolean }[] = [];
			let top = 0;
			let guard = 0;
			while (top < canvas.height && guard++ < 1000) {
				let bottom = Math.min(top + pagePx, canvas.height);
				const nextBreak = forcedBreaks.find((y) => y > top && y < bottom);
				if (nextBreak) bottom = nextBreak;
				if (bottom - top <= 0) break;
				// A page is a cover page when its content lies within the cover band.
				const isCover = coverBottomPx > 0 && top < coverBottomPx - 1;
				slices.push({ top, bottom, isCover });
				top = bottom;
			}

			const [ar, ag, ab] = hexToRgb(props.accent);
			const scratch = document.createElement('canvas');
			const sctx = scratch.getContext('2d');
			const total = slices.length;

			slices.forEach((slice, i) => {
				const sliceHeight = slice.bottom - slice.top;
				scratch.width = canvas.width;
				scratch.height = sliceHeight;
				if (sctx) {
					sctx.fillStyle = bg;
					sctx.fillRect(0, 0, scratch.width, scratch.height);
					sctx.drawImage(
						canvas,
						0, slice.top, canvas.width, sliceHeight, // source rect
						0, 0, canvas.width, sliceHeight, // dest rect
					);
				}

				const imgHeight = (sliceHeight * availableWidth) / canvas.width;
				if (i > 0) pdf.addPage();

				// The cover page stays clean (no chrome) and sits at the top margin;
				// body pages inset below the reserved header band.
				const chrome = tpl.enabled && !slice.isCover;
				const imgTop = chrome ? margin + headerBand : margin;
				pdf.addImage(
					scratch.toDataURL('image/png', 1.0),
					'PNG', margin, imgTop, availableWidth, imgHeight, '', 'FAST',
				);

				if (!chrome) return;

				// ── Running header ───────────────────────────────────────────────
				if (hasHeader) {
					if (logo) {
						const logoH = 0.26;
						const logoW = Math.min(1.6, (logo.w / logo.h) * logoH);
						pdf.addImage(logo.dataUrl, 'PNG', margin, margin, logoW, logoH, '', 'FAST');
					}
					if (tpl.header_text) {
						pdf.setFont('helvetica', 'normal');
						pdf.setFontSize(8);
						pdf.setTextColor(110, 110, 110);
						pdf.text(tpl.header_text, pageWidth - margin, margin + 0.16, { align: 'right' });
					}
				}

				// ── Running footer ───────────────────────────────────────────────
				if (hasFooter) {
					const footY = pageHeight - margin - 0.12;
					if (tpl.footer_text) {
						pdf.setFont('helvetica', 'normal');
						pdf.setFontSize(7);
						pdf.setTextColor(140, 140, 140);
						pdf.text(tpl.footer_text, margin, footY, { align: 'left' });
					}
					if (tpl.show_page_numbers) {
						const n = i + 1;
						const label = tpl.page_number_format === 'n'
							? `${n}`
							: tpl.page_number_format === 'n_dash_m'
								? `${n}–${total}`
								: `${n} of ${total}`;
						pdf.setFont('helvetica', 'normal');
						pdf.setFontSize(7);
						pdf.setTextColor(ar, ag, ab);
						pdf.text(label, pageWidth - margin, footY, { align: 'right' });
					}
				}
			});

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
