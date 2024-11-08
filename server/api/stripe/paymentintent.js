import Stripe from 'stripe';

// Constants for configuration
const SUPPORTED_PAYMENT_TYPES = ['card', 'us_bank_account'];
const SUPPORTED_CURRENCIES = ['usd'];
const MIN_AMOUNT = 50; // 50 cents minimum
const MAX_AMOUNT = 999999999; // $9,999,999.99 maximum

// Utility function to validate email
const isValidEmail = (email) => {
	return email && email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
};

// Utility function to validate amount
const isValidAmount = (amount) => {
	const parsedAmount = parseInt(amount);
	return !isNaN(parsedAmount) && parsedAmount >= MIN_AMOUNT && parsedAmount <= MAX_AMOUNT;
};

// Configure Stripe based on environment
const getStripeConfig = (config) => {
	const stripeSecretKey =
		process.env.NODE_ENV === 'production' ? config.stripeSecretKeyLive : config.stripeSecretKeyTest;

	return new Stripe(stripeSecretKey, {
		apiVersion: '2023-10-16', // Specify Stripe API version
		maxNetworkRetries: 2, // Automatically retry failed requests
	});
};

export default defineEventHandler(async (event) => {
	try {
		const config = useRuntimeConfig();
		const stripe = getStripeConfig(config);
		const query = getQuery(event);

		// Input validation
		const validationErrors = [];

		if (!query.amount || !isValidAmount(query.amount)) {
			validationErrors.push('Invalid amount specified');
		}

		if (!query.email || !isValidEmail(query.email)) {
			validationErrors.push('Invalid email address');
		}

		if (query.paymentType && !SUPPORTED_PAYMENT_TYPES.includes(query.paymentType)) {
			validationErrors.push('Unsupported payment type');
		}

		if (validationErrors.length > 0) {
			throw createError({
				statusCode: 400,
				message: 'Validation failed',
				data: validationErrors,
			});
		}

		// Construct payment intent options
		const baseOptions = {
			amount: parseInt(query.amount),
			currency: SUPPORTED_CURRENCIES[0],
			receipt_email: query.email,
			statement_descriptor: config.public.companyName || 'Payment',
			statement_descriptor_suffix: query.reference || '',
			metadata: {
				environment: process.env.NODE_ENV,
				client_reference: query.reference || '',
				created_at: new Date().toISOString(),
			},
		};

		// Add payment method specific options
		const paymentOptions = {
			card: {
				...baseOptions,
				payment_method_types: ['card', 'link'],
				setup_future_usage: query.saveCard ? 'on_session' : undefined,
			},
			us_bank_account: {
				...baseOptions,
				payment_method_types: ['us_bank_account'],
				payment_method_options: {
					us_bank_account: {
						financial_connections: {
							permissions: ['payment_method', 'balances'],
						},
					},
				},
			},
			default: {
				...baseOptions,
				automatic_payment_methods: {
					enabled: true,
				},
			},
		};

		// Create payment intent with appropriate options
		const options = query.paymentType ? paymentOptions[query.paymentType] : paymentOptions.default;

		// If customer ID is provided, attach it
		if (query.customer) {
			options.customer = query.customer;
		}

		// Create the payment intent
		const paymentIntent = await stripe.paymentIntents.create(options);

		// Log successful creation (you might want to use a proper logging service)
		console.info('Payment intent created:', {
			id: paymentIntent.id,
			amount: paymentIntent.amount,
			email: query.email,
			payment_type: query.paymentType || 'automatic',
			timestamp: new Date().toISOString(),
		});

		return {
			clientSecret: paymentIntent.client_secret,
			id: paymentIntent.id,
			amount: paymentIntent.amount,
		};
	} catch (error) {
		// Log the error (you might want to use a proper logging service)
		console.error('Payment intent creation failed:', {
			error: error.message,
			code: error.code,
			type: error.type,
			timestamp: new Date().toISOString(),
		});

		// Handle Stripe specific errors
		if (error instanceof Stripe.errors.StripeError) {
			throw createError({
				statusCode: error.statusCode || 400,
				message: error.message,
				data: {
					code: error.code,
					type: error.type,
					param: error.param,
				},
			});
		}

		// Handle other errors
		throw createError({
			statusCode: error.statusCode || 500,
			message: 'Payment intent creation failed',
			data: process.env.NODE_ENV === 'development' ? error.message : undefined,
		});
	}
});
