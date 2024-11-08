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
		process.env.NODE_ENV === 'production' ? config.STRIPE_SECRET_KEY : config.STRIPE_SECRET_KEY_TEST;

	if (!stripeSecretKey) {
		throw new Error('Stripe secret key not configured');
	}

	const stripe = new Stripe(stripeSecretKey, {
		apiVersion: '2023-10-16',
		maxNetworkRetries: 2,
	});

	return stripe;
};

export default defineEventHandler(async (event) => {
	try {
		// Get request method
		const method = event.method;

		// Get runtime config
		const config = useRuntimeConfig();
		const stripe = getStripeConfig(config);

		// Get request data based on method
		const requestData = method === 'POST' ? await readBody(event) : getQuery(event);

		// Log incoming request
		console.log('Payment Intent Request:', {
			method,
			data: requestData,
			timestamp: new Date().toISOString(),
		});

		// Input validation
		const validationErrors = [];

		if (!requestData.amount || !isValidAmount(requestData.amount)) {
			validationErrors.push('Invalid amount specified');
		}

		if (!requestData.email || !isValidEmail(requestData.email)) {
			validationErrors.push('Invalid email address');
		}

		if (requestData.paymentType && !SUPPORTED_PAYMENT_TYPES.includes(requestData.paymentType)) {
			validationErrors.push('Unsupported payment type');
		}

		// Log validation results
		console.log('Validation Results:', {
			amount: {
				value: requestData.amount,
				isValid: isValidAmount(requestData.amount),
			},
			email: {
				value: requestData.email,
				isValid: isValidEmail(requestData.email),
			},
			paymentType: {
				value: requestData.paymentType,
				isValid: !requestData.paymentType || SUPPORTED_PAYMENT_TYPES.includes(requestData.paymentType),
			},
		});

		if (validationErrors.length > 0) {
			throw createError({
				statusCode: 400,
				message: 'Validation failed',
				data: validationErrors,
			});
		}

		// Construct payment intent options
		const baseOptions = {
			amount: parseInt(requestData.amount),
			currency: SUPPORTED_CURRENCIES[0],
			receipt_email: requestData.email,
			statement_descriptor: config.public.companyName || 'Payment',
			metadata: {
				environment: process.env.NODE_ENV,
				created_at: new Date().toISOString(),
			},
		};

		// Add payment method specific options
		const paymentOptions = {
			card: {
				...baseOptions,
				payment_method_types: ['card'],
				setup_future_usage: requestData.saveCard ? 'on_session' : undefined,
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
		const options = requestData.paymentType ? paymentOptions[requestData.paymentType] : paymentOptions.default;

		// If customer ID is provided, attach it
		if (requestData.customer) {
			options.customer = requestData.customer;
		}

		// Log payment intent options
		console.log('Creating Payment Intent with options:', {
			...options,
			timestamp: new Date().toISOString(),
		});

		// Create the payment intent
		const paymentIntent = await stripe.paymentIntents.create(options);

		// Log successful creation
		console.log('Payment Intent Created:', {
			id: paymentIntent.id,
			amount: paymentIntent.amount,
			email: requestData.email,
			payment_type: requestData.paymentType || 'automatic',
			timestamp: new Date().toISOString(),
		});

		// Return success response
		return {
			clientSecret: paymentIntent.client_secret,
			id: paymentIntent.id,
			amount: paymentIntent.amount,
		};
	} catch (error) {
		// Log the error
		console.error('Payment Intent Error:', {
			error: error.message,
			code: error.code,
			type: error.type,
			stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
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
			message: process.env.NODE_ENV === 'development' ? error.message : 'Payment intent creation failed',
			data: process.env.NODE_ENV === 'development' ? error.stack : undefined,
		});
	}
});
