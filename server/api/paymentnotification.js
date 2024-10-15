import sendgrid from '@sendgrid/mail';

sendgrid.setApiKey('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');
export default defineEventHandler(async (event) => {
    const body = await readBody(event)
    const message = {
        personalizations: [{
            to: [{
                email: body.email
            }],
            bcc: [
                {
                    email: 'support@frayednot.net',
                },
                {
                    email: 'huestudios.com@gmail.com',
                }
            ],
        }],
        from: {
            email: 'mail@frayednot.net',
            name: 'frayednot Support Group'
        },

        template_id: 'd-c2e9769eb2e54c14b66602ea53cee395',
        replyTo: {
            email: 'support@frayednot.net',
            name: 'frayednot Support Group'
        },
        subject: 'Payment Received on frayednot.net',
        content: [{
            type: 'text/html',
            value: '&nbsp;'
        }],
        dynamicTemplateData: {
            email: body.email,
            name: body.name,
            address: body.address,
            amount: body.amount,
            title: body.title,
            description: body.description
        },
        categories: [
            'frayednot'
        ],
    };
    sendgrid.send(message)
        .then((res) => console.log(res))
        .catch(error => {
            console.error(error);
        });
    return
})