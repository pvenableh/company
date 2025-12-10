export default defineEventHandler(async (event) => {
	const body = await readBody(event);
	const fromNumber = body.From;

	const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Thank you for calling. Our office is currently closed. Please leave a message after the tone.</Say>
  <Record 
    maxLength="120" 
    transcribe="true"
    transcribeCallback="/api/twilio/transcription"
    action="/api/twilio/voicemail-complete"
  />
</Response>`;

	setResponseHeader(event, 'Content-Type', 'text/xml');
	return twiml;
});
