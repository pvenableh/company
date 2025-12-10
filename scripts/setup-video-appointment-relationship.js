// scripts/setup-video-appointment-relationship.js
// Run with: DIRECTUS_SERVER_TOKEN=your-token node scripts/setup-video-appointment-relationship.js

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'https://admin.huestudios.company';
const DIRECTUS_TOKEN = process.env.DIRECTUS_SERVER_TOKEN;

if (!DIRECTUS_TOKEN) {
	console.error('❌ DIRECTUS_SERVER_TOKEN environment variable is required');
	process.exit(1);
}

const headers = {
	Authorization: `Bearer ${DIRECTUS_TOKEN}`,
	'Content-Type': 'application/json',
};

async function apiRequest(method, endpoint, data = null) {
	const url = `${DIRECTUS_URL}${endpoint}`;
	const options = { method, headers };
	if (data) options.body = JSON.stringify(data);

	const response = await fetch(url, options);
	const result = await response.json();

	if (!response.ok) {
		throw new Error(result.errors?.[0]?.message || `API error: ${response.status}`);
	}
	return result.data;
}

async function fieldExists(collection, field) {
	try {
		await apiRequest('GET', `/fields/${collection}/${field}`);
		return true;
	} catch {
		return false;
	}
}

async function setupRelationship() {
	console.log('🔗 Setting up appointment ↔ video_meeting relationship...\n');

	// 1. Add video_meeting field to appointments (O2O, optional)
	if (!(await fieldExists('appointments', 'video_meeting'))) {
		console.log('Creating appointments.video_meeting field...');
		await apiRequest('POST', '/fields/appointments', {
			field: 'video_meeting',
			type: 'uuid',
			schema: {
				is_nullable: true,
				is_unique: true, // One-to-one
			},
			meta: {
				interface: 'select-dropdown-m2o',
				display: 'related-values',
				display_options: {
					template: '{{title}} - {{scheduled_start}}',
				},
				special: ['m2o'],
				note: 'Linked video meeting (if any)',
				hidden: false,
				width: 'half',
			},
		});

		// Create the M2O relation
		await apiRequest('POST', '/relations', {
			collection: 'appointments',
			field: 'video_meeting',
			related_collection: 'video_meetings',
			meta: {
				one_field: 'appointment', // This creates the reverse O2M on video_meetings
				one_deselect_action: 'nullify',
			},
			schema: {
				on_delete: 'SET NULL',
			},
		});
		console.log('✅ appointments.video_meeting field created');
	} else {
		console.log('⏭️  appointments.video_meeting already exists');
	}

	// 2. Add/update appointment field on video_meetings (reverse side)
	if (!(await fieldExists('video_meetings', 'appointment'))) {
		console.log('Creating video_meetings.appointment field...');
		await apiRequest('POST', '/fields/video_meetings', {
			field: 'appointment',
			type: 'alias',
			meta: {
				interface: 'select-dropdown-m2o',
				display: 'related-values',
				display_options: {
					template: '{{title}}',
				},
				special: ['o2m'],
				note: 'Linked appointment',
				hidden: true, // Hide since it's auto-managed
			},
		});
		console.log('✅ video_meetings.appointment alias created');
	} else {
		console.log('⏭️  video_meetings.appointment already exists');
	}

	// 3. Add is_video field to appointments to easily identify video appointments
	if (!(await fieldExists('appointments', 'is_video'))) {
		console.log('Creating appointments.is_video field...');
		await apiRequest('POST', '/fields/appointments', {
			field: 'is_video',
			type: 'boolean',
			schema: {
				default_value: false,
				is_nullable: false,
			},
			meta: {
				interface: 'boolean',
				display: 'boolean',
				special: ['cast-boolean'],
				note: 'Is this a video meeting?',
				width: 'half',
			},
		});
		console.log('✅ appointments.is_video field created');
	} else {
		console.log('⏭️  appointments.is_video already exists');
	}

	// 4. Add meeting_link field to appointments for easy access
	if (!(await fieldExists('appointments', 'meeting_link'))) {
		console.log('Creating appointments.meeting_link field...');
		await apiRequest('POST', '/fields/appointments', {
			field: 'meeting_link',
			type: 'string',
			schema: {
				is_nullable: true,
			},
			meta: {
				interface: 'input',
				display: 'formatted-value',
				display_options: {
					format: true,
				},
				note: 'Video meeting link (if applicable)',
				width: 'full',
				conditions: [
					{
						rule: { is_video: { _eq: false } },
						hidden: true,
					},
				],
			},
		});
		console.log('✅ appointments.meeting_link field created');
	} else {
		console.log('⏭️  appointments.meeting_link already exists');
	}

	// 5. Add room_name field to appointments for Twilio room reference
	if (!(await fieldExists('appointments', 'room_name'))) {
		console.log('Creating appointments.room_name field...');
		await apiRequest('POST', '/fields/appointments', {
			field: 'room_name',
			type: 'string',
			schema: {
				is_nullable: true,
			},
			meta: {
				interface: 'input',
				note: 'Twilio room name (if video meeting)',
				hidden: true,
			},
		});
		console.log('✅ appointments.room_name field created');
	} else {
		console.log('⏭️  appointments.room_name already exists');
	}

	console.log('\n✅ Relationship setup complete!');
	console.log('\nNow your CalendarView will show:');
	console.log('  - Regular appointments (is_video: false)');
	console.log('  - Video meetings as appointments (is_video: true, with meeting_link)');
}

setupRelationship().catch((error) => {
	console.error('❌ Setup failed:', error.message);
	process.exit(1);
});
