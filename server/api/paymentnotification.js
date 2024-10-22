import sendgrid from '@sendgrid/mail';

sendgrid.setApiKey('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');
export default defineEventHandler(async (event) => {
	const body = await readBody(event);
	const message = {
		personalizations: [
			{
				to: [
					{
						email: body.email,
					},
				],
				bcc: [
					{
						email: 'huestudios.com@gmail.com',
					},
				],
			},
		],
		from: {
			email: 'mail@huestudios.company',
			name: 'hue: company',
		},

		template_id: 'd-c2e9769eb2e54c14b66602ea53cee395',
		replyTo: {
			email: 'contact@huestudios.com',
			name: 'hue: company',
		},
		subject: 'Payment Received on huestudios.company',
		content: [
			{
				type: 'text/html',
				value: '&nbsp;',
			},
		],
		dynamicTemplateData: {
			email: body.email,
			name: body.name,
			address: body.address,
			amount: body.amount,
			title: body.title,
			description: body.description,
		},
		categories: ['hue'],
	};
	sendgrid
		.send(message)
		.then((res) => console.log(res))
		.catch((error) => {
			console.error(error);
		});
	return;
});
