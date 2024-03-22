import sgMail from '@sendgrid/mail';
import { readFileSync } from 'fs';

sgMail.setApiKey('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');
export default defineEventHandler(async (event) => {
    const body = await readBody(event)
    const recipients = body.data.recipients
    const messages = []
    let attachment = []
    if(body.data.data.attachment) {
        const file = 'https://admin.1033lenox.com/assets/' + body.data.data.attachment;
        const file64 = readFileSync(file, 'base64')
        attachment = [
            {
              content: file64,
              filename: 'index.pdf',
              type: 'application/pdf',
              disposition: 'attachment',
             
            }
        ]
    }
    recipients.forEach(element => {
        if (element.people_id.email && element.people_id.unit.length > 0) {
            messages.push(
                {
                    personalizations: [{
                        to: [{
                            email: element.people_id.email,
                        }],
                        bcc: [{
                            email: 'huestudios.com@gmail.com',
                        }]
                    }],
                    from: {
                        email: 'mail@1033lenox.com',
                        name: '1033 Lenox'
                    },
                    template_id: 'd-035e7712976d45aaa5143d8a1042aee7',
                    replyTo: {
                        email: 'lenoxplazaboard@gmail.com',
                        name: 'Lenox Plaza Board'
                    },
                    subject: 'Attention ' + element.people_id.first_name + ': ' + body.data.data.title,
                    content: [{
                        type: 'text/html',
                        value: '&nbsp;'
                    }],
                    dynamicTemplateData: {
                        first_name: element.people_id.first_name,
                        unit: element.people_id.unit[0].units_id.number,
                        title: body.data.data.title,
                        subtitle: body.data.data.subtitle,
                        urgent: body.data.data.urgent,
                        content: body.data.data.content + attachment,
                        url: body.data.data.url,
                        closing: body.data.data.closing,
                    },
                    categories: [
                        'announcements'
                    ],
                    // attachments: attachment,
                }
            )
        }
    })
 

    sgMail.send(messages).then(() => {}, error => {
        console.error(error)
        if (error.response) {
            console.error(error.response.body)
            const error = error.response.body
        }
  })
})