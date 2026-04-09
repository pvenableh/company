// composables/useStripeCharge.js
export const useStripeCharge = () => {
	const getCharge = async (chargeId) => {
		const { data, error } = await useFetch('/api/stripe/charge', {
			query: {
				charge_id: chargeId,
			},
			onRequest({ request, options }) {
				// Handle request setup if needed
			},
			onRequestError({ request, options, error }) {
				console.error('Request error:', error);
				throw error;
			},
			onResponse({ request, response, options }) {
				// Handle successful response
				if (response._data.error) {
					throw new Error(response._data.error);
				}
				console.log('Charge data:', response._data);
				console.log(options);
				return response._data;
			},
			onResponseError({ request, response, options }) {
				console.error('Response error:', response._data);
				throw new Error(response._data.message || 'Failed to retrieve charge');
			},
		});

		if (error.value) {
			throw new Error(error.value.message || 'Failed to retrieve charge');
		}

		return data.value;
	};

	return {
		getCharge,
	};
};
