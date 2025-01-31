export const useStripePayout = () => {
	const getPayout = async (chargeId) => {
		try {
			const { data } = await useFetch(`/api/stripe/payouts/${chargeId}`);
			return data.value;
		} catch (error) {
			console.error('Error fetching payout:', error);
			throw error;
		}
	};

	return {
		getPayout,
	};
};
