export default defineEventHandler(async (event) => {
	try {
		// Get runtime config
		const config = useRuntimeConfig();
		const stripe = getStripeConfig(config);

		// Read the request body for POST requests
		const body = await readBody(event);

		// Log incoming request
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
			},
		};

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
		const options = body.paymentType ? paymentOptions[body.paymentType] : paymentOptions.default;

		// If customer ID is provided, attach it
		if (body.customer) {
			options.customer = body.customer;
		}

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
			email: body.email,
			payment_type: body.paymentType || 'automatic',
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
