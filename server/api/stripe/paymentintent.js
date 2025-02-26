import Stripe from 'stripe';

const SUPPORTED_PAYMENT_TYPES = ['card', 'us_bank_account'];
const SUPPORTED_CURRENCIES = ['usd'];
const MIN_AMOUNT = 50; // 50 cents minimum
const MAX_AMOUNT = 999999999; // $9,999,999.99 maximum

// Utility functions
const isValidEmail = (email) => {
	return email && email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
};

const isValidAmount = (amount) => {
	const parsedAmount = parseInt(amount);
	return !isNaN(parsedAmount) && parsedAmount >= MIN_AMOUNT && parsedAmount <= MAX_AMOUNT;
};

export default defineEventHandler(async (event) => {
	let stripe;

	try {
		// Get runtime config
		const config = useRuntimeConfig();

		console.log('Full Config Details:', {
			env: process.env.NODE_ENV,
			stripeSecretKeyTest: config.stripeSecretKeyTest?.slice(0, 8) + '...', // Only log first 8 chars
			stripeSecretKeyLive: config.stripeSecretKeyLive?.slice(0, 8) + '...',
			publicConfig: {
				companyName: config.public.companyName,
				stripePublic: config.public.stripePublic?.slice(0, 8) + '...',
			},
		});

		console.log('Process ENV:', {
			NODE_ENV: process.env.NODE_ENV,
			hasStripeTestKey: !!process.env.STRIPE_SECRET_KEY_TEST,
			hasStripeLiveKey: !!process.env.STRIPE_SECRET_KEY,
		});

		// Initialize Stripe
		const stripeSecretKey =
			process.env.NODE_ENV === 'production' ? config.stripeSecretKeyLive : config.stripeSecretKeyTest;

		if (!stripeSecretKey) {
			throw new Error('Stripe secret key is not configured');
		}

		// Initialize Stripe with logging
		console.log('Initializing Stripe with config:', {
			hasSecretKey: !!stripeSecretKey,
			apiVersion: '2024-10-28.acacia',
			keyPrefix: stripeSecretKey?.substring(0, 3),
		});

		stripe = new Stripe(stripeSecretKey, {
			apiVersion: '2024-10-28.acacia',
			maxNetworkRetries: 2,
		});

		// Test the connection
		const testResult = await stripe.paymentIntents.list({ limit: 1 });
		console.log('Stripe connection test successful:', {
			connected: !!testResult,
			timestamp: new Date().toISOString(),
		});

		// Read the request body for POST requests
		const body = await readBody(event);

		// Log incoming request
		console.log('Request body:', {
			hasAmount: !!body.amount,
			hasEmail: !!body.email,
			paymentType: body.paymentType,
		});

		console.log('Payment Intent Request:', {
			body,
			timestamp: new Date().toISOString(),
		});

		// Input validation
		const validationErrors = [];

		if (!body.amount || !isValidAmount(body.amount)) {
			validationErrors.push('Invalid amount specified');
		}

		if (!body.email || !isValidEmail(body.email)) {
			validationErrors.push('Invalid email address');
		}

		if (body.paymentType && !SUPPORTED_PAYMENT_TYPES.includes(body.paymentType)) {
			validationErrors.push('Unsupported payment type');
		}

		// Log validation results
		console.log('Validation Results:', {
			amount: {
				value: body.amount,
				isValid: isValidAmount(body.amount),
			},
			email: {
				value: body.email,
				isValid: isValidEmail(body.email),
			},
			paymentType: {
				value: body.paymentType,
				isValid: !body.paymentType || SUPPORTED_PAYMENT_TYPES.includes(body.paymentType),
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
			amount: parseInt(body.amount),
			currency: SUPPORTED_CURRENCIES[0],
			receipt_email: body.email,
			statement_descriptor: config.public.companyName || 'Payment',
			metadata: {
				environment: process.env.NODE_ENV,
				created_at: new Date().toISOString(),
				invoice_id: body.invoiceId,
			},
		};

		// Add description if it exists
		if (body.description) {
			baseOptions.description = body.description;
		}

		if (body.invoiceCode) {
			baseOptions.metadata.invoice_code = body.invoice_code;
		}

		// Add payment method specific options
		const paymentOptions = {
			card: {
				...baseOptions,
				payment_method_types: ['card'],
				setup_future_usage: body.saveCard ? 'on_session' : undefined,
			},
			us_bank_account: {
				...baseOptions,
				payment_method_types: ['us_bank_account'],
				payment_method_options: {
					us_bank_account: {
						financial_connections: {
							permissions: ['payment_method'],
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
		const options = body.paymentType ? paymentOptions[body.paymentType] : paymentOptions.default;

		// If customer ID is provided, attach it
		if (body.customer) {
			options.customer = body.customer;
		}

		options.expand = ['latest_charge'];

		console.log('Creating Payment Intent with options:', {
			...options,
			timestamp: new Date().toISOString(),
		});

		// Create the payment intent with expanded latest_charge
		const paymentIntent = await stripe.paymentIntents.create(options);

		// Log successful creation
		console.log('Payment Intent Created:', {
			id: paymentIntent.id,
			amount: paymentIntent.amount,
			email: body.email,
			payment_type: body.paymentType || 'automatic',
			latest_charge: paymentIntent.latest_charge?.id,
			receipt_url: paymentIntent.latest_charge?.receipt_url,
			timestamp: new Date().toISOString(),
		});

		// Return success response
		return {
			clientSecret: paymentIntent.client_secret,
			id: paymentIntent.id,
			amount: paymentIntent.amount,
			latest_charge: paymentIntent.latest_charge,
		};
	} catch (error) {
		// Log the full error
		console.error('Full Payment Intent Error:', {
			message: error.message,
			code: error.code,
			type: error.type,
			raw: error.raw,
			stack: error.stack,
			timestamp: new Date().toISOString(),
		});

		// Handle Stripe specific errors
		if (error instanceof Stripe.errors.StripeError) {
			console.log('Stripe Specific Error:', error);
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
			message:
				process.env.NODE_ENV === 'development'
					? `Payment intent creation failed: ${error.message}`
					: 'Payment intent creation failed',
			data:
				process.env.NODE_ENV === 'development'
					? {
							stack: error.stack,
							details: error,
						}
					: undefined,
		});
	}
});
