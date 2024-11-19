<script setup>
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

const props = defineProps({
	invoice: {
		type: Object,
		required: true,
	},
});

const isGenerating = ref(false);

const generatePDF = async () => {
	try {
		isGenerating.value = true;
		const invoiceElement = document.querySelector('.invoice');
		const clone = invoiceElement.cloneNode(true);

		// Create and prepend company header
		const header = document.createElement('div');
		header.innerHTML = `
      <div class="flex items-start mb-8 border-b pb-6">
        <img src="https://admin.huestudios.company/assets/cf9d5f4f-9a30-418d-b48e-acb037c3c2c9" 
             alt="hue logo" 
             class="h-12 w-auto mr-4" />
        <div class="text-[9px] uppercase leading-3 -mt-2">
          <p class="font-bold">hue</p>
          <p>605 Lincoln Road</p>
          <p>Suite 200</p>
          <p>Miami Beach, FL 33139</p>
          <p>305.680.0485</p>
          <p>contact@huestudios.com</p>
        </div>
      </div>`;

		clone.insertBefore(header, clone.firstChild);

		const downloadBtn = clone.querySelector('.pdf-download-btn');
		if (downloadBtn) {
			downloadBtn.remove();
		}

		clone.style.width = '750px';
		clone.style.maxWidth = '100%';
		clone.style.padding = '48px 24px';
		clone.style.background = '#ffffff';
		clone.style.position = 'absolute';
		clone.style.left = '-9999px';
		clone.style.color = '#000000';

		// Ensure all text is black for PDF
		const allText = clone.querySelectorAll('*');
		allText.forEach((element) => {
			element.style.color = '#000000';
			element.style.backgroundColor = 'transparent';
		});

		document.body.appendChild(clone);

		const canvas = await html2canvas(clone, {
			scale: 2, // Increased scale for better quality
			logging: false,
			useCORS: true,
			backgroundColor: '#ffffff',
			removeContainer: true,
			imageTimeout: 0,
			onclone: (clonedDoc) => {
				const elements = clonedDoc.getElementsByClassName('invoice')[0].getElementsByTagName('*');
				for (let element of elements) {
					element.style.color = '#000000';
					element.style.backgroundColor = 'transparent';
				}
			},
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

		pdf.save(`invoice-${props.invoice.invoice_code}.pdf`);
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
