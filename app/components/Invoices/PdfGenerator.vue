<script setup>
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { ref } from 'vue';

const props = defineProps({
	invoice: {
		type: Object,
		required: true,
	},
});

const { currentOrg } = useOrganization();
const config = useRuntimeConfig();
const isGenerating = ref(false);

const formatNumber = (value) => {
	return new Intl.NumberFormat('en-US', {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	}).format(value);
};

const generatePDF = async () => {
	try {
		isGenerating.value = true;
		const invoiceElement = document.querySelector('.invoice');
		const clone = invoiceElement.cloneNode(true);

		// The on-screen invoice already renders the seller header via .invoice__seller —
		// remove it from the clone so we can replace it with a PDF-styled equivalent
		// that won't depend on Tailwind/dark-mode classes surviving html2canvas.
		const inlineSellerHeader = clone.querySelector('.invoice__seller');
		if (inlineSellerHeader) inlineSellerHeader.remove();

		// Resolve seller from invoice.bill_to (the authoritative seller for this row),
		// falling back to currentOrg only when bill_to is missing (shouldn't happen).
		const seller = props.invoice?.bill_to || currentOrg.value || {};
		const sellerName = seller.name || '';
		const sellerAddress = seller.address || '';
		const sellerPhone = seller.phone || '';
		const sellerEmail = seller.email || '';
		const sellerWebsite = seller.website ? seller.website.replace(/^https?:\/\//, '') : '';
		const logoId = typeof seller.logo === 'string' ? seller.logo : seller.logo?.id;
		const logoUrl = logoId ? `${config.public.directusUrl}/assets/${logoId}?key=medium-contain` : '';

		const header = document.createElement('div');
		header.innerHTML = `
      <div style="display: flex; align-items: flex-start; margin-bottom: 32px; border-bottom: 1px solid #e5e7eb; padding-bottom: 24px;">
        ${logoUrl ? `<img src="${logoUrl}" alt="${sellerName} logo" style="height: 48px; width: auto; margin-right: 16px;" crossorigin="anonymous" />` : ''}
        <div style="font-size: 9px; text-transform: uppercase; line-height: 1.2; margin-top: -2px;">
          ${sellerName ? `<p style="font-weight: bold;">${sellerName}</p>` : ''}
          ${sellerAddress ? `<p style="white-space: pre-line;">${sellerAddress}</p>` : ''}
          ${sellerPhone ? `<p>${sellerPhone}</p>` : ''}
          ${sellerEmail ? `<p>${sellerEmail}</p>` : ''}
          ${sellerWebsite ? `<p>${sellerWebsite}</p>` : ''}
        </div>
      </div>`;

		clone.insertBefore(header, clone.firstChild);

		// Remove download button
		const pdfGenerator = clone.querySelector('.pdf-download-btn');
		if (pdfGenerator) {
			pdfGenerator.parentElement.remove();
		}

		// Remove border class from the main invoice div
		clone.classList.remove('border');
		clone.style.border = 'none';

		// Style the clone for PDF generation
		clone.style.cssText = `
      width: 750px;
      max-width: 100%;
      padding: 48px 24px;
      background: #ffffff;
      position: absolute;
      left: -9999px;
      color: #000000;
      font-family: 'Proxima Nova W01 Regular', 'Avenir Next', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      border: none;
      box-shadow: none;
    `;

		// Rest of the code remains the same...
		// ... (Previous style conversions and PDF generation code)

		document.body.appendChild(clone);

		const canvas = await html2canvas(clone, {
			scale: 2,
			logging: false,
			useCORS: true,
			backgroundColor: '#ffffff',
			removeContainer: true,
			imageTimeout: 0,
			windowWidth: 750,
			windowHeight: clone.offsetHeight,
		});

		document.body.removeChild(clone);

		const pdf = new jsPDF({
			format: 'letter',
			unit: 'in',
			compress: true,
		});

		const pageWidth = 8.5;
		const margin = 0.5;
		const availableWidth = pageWidth - 2 * margin;
		const imgHeight = (canvas.height * availableWidth) / canvas.width;

		pdf.addImage(canvas.toDataURL('image/png', 1.0), 'PNG', margin, margin, availableWidth, imgHeight, '', 'FAST');

		pdf.save(`${props.invoice.invoice_code}.pdf`);
	} catch (error) {
		console.error('Error generating PDF:', error);
	} finally {
		isGenerating.value = false;
	}
};
</script>

<template>
	<div class="relative inline-block">
		<UButton
			size="sm"
			variant="outline"
			:ui="{ rounded: 'rounded-full' }"
			icon="i-heroicons-document-arrow-down"
			class="text-gray-500 dark:text-gray-400 pdf-download-btn"
			:disabled="isGenerating"
			@click="generatePDF"
		/>
		<div
			v-if="isGenerating"
			class="absolute inset-0 flex items-center justify-center bg-white/50 dark:bg-gray-800/50 rounded-full"
		>
			<svg
				class="animate-spin h-4 w-4 text-gray-500"
				xmlns="http://www.w3.org/2000/svg"
				fill="none"
				viewBox="0 0 24 24"
			>
				<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
				<path
					class="opacity-75"
					fill="currentColor"
					d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
				/>
			</svg>
		</div>
	</div>
</template>
