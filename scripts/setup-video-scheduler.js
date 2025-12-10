// scripts/setup-video-scheduler.js
// Creates video_meetings collection and updates scheduler-related collections
// Run: DIRECTUS_SERVER_TOKEN=your-token node scripts/setup-video-scheduler.js

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'https://admin.huestudios.company';
const DIRECTUS_TOKEN = process.env.DIRECTUS_SERVER_TOKEN;

if (!DIRECTUS_TOKEN) {
	console.error('❌ DIRECTUS_SERVER_TOKEN environment variable is required');
	console.error('Usage: DIRECTUS_SERVER_TOKEN=your-token node scripts/setup-video-scheduler.js');
	process.exit(1);
}

const headers = {
	'Content-Type': 'application/json',
	Authorization: `Bearer ${DIRECTUS_TOKEN}`,
};

async function createCollection(name, meta, fields) {
	console.log(`\n📦 Creating collection: ${name}`);
	
	try {
		const res = await fetch(`${DIRECTUS_URL}/collections`, {
			method: 'POST',
			headers,
			body: JSON.stringify({
				collection: name,
				meta,
				schema: { name },
				fields,
			}),
		});

		if (!res.ok) {
			const error = await res.json();
			if (error.errors?.[0]?.message?.includes('already exists')) {
				console.log(`  ℹ️  Collection "${name}" already exists`);
				return true;
			}
			throw new Error(error.errors?.[0]?.message || 'Unknown error');
		}
		
		console.log(`  ✅ Collection "${name}" created`);
		return true;
	} catch (err) {
		console.error(`  ❌ Error: ${err.message}`);
		return false;
	}
}

async function createField(collection, field) {
	try {
		const res = await fetch(`${DIRECTUS_URL}/fields/${collection}`, {
			method: 'POST',
			headers,
			body: JSON.stringify(field),
		});

		if (!res.ok) {
			const error = await res.json();
			if (error.errors?.[0]?.message?.includes('already exists')) {
				console.log(`  ℹ️  Field "${field.field}" already exists`);
				return true;
			}
			console.log(`  ❌ Field "${field.field}": ${error.errors?.[0]?.message || 'Error'}`);
			return false;
		}
		
		console.log(`  ✅ Field "${field.field}" created`);
		return true;
	} catch (err) {
		console.log(`  ❌ Field "${field.field}": ${err.message}`);
		return false;
	}
}

async function createRelation(relation) {
	try {
		const res = await fetch(`${DIRECTUS_URL}/relations`, {
			method: 'POST',
			headers,
			body: JSON.stringify(relation),
		});

		if (!res.ok) {
			const error = await res.json();
			if (error.errors?.[0]?.message?.includes('already exists')) {
				console.log(`  ℹ️  Relation already exists`);
				return true;
			}
			console.log(`  ❌ Relation error: ${error.errors?.[0]?.message || 'Error'}`);
			return false;
		}
		
		console.log(`  ✅ Relation created`);
		return true;
	} catch (err) {
		console.log(`  ❌ Relation error: ${err.message}`);
		return false;
	}
}

async function setup() {
	console.log('='.repeat(60));
	console.log('🎥 VIDEO MEETINGS & SCHEDULER SETUP');
	console.log('='.repeat(60));
	console.log(`Directus URL: ${DIRECTUS_URL}`);

	// ============================================================
	// STEP 1: Create video_meetings collection
	// ============================================================
	console.log('\n' + '='.repeat(60));
	console.log('STEP 1: Creating video_meetings collection');
	console.log('='.repeat(60));

	await createCollection(
		'video_meetings',
		{
			collection: 'video_meetings',
			icon: 'videocam',
			note: 'Video conference meetings with Twilio integration',
			display_template: '{{title}} - {{status}}',
			archive_field: 'status',
			archive_value: 'archived',
			unarchive_value: 'scheduled',
			sort_field: 'sort',
			accountability: 'all',
		},
		[
			{
				field: 'id',
				type: 'uuid',
				meta: { special: ['uuid'], interface: 'input', readonly: true, hidden: true },
				schema: { is_primary_key: true, has_auto_increment: false },
			},
			{
				field: 'status',
				type: 'string',
				meta: {
					width: 'half',
					interface: 'select-dropdown',
					options: {
						choices: [
							{ text: 'Scheduled', value: 'scheduled' },
							{ text: 'In Progress', value: 'in_progress' },
							{ text: 'Completed', value: 'completed' },
							{ text: 'Cancelled', value: 'cancelled' },
							{ text: 'No Show', value: 'no_show' },
							{ text: 'Archived', value: 'archived' },
						],
					},
					display: 'labels',
					display_options: {
						showAsDot: true,
						choices: [
							{ text: 'Scheduled', value: 'scheduled', foreground: '#FFFFFF', background: '#3B82F6' },
							{ text: 'In Progress', value: 'in_progress', foreground: '#FFFFFF', background: '#10B981' },
							{ text: 'Completed', value: 'completed', foreground: '#FFFFFF', background: '#6B7280' },
							{ text: 'Cancelled', value: 'cancelled', foreground: '#FFFFFF', background: '#EF4444' },
							{ text: 'No Show', value: 'no_show', foreground: '#FFFFFF', background: '#F59E0B' },
						],
					},
				},
				schema: { default_value: 'scheduled' },
			},
			{
				field: 'sort',
				type: 'integer',
				meta: { interface: 'input', hidden: true },
				schema: {},
			},
			{
				field: 'user_created',
				type: 'uuid',
				meta: { special: ['user-created'], interface: 'select-dropdown-m2o', display: 'user', readonly: true, hidden: true, width: 'half' },
				schema: {},
			},
			{
				field: 'date_created',
				type: 'timestamp',
				meta: { special: ['date-created'], interface: 'datetime', readonly: true, hidden: true, width: 'half', display: 'datetime', display_options: { relative: true } },
				schema: {},
			},
			{
				field: 'user_updated',
				type: 'uuid',
				meta: { special: ['user-updated'], interface: 'select-dropdown-m2o', display: 'user', readonly: true, hidden: true, width: 'half' },
				schema: {},
			},
			{
				field: 'date_updated',
				type: 'timestamp',
				meta: { special: ['date-updated'], interface: 'datetime', readonly: true, hidden: true, width: 'half', display: 'datetime', display_options: { relative: true } },
				schema: {},
			},
		]
	);

	// Add video_meetings fields
	console.log('\n📝 Adding video_meetings fields...');
	
	const videoMeetingFields = [
		// Room Info
		{ field: 'room_name', type: 'string', meta: { interface: 'input', width: 'half', note: 'Unique room identifier', required: true, sort: 1, group: null }, schema: { is_unique: true } },
		{ field: 'room_sid', type: 'string', meta: { interface: 'input', width: 'half', note: 'Twilio Room SID', readonly: true, sort: 2 }, schema: {} },
		
		// Meeting Details
		{ field: 'title', type: 'string', meta: { interface: 'input', width: 'full', note: 'Meeting title', required: true, sort: 3 }, schema: {} },
		{ field: 'description', type: 'text', meta: { interface: 'input-multiline', width: 'full', note: 'Meeting description or agenda', sort: 4 }, schema: {} },
		{
			field: 'meeting_type',
			type: 'string',
			meta: {
				interface: 'select-dropdown',
				width: 'half',
				sort: 5,
				options: {
					choices: [
						{ text: 'Consultation', value: 'consultation' },
						{ text: 'Discovery Call', value: 'discovery' },
						{ text: 'Project Review', value: 'project_review' },
						{ text: 'Presentation', value: 'presentation' },
						{ text: 'Follow-up', value: 'followup' },
						{ text: 'General', value: 'general' },
					],
				},
			},
			schema: { default_value: 'general' },
		},
		{
			field: 'duration_minutes',
			type: 'integer',
			meta: {
				interface: 'select-dropdown',
				width: 'half',
				sort: 6,
				options: {
					choices: [
						{ text: '15 minutes', value: 15 },
						{ text: '30 minutes', value: 30 },
						{ text: '45 minutes', value: 45 },
						{ text: '60 minutes', value: 60 },
						{ text: '90 minutes', value: 90 },
						{ text: '120 minutes', value: 120 },
					],
				},
			},
			schema: { default_value: 30 },
		},
		
		// Scheduling
		{ field: 'scheduled_start', type: 'timestamp', meta: { interface: 'datetime', width: 'half', display: 'datetime', note: 'Scheduled start time', sort: 7 }, schema: {} },
		{ field: 'scheduled_end', type: 'timestamp', meta: { interface: 'datetime', width: 'half', display: 'datetime', note: 'Scheduled end time', sort: 8 }, schema: {} },
		{ field: 'actual_start', type: 'timestamp', meta: { interface: 'datetime', width: 'half', display: 'datetime', readonly: true, sort: 9 }, schema: {} },
		{ field: 'actual_end', type: 'timestamp', meta: { interface: 'datetime', width: 'half', display: 'datetime', readonly: true, sort: 10 }, schema: {} },
		{ field: 'actual_duration_minutes', type: 'integer', meta: { interface: 'input', width: 'half', readonly: true, sort: 11 }, schema: {} },
		
		// Host Info
		{ field: 'host_identity', type: 'string', meta: { interface: 'input', width: 'half', note: 'Host display name', sort: 12 }, schema: {} },
		{ field: 'host_user', type: 'uuid', meta: { interface: 'select-dropdown-m2o', width: 'half', note: 'Host user (staff member)', sort: 13, options: { template: '{{first_name}} {{last_name}}' } }, schema: {} },
		
		// Participant Settings
		{ field: 'max_participants', type: 'integer', meta: { interface: 'input', width: 'half', sort: 14 }, schema: { default_value: 10 } },
		{ field: 'participant_count', type: 'integer', meta: { interface: 'input', width: 'half', readonly: true, note: 'Peak concurrent participants', sort: 15 }, schema: { default_value: 0 } },
		
		// Recording
		{ field: 'recording_enabled', type: 'boolean', meta: { interface: 'boolean', width: 'half', sort: 16 }, schema: { default_value: false } },
		{ field: 'recording_url', type: 'string', meta: { interface: 'input', width: 'full', readonly: true, sort: 17 }, schema: {} },
		
		// Meeting Access
		{ field: 'meeting_url', type: 'string', meta: { interface: 'input', width: 'full', readonly: true, sort: 18 }, schema: {} },
		{ field: 'password', type: 'string', meta: { interface: 'input', width: 'half', note: 'Optional password protection', sort: 19 }, schema: {} },
		
		// Invitee Info (for external guests)
		{ field: 'invitee_name', type: 'string', meta: { interface: 'input', width: 'half', note: 'Guest name', sort: 20 }, schema: {} },
		{ field: 'invitee_email', type: 'string', meta: { interface: 'input', width: 'half', note: 'Guest email for invite', sort: 21 }, schema: {} },
		{ field: 'invitee_phone', type: 'string', meta: { interface: 'input', width: 'half', note: 'Guest phone for SMS invite', sort: 22 }, schema: {} },
		{
			field: 'invite_method',
			type: 'string',
			meta: {
				interface: 'select-dropdown',
				width: 'half',
				sort: 23,
				options: {
					choices: [
						{ text: 'Email', value: 'email' },
						{ text: 'SMS', value: 'sms' },
						{ text: 'Both', value: 'both' },
						{ text: 'None', value: 'none' },
					],
				},
			},
			schema: { default_value: 'email' },
		},
		{ field: 'invite_sent', type: 'boolean', meta: { interface: 'boolean', width: 'half', sort: 24 }, schema: { default_value: false } },
		{ field: 'invite_sent_at', type: 'timestamp', meta: { interface: 'datetime', width: 'half', readonly: true, sort: 25 }, schema: {} },
		
		// Reminders
		{ field: 'reminder_sent', type: 'boolean', meta: { interface: 'boolean', width: 'half', sort: 26 }, schema: { default_value: false } },
		{ field: 'reminder_sent_at', type: 'timestamp', meta: { interface: 'datetime', width: 'half', readonly: true, sort: 27 }, schema: {} },
		{
			field: 'reminder_minutes_before',
			type: 'integer',
			meta: {
				interface: 'select-dropdown',
				width: 'half',
				sort: 28,
				options: {
					choices: [
						{ text: 'No reminder', value: 0 },
						{ text: '15 minutes', value: 15 },
						{ text: '30 minutes', value: 30 },
						{ text: '1 hour', value: 60 },
						{ text: '1 day', value: 1440 },
					],
				},
			},
			schema: { default_value: 60 },
		},
		
		// Booking Info (for public booking)
		{ field: 'booked_via', type: 'string', meta: { interface: 'select-dropdown', width: 'half', sort: 29, options: { choices: [{ text: 'Direct', value: 'direct' }, { text: 'Public Booking', value: 'public' }, { text: 'Phone IVR', value: 'phone' }, { text: 'API', value: 'api' }] } }, schema: { default_value: 'direct' } },
		{ field: 'booking_notes', type: 'text', meta: { interface: 'input-multiline', width: 'full', note: 'Notes from booking form', sort: 30 }, schema: {} },
		
		// Relations (will be set up separately)
		{ field: 'related_contact', type: 'uuid', meta: { interface: 'select-dropdown-m2o', width: 'half', sort: 31, options: { template: '{{first_name}} {{last_name}}' } }, schema: {} },
		{ field: 'related_organization', type: 'uuid', meta: { interface: 'select-dropdown-m2o', width: 'half', sort: 32, options: { template: '{{name}}' } }, schema: {} },
		{ field: 'related_appointment', type: 'uuid', meta: { interface: 'select-dropdown-m2o', width: 'half', sort: 33, options: { template: '{{title}}' } }, schema: {} },
		
		// Participant Log
		{ field: 'participants_log', type: 'json', meta: { interface: 'input-code', width: 'full', sort: 34, options: { language: 'json' }, note: 'JSON log of participant events' }, schema: {} },
		
		// Notes & Follow-up
		{ field: 'notes', type: 'text', meta: { interface: 'input-rich-text-html', width: 'full', sort: 35 }, schema: {} },
		{ field: 'follow_up_required', type: 'boolean', meta: { interface: 'boolean', width: 'half', sort: 36 }, schema: { default_value: false } },
		{ field: 'follow_up_notes', type: 'text', meta: { interface: 'input-multiline', width: 'full', sort: 37 }, schema: {} },
		
		// Calendar Sync
		{ field: 'google_event_id', type: 'string', meta: { interface: 'input', width: 'half', readonly: true, hidden: true, sort: 38 }, schema: {} },
		{ field: 'outlook_event_id', type: 'string', meta: { interface: 'input', width: 'half', readonly: true, hidden: true, sort: 39 }, schema: {} },
	];

	for (const field of videoMeetingFields) {
		await createField('video_meetings', field);
	}

	// Create relations for video_meetings
	console.log('\n🔗 Creating video_meetings relations...');
	
	await createRelation({
		collection: 'video_meetings',
		field: 'host_user',
		related_collection: 'directus_users',
		meta: { sort_field: null },
		schema: { on_delete: 'SET NULL' },
	});

	await createRelation({
		collection: 'video_meetings',
		field: 'related_contact',
		related_collection: 'contacts',
		meta: { sort_field: null },
		schema: { on_delete: 'SET NULL' },
	});

	await createRelation({
		collection: 'video_meetings',
		field: 'related_organization',
		related_collection: 'organizations',
		meta: { sort_field: null },
		schema: { on_delete: 'SET NULL' },
	});

	await createRelation({
		collection: 'video_meetings',
		field: 'related_appointment',
		related_collection: 'appointments',
		meta: { sort_field: null },
		schema: { on_delete: 'SET NULL' },
	});

	// ============================================================
	// STEP 2: Update appointments collection
	// ============================================================
	console.log('\n' + '='.repeat(60));
	console.log('STEP 2: Updating appointments collection');
	console.log('='.repeat(60));

	const appointmentFields = [
		{ field: 'is_video', type: 'boolean', meta: { interface: 'boolean', width: 'half', note: 'Is this a video meeting?' }, schema: { default_value: false } },
		{ field: 'video_meeting', type: 'uuid', meta: { interface: 'select-dropdown-m2o', width: 'half', note: 'Linked video meeting', options: { template: '{{title}} ({{room_name}})' } }, schema: {} },
		{ field: 'google_event_id', type: 'string', meta: { interface: 'input', width: 'half', readonly: true, hidden: true }, schema: {} },
		{ field: 'outlook_event_id', type: 'string', meta: { interface: 'input', width: 'half', readonly: true, hidden: true }, schema: {} },
		{ field: 'reminder_sent', type: 'boolean', meta: { interface: 'boolean', width: 'half', hidden: true }, schema: { default_value: false } },
	];

	console.log('\n📝 Adding appointment fields...');
	for (const field of appointmentFields) {
		await createField('appointments', field);
	}

	// Create relation for video_meeting
	await createRelation({
		collection: 'appointments',
		field: 'video_meeting',
		related_collection: 'video_meetings',
		meta: { sort_field: null },
		schema: { on_delete: 'SET NULL' },
	});

	// ============================================================
	// STEP 3: Create scheduler_settings collection
	// ============================================================
	console.log('\n' + '='.repeat(60));
	console.log('STEP 3: Creating scheduler_settings collection');
	console.log('='.repeat(60));

	await createCollection(
		'scheduler_settings',
		{
			collection: 'scheduler_settings',
			icon: 'settings',
			note: 'User scheduler preferences and calendar integrations',
			singleton: false,
			accountability: 'all',
		},
		[
			{ field: 'id', type: 'uuid', meta: { special: ['uuid'], interface: 'input', readonly: true, hidden: true }, schema: { is_primary_key: true } },
			{ field: 'user_created', type: 'uuid', meta: { special: ['user-created'], interface: 'select-dropdown-m2o', readonly: true, hidden: true }, schema: {} },
			{ field: 'date_created', type: 'timestamp', meta: { special: ['date-created'], interface: 'datetime', readonly: true, hidden: true }, schema: {} },
			{ field: 'date_updated', type: 'timestamp', meta: { special: ['date-updated'], interface: 'datetime', readonly: true, hidden: true }, schema: {} },
		]
	);

	const settingsFields = [
		{ field: 'user_id', type: 'uuid', meta: { interface: 'select-dropdown-m2o', width: 'full', required: true, options: { template: '{{first_name}} {{last_name}}' } }, schema: {} },
		
		// Default Settings
		{ field: 'default_duration', type: 'integer', meta: { interface: 'select-dropdown', width: 'half', options: { choices: [{ text: '15 min', value: 15 }, { text: '30 min', value: 30 }, { text: '45 min', value: 45 }, { text: '60 min', value: 60 }] } }, schema: { default_value: 30 } },
		{ field: 'default_meeting_type', type: 'string', meta: { interface: 'select-dropdown', width: 'half', options: { choices: [{ text: 'Consultation', value: 'consultation' }, { text: 'Discovery', value: 'discovery' }, { text: 'General', value: 'general' }] } }, schema: { default_value: 'general' } },
		{ field: 'buffer_before', type: 'integer', meta: { interface: 'input', width: 'half', note: 'Minutes buffer before meetings' }, schema: { default_value: 0 } },
		{ field: 'buffer_after', type: 'integer', meta: { interface: 'input', width: 'half', note: 'Minutes buffer after meetings' }, schema: { default_value: 0 } },
		
		// Notifications
		{ field: 'send_confirmations', type: 'boolean', meta: { interface: 'boolean', width: 'half' }, schema: { default_value: true } },
		{ field: 'send_reminders', type: 'boolean', meta: { interface: 'boolean', width: 'half' }, schema: { default_value: true } },
		{ field: 'reminder_time', type: 'integer', meta: { interface: 'select-dropdown', width: 'half', options: { choices: [{ text: '15 min', value: 15 }, { text: '30 min', value: 30 }, { text: '1 hour', value: 60 }, { text: '1 day', value: 1440 }] } }, schema: { default_value: 60 } },
		
		// Public Booking
		{ field: 'public_booking_enabled', type: 'boolean', meta: { interface: 'boolean', width: 'half', note: 'Allow public booking' }, schema: { default_value: true } },
		{ field: 'booking_page_slug', type: 'string', meta: { interface: 'input', width: 'half', note: 'Custom URL slug for booking page' }, schema: {} },
		{ field: 'booking_page_title', type: 'string', meta: { interface: 'input', width: 'full', note: 'Title shown on booking page' }, schema: {} },
		{ field: 'booking_page_description', type: 'text', meta: { interface: 'input-multiline', width: 'full' }, schema: {} },
		
		// Calendar Integrations
		{ field: 'google_calendar_enabled', type: 'boolean', meta: { interface: 'boolean', width: 'half' }, schema: { default_value: false } },
		{ field: 'google_refresh_token', type: 'text', meta: { interface: 'input', width: 'full', hidden: true }, schema: {} },
		{ field: 'google_calendar_id', type: 'string', meta: { interface: 'input', width: 'full' }, schema: {} },
		{ field: 'outlook_calendar_enabled', type: 'boolean', meta: { interface: 'boolean', width: 'half' }, schema: { default_value: false } },
		{ field: 'outlook_refresh_token', type: 'text', meta: { interface: 'input', width: 'full', hidden: true }, schema: {} },
		
		// Timezone
		{ field: 'timezone', type: 'string', meta: { interface: 'select-dropdown', width: 'half', options: { choices: [{ text: 'Eastern', value: 'America/New_York' }, { text: 'Central', value: 'America/Chicago' }, { text: 'Mountain', value: 'America/Denver' }, { text: 'Pacific', value: 'America/Los_Angeles' }] } }, schema: { default_value: 'America/New_York' } },
	];

	console.log('\n📝 Adding scheduler_settings fields...');
	for (const field of settingsFields) {
		await createField('scheduler_settings', field);
	}

	await createRelation({
		collection: 'scheduler_settings',
		field: 'user_id',
		related_collection: 'directus_users',
		meta: { sort_field: null },
		schema: { on_delete: 'CASCADE' },
	});

	// ============================================================
	// STEP 4: Update availability collection
	// ============================================================
	console.log('\n' + '='.repeat(60));
	console.log('STEP 4: Updating availability collection');
	console.log('='.repeat(60));

	const availabilityFields = [
		{ field: 'is_available', type: 'boolean', meta: { interface: 'boolean', width: 'half', note: 'Is this day available?' }, schema: { default_value: true } },
		{ field: 'break_start', type: 'time', meta: { interface: 'datetime', width: 'half', note: 'Break start time' }, schema: {} },
		{ field: 'break_end', type: 'time', meta: { interface: 'datetime', width: 'half', note: 'Break end time' }, schema: {} },
	];

	console.log('\n📝 Adding availability fields...');
	for (const field of availabilityFields) {
		await createField('availability', field);
	}

	// ============================================================
	// DONE
	// ============================================================
	console.log('\n' + '='.repeat(60));
	console.log('✅ SETUP COMPLETE!');
	console.log('='.repeat(60));
	console.log('\n📋 Collections created/updated:');
	console.log('  • video_meetings (new)');
	console.log('  • appointments (updated)');
	console.log('  • scheduler_settings (new)');
	console.log('  • availability (updated)');
	console.log('\n📝 Next steps:');
	console.log('1. Add environment variables:');
	console.log('   TWILIO_API_KEY, TWILIO_API_SECRET');
	console.log('   SENDGRID_API_KEY, SENDGRID_FROM_EMAIL');
	console.log('   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET (for calendar)');
	console.log('   AZURE_CLIENT_ID, AZURE_CLIENT_SECRET (for Outlook)');
	console.log('2. Copy Nuxt files to your project');
	console.log('3. Install dependencies: pnpm add twilio twilio-video @sendgrid/mail googleapis @azure/msal-node');
	console.log('4. Deploy: vercel --prod');
}

setup().catch(console.error);
