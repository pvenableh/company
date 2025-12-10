export default defineEventHandler(async (event) => {
	const body = await readBody(event);

	// You can log the recording URL or process it here
	console.log('Voicemail recording URL:', body.RecordingUrl);
	console.log('Recording duration:', body.RecordingDuration);

	const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Thank you for your message. Goodbye.</Say>
  <Hangup/>
</Response>`;

	setResponseHeader(event, 'Content-Type', 'text/xml');
	return twiml;
});
