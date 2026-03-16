<script setup lang="ts">
import type { Invoice } from '~/types/directus';

definePageMeta({
	middleware: ['auth'],
});

const { user } = useDirectusAuth();
const { getInvoices } = useInvoices();

const invoices = ref<Invoice[]>([]);
const invoiceLoading = ref(true);

function greetUser() {
	const hour = new Date().getHours();
	if (hour < 12) return 'Good morning';
	if (hour < 18) return 'Good afternoon';
	return 'Good evening';
}

// Invoice stats
const invoiceStats = computed(() => {
	const now = new Date();
	const thisMonth = now.getMonth();
	const thisYear = now.getFullYear();

	let totalBilled = 0;
	let totalUnpaid = 0;
	let unpaidCount = 0;
	let overdueAmount = 0;
	let overdueCount = 0;
	let monthlyRevenue = 0;
	let monthlyPaidCount = 0;

	for (const inv of invoices.value) {
		const amount = Number(inv.total_amount) || 0;
		totalBilled += amount;

		if (inv.status === 'pending' || inv.status === 'processing') {
			totalUnpaid += amount;
			unpaidCount++;

			if (inv.due_date && new Date(inv.due_date) < now) {
				overdueAmount += amount;
				overdueCount++;
			}
		}

		if (inv.status === 'paid') {
			const invDate = inv.invoice_date ? new Date(inv.invoice_date) : null;
			if (invDate && invDate.getMonth() === thisMonth && invDate.getFullYear() === thisYear) {
				monthlyRevenue += amount;
				monthlyPaidCount++;
			}
		}
	}

	return {
		totalBilled,
		invoiceCount: invoices.value.length,
		totalUnpaid,
		unpaidCount,
		overdueAmount,
		overdueCount,
		monthlyRevenue,
		monthlyPaidCount,
	};
});

const { selectedClient } = useClients();
const { selectedOrg } = useOrganization();

const loadInvoices = async () => {
	invoiceLoading.value = true;
	try {
		const result = await getInvoices({ limit: 500 });
		invoices.value = result?.data || [];
	} catch (e) {
		console.error('Failed to load invoice data for dashboard:', e);
		invoices.value = [];
	} finally {
		invoiceLoading.value = false;
	}
};

onMounted(() => {
	loadInvoices();
});

// Re-fetch when client or org changes (debounced to prevent double-fires)
const debouncedLoadInvoices = useDebounceFn(() => loadInvoices(), 300);
watch([selectedClient, selectedOrg], () => {
	debouncedLoadInvoices();
});
</script>

<template>
	<div class="md:px-6 mx-auto flex items-start justify-center flex-col relative px-4 pt-20">
		<h1 class="page__title">Statistics</h1>
		<div class="w-full flex flex-col items-center min-h-svh z-10 !mt-0 justify-start page__inner">
			<div class="w-full max-w-[1200px] space-y-12">
				<h2 class="text-lg uppercase tracking-wide mb-2 font-thin">{{ greetUser() }} {{ user?.first_name }}.</h2>

				<!-- Ticket Activity -->
				<div>
					<h5
						class="w-full mb-2 uppercase block font-medium text-gray-700 dark:text-gray-200 tracking-wider text-[10px]"
					>
						Ticket Activity:
					</h5>
					<LazyTicketsDashboard />
				</div>

				<!-- Invoice Activity -->
				<div>
					<h5
						class="w-full mb-2 uppercase block font-medium text-gray-700 dark:text-gray-200 tracking-wider text-[10px]"
					>
						Invoice Activity:
					</h5>

					<div v-if="invoiceLoading" class="flex items-center justify-center py-12">
						<Icon name="lucide:loader-2" class="w-6 h-6 text-muted-foreground animate-spin" />
					</div>

					<div v-else class="space-y-6">
						<DashboardInvoiceStats :stats="invoiceStats" />
						<LazyDashboardRevenueTrend :invoices="invoices" />
						<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
							<DashboardClientBreakdown :invoices="invoices" />
							<DashboardProjectProfitability :invoices="invoices" />
						</div>
						<DashboardPaymentAnalysis :invoices="invoices" />
					</div>
				</div>
			</div>
		</div>
	</div>
</template>
