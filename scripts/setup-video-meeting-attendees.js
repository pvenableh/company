// scripts/setup-video-meeting-attendees.js
// Run with: DIRECTUS_SERVER_TOKEN=your-token node scripts/setup-video-meeting-attendees.js

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'https://admin.earnest.guru';
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

async function collectionExists(collection) {
	try {
		await apiRequest('GET', `/collections/${collection}`);
		return true;
	} catch {
		return false;
	}
}

async function fieldExists(collection, field) {
	try {
		await apiRequest('GET', `/fields/${collection}/${field}`);
		return true;
	} catch {
		return false;
	}
}

async function relationExists(collection, field) {
	try {
		const relations = await apiRequest('GET', `/relations/${collection}`);
		return relations?.some((r) => r.field === field) || false;
	} catch {
		return false;
	}
}

async function createFieldIfNotExists(collection, field, config) {
	if (await fieldExists(collection, field)) {
		console.log(`   ⏭️  ${collection}.${field} already exists`);
		return false;
	}

	await apiRequest('POST', `/fields/${collection}`, { field, ...config });
	console.log(`   ✅ ${collection}.${field} created`);
	return true;
}

async function createRelationIfNotExists(config) {
	if (await relationExists(config.collection, config.field)) {
		console.log(`   ⏭️  Relation ${config.collection}.${config.field} already exists`);
		return false;
	}

	await apiRequest('POST', '/relations', config);
	console.log(`   ✅ Relation ${config.collection}.${config.field} created`);
	return true;
}

async function setup() {
	console.log('🎬 Setting up video meeting attendees system...\n');

	// 1. Create video_meeting_attendees collection if it doesn't exist
	if (!(await collectionExists('video_meeting_attendees'))) {
		console.log('Creating video_meeting_attendees collection...');
		await apiRequest('POST', '/collections', {
			collection: 'video_meeting_attendees',
			meta: {
				icon: 'group',
				note: 'Attendees/invitees for video meetings',
				hidden: false,
				singleton: false,
			},
			schema: {},
		});
		console.log('✅ video_meeting_attendees collection created');
	} else {
		console.log('⏭️  video_meeting_attendees collection already exists');
	}

	console.log('\nCreating fields...');

	// ID field
	await createFieldIfNotExists('video_meeting_attendees', 'id', {
		type: 'uuid',
		schema: { is_primary_key: true, has_auto_increment: false },
		meta: { special: ['uuid'], interface: 'input', readonly: true, hidden: true },
	});

	// video_meeting field (M2O)
	await createFieldIfNotExists('video_meeting_attendees', 'video_meeting', {
		type: 'uuid',
		schema: { is_nullable: false },
		meta: {
			interface: 'select-dropdown-m2o',
			special: ['m2o'],
			display: 'related-values',
			display_options: { template: '{{title}}' },
		},
	});

	// Create relation to video_meetings
	await createRelationIfNotExists({
		collection: 'video_meeting_attendees',
		field: 'video_meeting',
		related_collection: 'video_meetings',
		meta: { one_field: 'attendees' },
		schema: { on_delete: 'CASCADE' },
	});

	// Attendee type
	await createFieldIfNotExists('video_meeting_attendees', 'attendee_type', {
		type: 'string',
		schema: { default_value: 'guest', is_nullable: false },
		meta: {
			interface: 'select-dropdown',
			options: {
				choices: [
					{ text: 'Directus User', value: 'user' },
					{ text: 'External Guest', value: 'guest' },
				],
			},
			width: 'half',
		},
	});

	// directus_user field (for internal users)
	await createFieldIfNotExists('video_meeting_attendees', 'directus_user', {
		type: 'uuid',
		schema: { is_nullable: true },
		meta: {
			interface: 'select-dropdown-m2o',
			special: ['m2o'],
			display: 'user',
			width: 'half',
			conditions: [{ rule: { attendee_type: { _neq: 'user' } }, hidden: true }],
		},
	});

	// Create relation to directus_users
	await createRelationIfNotExists({
		collection: 'video_meeting_attendees',
		field: 'directus_user',
		related_collection: 'directus_users',
		schema: { on_delete: 'SET NULL' },
	});

	// Guest name
	await createFieldIfNotExists('video_meeting_attendees', 'guest_name', {
		type: 'string',
		schema: { is_nullable: true },
		meta: { interface: 'input', width: 'half', note: 'Name for external guests' },
	});

	// Guest email
	await createFieldIfNotExists('video_meeting_attendees', 'guest_email', {
		type: 'string',
		schema: { is_nullable: true },
		meta: { interface: 'input', width: 'half', note: 'Email for external guests' },
	});

	// Guest phone
	await createFieldIfNotExists('video_meeting_attendees', 'guest_phone', {
		type: 'string',
		schema: { is_nullable: true },
		meta: { interface: 'input', width: 'half' },
	});

	// Status for waiting room
	await createFieldIfNotExists('video_meeting_attendees', 'status', {
		type: 'string',
		schema: { default_value: 'invited', is_nullable: false },
		meta: {
			interface: 'select-dropdown',
			display: 'labels',
			display_options: {
				choices: [
					{ text: 'Invited', value: 'invited', foreground: '#fff', background: '#6b7280' },
					{ text: 'Waiting', value: 'waiting', foreground: '#fff', background: '#f59e0b' },
					{ text: 'Admitted', value: 'admitted', foreground: '#fff', background: '#10b981' },
					{ text: 'Rejected', value: 'rejected', foreground: '#fff', background: '#ef4444' },
					{ text: 'In Meeting', value: 'in_meeting', foreground: '#fff', background: '#3b82f6' },
					{ text: 'Left', value: 'left', foreground: '#fff', background: '#9ca3af' },
				],
			},
			options: {
				choices: [
					{ text: 'Invited', value: 'invited' },
					{ text: 'Waiting', value: 'waiting' },
					{ text: 'Admitted', value: 'admitted' },
					{ text: 'Rejected', value: 'rejected' },
					{ text: 'In Meeting', value: 'in_meeting' },
					{ text: 'Left', value: 'left' },
				],
			},
			width: 'half',
		},
	});

	// Invite sent timestamp
	await createFieldIfNotExists('video_meeting_attendees', 'invite_sent_at', {
		type: 'timestamp',
		schema: { is_nullable: true },
		meta: { interface: 'datetime', width: 'half' },
	});

	// Joined timestamp
	await createFieldIfNotExists('video_meeting_attendees', 'joined_at', {
		type: 'timestamp',
		schema: { is_nullable: true },
		meta: { interface: 'datetime', width: 'half' },
	});

	// Left timestamp
	await createFieldIfNotExists('video_meeting_attendees', 'left_at', {
		type: 'timestamp',
		schema: { is_nullable: true },
		meta: { interface: 'datetime', width: 'half' },
	});

	// Invite method used
	await createFieldIfNotExists('video_meeting_attendees', 'invite_method', {
		type: 'string',
		schema: { is_nullable: true },
		meta: {
			interface: 'select-dropdown',
			options: {
				choices: [
					{ text: 'Email', value: 'email' },
					{ text: 'SMS', value: 'sms' },
					{ text: 'Both', value: 'both' },
					{ text: 'Link Only', value: 'link' },
				],
			},
			width: 'half',
		},
	});

	// Standard fields
	await createFieldIfNotExists('video_meeting_attendees', 'date_created', {
		type: 'timestamp',
		schema: { is_nullable: true },
		meta: { special: ['date-created'], interface: 'datetime', readonly: true, hidden: true },
	});

	await createFieldIfNotExists('video_meeting_attendees', 'date_updated', {
		type: 'timestamp',
		schema: { is_nullable: true },
		meta: { special: ['date-updated'], interface: 'datetime', readonly: true, hidden: true },
	});

	// 2. Add attendees O2M field to video_meetings
	console.log('\nAdding fields to video_meetings...');

	await createFieldIfNotExists('video_meetings', 'attendees', {
		type: 'alias',
		meta: {
			interface: 'list-o2m',
			special: ['o2m'],
			display: 'related-values',
			display_options: { template: '{{guest_name}} ({{status}})' },
			options: {
				template: '{{guest_name}} - {{guest_email}}',
				enableCreate: true,
				enableSelect: false,
			},
		},
	});

	// 3. Add waiting_room_enabled field to video_meetings
	await createFieldIfNotExists('video_meetings', 'waiting_room_enabled', {
		type: 'boolean',
		schema: { default_value: true, is_nullable: false },
		meta: {
			interface: 'boolean',
			display: 'boolean',
			special: ['cast-boolean'],
			note: 'Require host to admit guests before they can join',
			width: 'half',
		},
	});

	console.log('\n✅ Setup complete!');
	console.log('\n⚠️  IMPORTANT: Configure public role permissions in Directus:');
	console.log('   1. Go to Settings → Access Control → Public');
	console.log('   2. video_meetings: Allow READ with filter { status: { _eq: "scheduled" } }');
	console.log('   3. video_meeting_attendees: Allow READ and UPDATE on own records');
}

setup().catch((error) => {
	console.error('❌ Setup failed:', error.message);
	process.exit(1);
});
