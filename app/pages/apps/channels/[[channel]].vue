<script setup>
/**
 * Channels comms hub — the apps-layout home for realtime chat.
 *
 * One page, optional `channel` param: /apps/channels shows the roster; adding a
 * channel name (/apps/channels/general) selects it. Desktop renders both panes
 * side by side; mobile shows one at a time (list → tap → conversation → back),
 * so the URL is the single source of truth for which pane is visible.
 *
 * Reuses the modern, token-based <ChannelsMessage> + Tiptap composer from the
 * classic pages; only the shell was rebuilt to live inside the apps content
 * region (no more h-[calc(100vh-64px)]). Read-state/unread + search land in
 * later phases (project_channels_apps_home).
 */
import { Button } from '~/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '~/components/ui/tooltip';
import { useRealtimeSubscription } from '~/composables/useRealtimeSubscription';
import { useFilteredUsers } from '~/composables/useFilteredUsers';

definePageMeta({ middleware: ['auth'], layout: 'apps' });

const route = useRoute();
const { selectedOrg, organizationOptions } = useOrganization();
const { selectedClient, clientList } = useClients();
const { canAccess, isOrgAdminOrAbove } = useOrgRole();
const { setEntity, clearEntity, sidebarOpen } = useEntityPageContext();
const { user } = useUserSession();
const toast = useToast();

const isAdmin = computed(() => canAccess('channels'));
const activeName = computed(() => (route.params.channel ? String(route.params.channel) : null));

// Channel names are slugs, but seeded data can carry a stray leading '#'.
// Strip it for display (we render our own '#') and encode for the URL so
// special characters never leak into the path as a fragment.
const cleanName = (name) => (name ? String(name).replace(/^#+/, '') : '');
const channelHref = (name) => `/apps/channels/${encodeURIComponent(name)}`;
const displayName = computed(() => cleanName(activeName.value));

useHead({ title: computed(() => (activeName.value ? `#${displayName.value} | Channels` : 'Channels | Earnest')) });

/* ---------------------------------------------------------------- Left pane */
const listFilter = computed(() => {
	// Include archived so the roster can show a collapsed "Archived" section;
	// archived channels are split out client-side (never grouped with active).
	const filters = [{ status: { _in: ['published', 'draft', 'archived'] } }];
	if (selectedOrg.value) {
		filters.push({ organization: { _eq: selectedOrg.value } });
	} else if (organizationOptions.value?.length) {
		filters.push({ organization: { _in: organizationOptions.value.filter((o) => o.id).map((o) => o.id) } });
	}
	// The comms hub intentionally IGNORES the header client selector — all
	// channels stay visible and are organized by the client→category grouping
	// below (org-wide channels never disappear when you focus a client).
	return { _and: filters };
});

const {
	data: channels,
	isLoading: channelsLoading,
	updateFilter: updateChannelsFilter,
} = useRealtimeSubscription(
	'channels',
	['id', 'name', 'status', 'category', 'audience', 'user_created.id', 'date_created', 'organization.id', 'project.id', 'project.title', 'project.client.id', 'project.client.name', 'ticket.id', 'ticket.title', 'client.id', 'client.name', 'messages.id', 'messages.status', 'messages.date_created'],
	listFilter.value,
	'name',
);
watch(listFilter, (f) => updateChannelsFilter(f));

const channelQuery = ref('');
const showArchived = ref(false);

const clientNameById = (id) => (clientList.value || []).find((c) => c.id === id)?.name || null;

// Recency = newest published message; fall back to the channel's own creation
// date so brand-new empty channels still sort sensibly.
const lastActivity = (ch) => {
	const dates = (ch.messages || []).filter((m) => m.status === 'published' && m.date_created).map((m) => +new Date(m.date_created));
	if (dates.length) return Math.max(...dates);
	return ch.date_created ? +new Date(ch.date_created) : 0;
};
const publishedCount = (ch) => (ch.messages || []).filter((m) => m.status === 'published').length;

// A channel's owning client: its own `client`, else the client of its project.
// Handles both expanded objects ({id,name}) and bare id strings.
const effectiveClient = (ch) => {
	const c = ch.client;
	if (c) return typeof c === 'object' ? { id: c.id, name: c.name } : { id: c, name: null };
	const pc = ch.project?.client;
	if (pc) return typeof pc === 'object' ? { id: pc.id, name: pc.name } : { id: pc, name: null };
	return null;
};
// Sub-group within a client: an explicit `category` wins (lets you move any
// channel — even a project one — into a custom folder); otherwise project
// channels fall back to their project title. null = uncategorized → top of client.
const categoryOf = (ch) => (ch.category?.trim() ? ch.category.trim() : ch.project?.id ? ch.project.title || 'Project' : null);

const visibleChannels = computed(() => {
	const q = channelQuery.value.trim().toLowerCase();
	return (channels.value || []).filter((c) => c.name && (!q || c.name.toLowerCase().includes(q)));
});

// Two-level roster: client sections (or "General" for no-client channels),
// each holding uncategorized channels at the top followed by category
// sub-groups. Everything sorts by recent activity. Each section is flattened
// into a `rows` list (subheader | channel) so the template renders one pass.
const groupedChannels = computed(() => {
	const sections = new Map();
	for (const ch of visibleChannels.value) {
		if (ch.status === 'archived') continue;
		const ec = effectiveClient(ch);
		const key = ec ? `client:${ec.id}` : 'general';
		const label = ec ? ec.name || clientNameById(ec.id) || 'Client' : 'General';
		if (!sections.has(key)) sections.set(key, { key, label, recency: 0, top: [], cats: new Map() });
		const sec = sections.get(key);
		const act = lastActivity(ch);
		const item = { ...ch, messageCount: publishedCount(ch), _act: act };
		const cat = categoryOf(ch);
		if (!cat) {
			sec.top.push(item);
		} else {
			if (!sec.cats.has(cat)) sec.cats.set(cat, { name: cat, recency: 0, channels: [] });
			const c = sec.cats.get(cat);
			c.channels.push(item);
			c.recency = Math.max(c.recency, act);
		}
		sec.recency = Math.max(sec.recency, act);
	}
	const arr = [...sections.values()];
	for (const sec of arr) {
		sec.top.sort((a, b) => b._act - a._act);
		const cats = [...sec.cats.values()].sort((a, b) => b.recency - a.recency || a.name.localeCompare(b.name));
		for (const c of cats) c.channels.sort((a, b) => b._act - a._act);
		sec.rows = [
			...sec.top.map((ch) => ({ type: 'channel', ch, indent: false })),
			...cats.flatMap((c) => [{ type: 'subheader', name: c.name }, ...c.channels.map((ch) => ({ type: 'channel', ch, indent: true }))]),
		];
	}
	arr.sort((a, b) => b.recency - a.recency || a.label.localeCompare(b.label));
	return arr;
});

const archivedChannels = computed(() =>
	visibleChannels.value
		.filter((c) => c.status === 'archived')
		.map((c) => ({ ...c, messageCount: publishedCount(c) }))
		.sort((a, b) => a.name.localeCompare(b.name)),
);

const hasAnyChannels = computed(() => groupedChannels.value.length > 0 || archivedChannels.value.length > 0);

/* ------------------------------------------------ Active channel + messages */
// Derive the active channel from the already-loaded roster (which now holds
// every org channel — active + archived) instead of a second 'channels'
// subscription. Two subscriptions to the same collection collided in the WS
// manager and blanked the roster when navigating into a channel.
const activeChannel = computed(() => (channels.value || []).find((c) => c.name === activeName.value) || null);
const activeChannelId = computed(() => activeChannel.value?.id || null);

const messageFields = [
	'id',
	'status',
	'text',
	'date_created',
	'user_created.id',
	'user_created.first_name',
	'user_created.last_name',
	'user_created.avatar',
	'channel.id',
	'channel.name',
	'parent_id',
];
const messageFilter = computed(() =>
	activeName.value ? { channel: { name: { _eq: activeName.value } }, status: { _eq: 'published' } } : { id: { _null: true } },
);
const {
	data: messages,
	isLoading: messagesLoading,
	isConnected,
	error: messagesError,
	refresh: refreshMessages,
	updateFilter: updateMessagesFilter,
} = useRealtimeSubscription('messages', messageFields, messageFilter.value, '-date_created');
watch(messageFilter, (f) => updateMessagesFilter(f));

const topLevelMessages = computed(() => {
	if (!messages.value) return [];
	const ids = new Set(messages.value.map((m) => m.id));
	return messages.value.filter((m) => !m.parent_id || !ids.has(m.parent_id));
});

// Render oldest → newest (subscription is -date_created) so the pane reads
// naturally and the "new messages" divider anchors correctly.
const orderedMessages = computed(() =>
	[...topLevelMessages.value].sort((a, b) => new Date(a.date_created) - new Date(b.date_created)),
);

/* --------------------------------------------- Enter/leave reconciler (1a/1b) */
// The pane renders from `visibleMessages`, reconciled against the live source so
// we can play compositor-driven enter/leave transitions (feedback_motion_stack_policy:
// reactive class + CSS transition, NOT Vue <Transition>; setTimeout not rAF).
// `moderatedIds` evicts a hidden/removed message the instant it's moderated —
// the filtered WS subscription doesn't reliably drop an item leaving the filter.
const moderatedIds = ref(new Set());
const sourceMessages = computed(() =>
	orderedMessages.value.filter((m) => m.status === 'published' && !moderatedIds.value.has(m.id)),
);
const newestMessageId = computed(() => sourceMessages.value[sourceMessages.value.length - 1]?.id || null);

const visibleMessages = ref([]);
const enteringIds = ref(new Set()); // brief from-pose right after a delta arrives
const leavingIds = ref(new Set()); // rows mid fade + collapse-out
const _snapshots = new Map(); // id → message, retains a leaving row's data
let _settled = false; // gates enter anim — off during initial load / channel switch
const _leaveTimers = new Map();
const ENTER_MS = 180;
const LEAVE_MS = 200;

const byDate = (list) => [...list].sort((a, b) => new Date(a.date_created) - new Date(b.date_created));

// Snap the pane to the current source with NO animation (initial load + switch).
function resetVisible() {
	for (const t of _leaveTimers.values()) clearTimeout(t);
	_leaveTimers.clear();
	enteringIds.value = new Set();
	leavingIds.value = new Set();
	_snapshots.clear();
	for (const m of sourceMessages.value) _snapshots.set(m.id, m);
	visibleMessages.value = byDate(sourceMessages.value);
}

function reconcile() {
	const src = sourceMessages.value;
	const bySrc = new Map(src.map((m) => [m.id, m]));
	const visIds = new Set(visibleMessages.value.map((m) => m.id));

	// Additions — new ids not yet visible get a one-tick from-pose, then flip.
	for (const m of src) {
		_snapshots.set(m.id, m);
		if (!visIds.has(m.id) && !leavingIds.value.has(m.id)) {
			if (_settled) {
				const s = new Set(enteringIds.value);
				s.add(m.id);
				enteringIds.value = s;
				// Macrotask (not rAF — throttled in headless) so the from-pose paints.
				setTimeout(() => {
					const s2 = new Set(enteringIds.value);
					s2.delete(m.id);
					enteringIds.value = s2;
				}, 16);
			}
		}
	}

	// Removals — visible ids gone from source play the leave, then drop.
	for (const m of visibleMessages.value) {
		if (!bySrc.has(m.id) && !leavingIds.value.has(m.id)) {
			const l = new Set(leavingIds.value);
			l.add(m.id);
			leavingIds.value = l;
			_leaveTimers.set(
				m.id,
				setTimeout(() => {
					const l2 = new Set(leavingIds.value);
					l2.delete(m.id);
					leavingIds.value = l2;
					_leaveTimers.delete(m.id);
					_snapshots.delete(m.id);
					visibleMessages.value = visibleMessages.value.filter((x) => x.id !== m.id);
				}, LEAVE_MS + 20),
			);
		}
	}

	// Rebuild: source items (fresh objects reflect content edits) plus rows still
	// animating their leave, ordered by time.
	const merged = [];
	for (const m of visibleMessages.value) {
		if (bySrc.has(m.id)) merged.push(bySrc.get(m.id));
		else if (leavingIds.value.has(m.id)) merged.push(_snapshots.get(m.id) || m);
	}
	for (const m of src) if (!merged.some((x) => x.id === m.id)) merged.push(m);
	visibleMessages.value = byDate(merged);
}

watch(sourceMessages, () => {
	if (_settled) reconcile();
	else resetVisible();
});
// Arm enter animations only after a channel's backlog has painted, so switching
// channels / first load never stagger-animates the history.
watch(
	messagesLoading,
	(loading) => {
		if (!loading) {
			resetVisible();
			setTimeout(() => { _settled = true; }, 60);
		}
	},
	{ immediate: true },
);

// Locally evict a moderated message (own delete or moderator hide/remove) so its
// leave plays immediately regardless of what the realtime subscription does.
function onModerated(id) {
	if (!id) return;
	const s = new Set(moderatedIds.value);
	s.add(id);
	moderatedIds.value = s;
}

/* ------------------------------------------------------- Unread / read-state */
const unread = useChannelUnread();
const unreadCountFor = (id) => unread.countFor(id);
// Cap the badge so a never-opened channel's backlog doesn't render a huge number.
const unreadLabel = (id) => {
	const n = unreadCountFor(id);
	return n > 99 ? '99+' : String(n);
};
// Divider anchor: the read cursor captured when the channel opened (before we
// mark it read), so the "New" line stays put while you read.
const dividerAt = ref(null);
const firstUnreadId = computed(() => {
	if (!dividerAt.value) return null;
	const cut = +new Date(dividerAt.value);
	return sourceMessages.value.find((m) => +new Date(m.date_created) > cut)?.id || null;
});

async function openActiveChannel(id) {
	if (!id) {
		dividerAt.value = null;
		return;
	}
	await unread.refresh(); // capture the true pre-read cursor
	dividerAt.value = unread.lastReadAtFor(id);
	unread.markRead(id, newestMessageId.value);
}
watch(activeChannelId, (id) => openActiveChannel(id));
// Keep the open channel read as new messages arrive; refresh badges whenever
// activity changes anywhere (the roster subscription reloads per-channel msgs).
watch(newestMessageId, (id) => {
	if (id && activeChannelId.value) unread.markRead(activeChannelId.value, id);
});
let unreadDebounce = null;
watch(channels, () => {
	clearTimeout(unreadDebounce);
	unreadDebounce = setTimeout(() => unread.refresh(), 500);
});
onMounted(() => {
	unread.refresh();
	if (activeChannelId.value) openActiveChannel(activeChannelId.value);
});

// Keep the Ask-Earnest sidebar anchored to the open channel.
watch(
	[activeChannelId, activeName],
	([id, name]) => {
		if (id && name) setEntity('channel', String(id), `#${name}`);
	},
	{ immediate: true },
);
onUnmounted(() => clearEntity());

/* ---------------------------------------------------------------- Search (D) */
// The roster search box does double duty: it filters channels by name (client-
// side, via channelQuery above) AND searches message *content* across the
// caller's org channels through /api/messages/search.
const messageResults = ref([]);
const searching = ref(false);
const stripHtml = (html) => (html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
let searchDebounce = null;
watch(channelQuery, (q) => {
	clearTimeout(searchDebounce);
	const term = (q || '').trim();
	if (term.length < 2) {
		messageResults.value = [];
		searching.value = false;
		return;
	}
	searching.value = true;
	searchDebounce = setTimeout(async () => {
		try {
			const res = await $fetch('/api/messages/search', { params: { q: term, limit: 20 } });
			messageResults.value = res?.items || [];
		} catch {
			messageResults.value = [];
		} finally {
			searching.value = false;
		}
	}, 300);
});
const isSearching = computed(() => channelQuery.value.trim().length >= 2);

const goToResult = (r) => {
	const name = r?.channel?.name;
	if (!name) return;
	navigateTo(`${channelHref(name)}?m=${r.id}`);
};

// Jump-to-message: a ?m=<id> query scrolls to + briefly highlights that message
// once it's actually rendered (messages load async on a fresh channel open, so
// we wait for the target to appear rather than firing on a fixed timer).
const highlightId = ref(null);
let highlightClearTimer = null;
watch(
	() => route.query.m,
	(m) => {
		highlightId.value = m ? String(m) : null;
	},
	{ immediate: true },
);
watch(
	[highlightId, visibleMessages],
	() => {
		const id = highlightId.value;
		if (!id || !visibleMessages.value.some((msg) => msg.id === id)) return;
		nextTick(() => document.getElementById(`msg-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
		clearTimeout(highlightClearTimer);
		highlightClearTimer = setTimeout(() => {
			if (highlightId.value === id) highlightId.value = null;
		}, 2800);
	},
	{ immediate: true },
);

/* ------------------------------------------------------------------ Compose */
const newMessage = ref('');
const sending = ref(false);
const messagesContainer = ref(null);

const sendMessage = async () => {
	const text = newMessage.value?.trim();
	if (!text || !activeChannelId.value || sending.value) return;
	sending.value = true;
	try {
		await $fetch('/api/messages', {
			method: 'POST',
			body: { text: newMessage.value, channel: activeChannelId.value, status: 'published' },
		});
		newMessage.value = '';
	} catch (error) {
		console.error('Error sending message:', error);
		toast.add({ title: 'Failed to send message', color: 'red' });
	} finally {
		sending.value = false;
	}
};

const scrollToBottom = () => {
	nextTick(() => {
		if (messagesContainer.value) messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
	});
};
watch(sourceMessages, (next, prev) => {
	if ((next?.length || 0) > (prev?.length || 0)) scrollToBottom();
});
// Channel switch: disarm enter animation + clear local moderation evictions so
// the new channel's backlog paints instantly (re-armed once it finishes loading).
watch(activeName, () => {
	_settled = false;
	moderatedIds.value = new Set();
	scrollToBottom();
});

/* ---------------------------------------------------- Org members (pickers) */
// Shared by the create dialog's people picker and the manage-members panel.
const { filteredUsers: orgMembers, fetchFilteredUsers } = useFilteredUsers();
const { teams, fetchTeams } = useTeams();
watch(
	selectedOrg,
	(org) => { if (org) { fetchFilteredUsers(org); fetchTeams(org); } },
	{ immediate: true },
);
const memberLabel = (u) => u?.label || `${u?.first_name || ''} ${u?.last_name || ''}`.trim() || u?.email || 'Unknown';

// Team / Client audience shortcuts — resolve to concrete user ids server-side
// (respects org scope + perms) so the pickers can reflect exactly who's added.
const teamOptions = computed(() => (teams.value || []).filter((t) => t.id && t.id !== 'org-default'));
const clientOptions = computed(() => (clientList.value || []).filter((c) => c.id && c.id !== 'org'));
const resolveShortcut = async (kind, id) => {
	if (!id || !selectedOrg.value) return [];
	try {
		const params = { organization: selectedOrg.value };
		params[kind] = id;
		const res = await $fetch('/api/channels/resolve-members', { params });
		return (res?.users || []).map((u) => u.id);
	} catch (err) {
		toast.add({ title: 'Failed to resolve members', color: 'red' });
		return [];
	}
};

/* ------------------------------------------------------------ Create channel */
const showCreate = ref(false);
const newChannelName = ref('');
const newChannelCategory = ref('');
const newChannelAudience = ref('organization'); // 'organization' | 'restricted'
const newChannelMembers = ref([]); // user ids to seed (restricted only)
const memberSearch = ref('');
const creating = ref(false);
const channelItems = useDirectusItems('channels');

const memberPickerOptions = computed(() => {
	const q = memberSearch.value.trim().toLowerCase();
	const meId = user.value?.id;
	return (orgMembers.value || [])
		.filter((u) => u.id !== meId) // creator is auto-added as moderator
		.filter((u) => !q || memberLabel(u).toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q));
});
const toggleNewMember = (id) => {
	const i = newChannelMembers.value.indexOf(id);
	if (i === -1) newChannelMembers.value.push(id);
	else newChannelMembers.value.splice(i, 1);
};
// Team/Client shortcut in the create dialog: resolve → check those people in
// the picker (creator is excluded; already-checked stay checked).
const applyingShortcut = ref(false);
const applyCreateShortcut = async (kind, id) => {
	if (!id) return;
	applyingShortcut.value = true;
	const ids = await resolveShortcut(kind, id);
	for (const uid of ids) {
		if (uid !== user.value?.id && !newChannelMembers.value.includes(uid)) newChannelMembers.value.push(uid);
	}
	applyingShortcut.value = false;
};

// Existing free-text categories in view, offered as create-time suggestions so
// folders get reused instead of re-typed. (Project-derived folders aren't
// listed here — those come from linking a channel to a project.)
const existingCategories = computed(() =>
	[...new Set((channels.value || []).map((c) => c.category).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
);

// Move a channel into / out of a folder (edits channels.category).
const moveTarget = ref(null);
const moveCategory = ref('');
const savingFolder = ref(false);
const openMoveFolder = (ch) => {
	moveTarget.value = ch;
	moveCategory.value = ch.category || '';
};
const saveFolder = async () => {
	if (!moveTarget.value) return;
	savingFolder.value = true;
	try {
		await channelItems.update(moveTarget.value.id, { category: moveCategory.value.trim() || null });
		toast.add({ title: 'Folder updated', color: 'green' });
		moveTarget.value = null;
	} catch (err) {
		console.error('Error updating folder:', err);
		toast.add({ title: 'Failed to update folder', color: 'red' });
	} finally {
		savingFolder.value = false;
	}
};

const archiveChannel = async (ch) => {
	try {
		await channelItems.update(ch.id, { status: 'archived' });
		toast.add({ title: `Archived #${cleanName(ch.name)}`, color: 'green' });
		if (ch.name === activeName.value) navigateTo('/apps/channels');
	} catch (err) {
		console.error('Error archiving channel:', err);
		toast.add({ title: 'Failed to archive channel', color: 'red' });
	}
};

const restoreChannel = async (ch) => {
	try {
		await channelItems.update(ch.id, { status: 'published' });
		toast.add({ title: `Restored #${cleanName(ch.name)}`, color: 'green' });
	} catch (err) {
		console.error('Error restoring channel:', err);
		toast.add({ title: 'Failed to restore channel', color: 'red' });
	}
};

// Channel names are slugs: lowercase, hyphenated, alphanumeric only.
const toSlug = (s) =>
	String(s || '')
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');

const createChannel = async () => {
	if (!newChannelName.value || newChannelName.value.length < 3) return;
	creating.value = true;
	try {
		// Route through the server so a restricted channel's ACL (channel_members
		// rows: creator = moderator, invitees = member) is seeded atomically.
		const body = {
			name: toSlug(newChannelName.value),
			organization: selectedOrg.value || undefined,
			audience: newChannelAudience.value,
		};
		if (selectedClient.value && selectedClient.value !== 'org') body.client = selectedClient.value;
		if (newChannelCategory.value?.trim()) body.category = newChannelCategory.value.trim();
		if (newChannelAudience.value === 'restricted') body.members = newChannelMembers.value;
		const created = await $fetch('/api/channels', { method: 'POST', body });
		toast.add({ title: 'Channel created', color: 'green' });
		showCreate.value = false;
		newChannelName.value = '';
		newChannelCategory.value = '';
		newChannelAudience.value = 'organization';
		newChannelMembers.value = [];
		memberSearch.value = '';
		if (created?.name) navigateTo(channelHref(created.name));
	} catch (err) {
		console.error('Error creating channel:', err);
		toast.add({ title: err?.data?.message || 'Failed to create channel', color: 'red' });
	} finally {
		creating.value = false;
	}
};

/* ------------------------------------------------- Audience / manage members */
const isRestricted = (ch) => ch?.audience === 'restricted';
const activeIsRestricted = computed(() => isRestricted(activeChannel.value));

// The caller's explicit role in the active channel (null unless they hold an
// ACL row) + the channel owner id — both sourced from the members endpoint
// (authoritative; the realtime roster's user_created can lag on a fresh open).
const activeMembers = ref([]);
const activeOwnerId = ref(null);
const myChannelRole = ref(null);
const membersLoading = ref(false);

async function loadMembers(channelId) {
	if (!channelId) { activeMembers.value = []; activeOwnerId.value = null; myChannelRole.value = null; return; }
	membersLoading.value = true;
	try {
		const res = await $fetch(`/api/channels/${channelId}/members`);
		activeMembers.value = res?.members || [];
		activeOwnerId.value = res?.owner || null;
		const meId = user.value?.id;
		myChannelRole.value = activeMembers.value.find((m) => (m.user?.id || m.user) === meId)?.role || null;
	} catch {
		activeMembers.value = [];
		activeOwnerId.value = null;
		myChannelRole.value = null;
	} finally {
		membersLoading.value = false;
	}
}
watch(activeChannelId, (id) => loadMembers(id), { immediate: true });

// Manage rights: org owner/admin, the channel creator, or a channel moderator.
// Mirrors the server-side requireChannelManager guard.
const canManageActive = computed(() =>
	!!activeChannelId.value &&
	(isOrgAdminOrAbove.value || activeOwnerId.value === user.value?.id || myChannelRole.value === 'moderator'),
);

const showManage = ref(false);
const manageSearch = ref('');
const savingMember = ref(false);
const manageMemberIds = computed(() => new Set(activeMembers.value.map((m) => m.user?.id || m.user)));
const manageAddOptions = computed(() => {
	const q = manageSearch.value.trim().toLowerCase();
	const have = manageMemberIds.value;
	return (orgMembers.value || [])
		.filter((u) => !have.has(u.id))
		.filter((u) => !q || memberLabel(u).toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q));
});

async function addMember(userId, role = 'member') {
	if (!activeChannelId.value) return;
	savingMember.value = true;
	try {
		await $fetch(`/api/channels/${activeChannelId.value}/members`, { method: 'POST', body: { users: [userId], role } });
		await loadMembers(activeChannelId.value);
		manageSearch.value = '';
	} catch (err) {
		toast.add({ title: err?.data?.message || 'Failed to add member', color: 'red' });
	} finally {
		savingMember.value = false;
	}
}
async function removeMember(userId) {
	if (!activeChannelId.value) return;
	savingMember.value = true;
	try {
		await $fetch(`/api/channels/${activeChannelId.value}/members`, { method: 'DELETE', body: { user: userId } });
		await loadMembers(activeChannelId.value);
	} catch (err) {
		toast.add({ title: err?.data?.message || 'Failed to remove member', color: 'red' });
	} finally {
		savingMember.value = false;
	}
}
// Bulk-add a whole team / client's people to the active channel.
async function addShortcutMembers(kind, id) {
	if (!id || !activeChannelId.value) return;
	savingMember.value = true;
	try {
		await $fetch(`/api/channels/${activeChannelId.value}/members`, { method: 'POST', body: { [kind]: id } });
		await loadMembers(activeChannelId.value);
	} catch (err) {
		toast.add({ title: err?.data?.message || 'Failed to add members', color: 'red' });
	} finally {
		savingMember.value = false;
	}
}

// Change a channel's audience (organization ↔ restricted) after creation.
const changingAudience = ref(false);
async function changeAudience(next) {
	if (!activeChannelId.value || changingAudience.value) return;
	if (next === (activeChannel.value?.audience || 'organization')) return;
	changingAudience.value = true;
	try {
		await $fetch(`/api/channels/${activeChannelId.value}/audience`, { method: 'POST', body: { audience: next } });
		toast.add({ title: next === 'restricted' ? 'Channel is now restricted' : 'Channel is now open to the org', color: 'green' });
		await loadMembers(activeChannelId.value);
	} catch (err) {
		toast.add({ title: err?.data?.message || 'Failed to change audience', color: 'red' });
	} finally {
		changingAudience.value = false;
	}
}

/* --------------------------------------------------- Moderation log (viewer) */
const modLog = ref([]);
const modLogLoading = ref(false);
const showModLog = ref(false);
async function loadModerationLog() {
	if (!activeChannelId.value) return;
	modLogLoading.value = true;
	try {
		const res = await $fetch(`/api/channels/${activeChannelId.value}/moderation-log`);
		modLog.value = res?.events || [];
	} catch {
		modLog.value = [];
	} finally {
		modLogLoading.value = false;
	}
}
watch(showModLog, (open) => { if (open) loadModerationLog(); });
// Reset the log view whenever the manage modal closes.
watch(showManage, (open) => { if (!open) showModLog.value = false; });
const modActorName = (u) => (u ? `${u.first_name || ''} ${u.last_name || ''}`.trim() || 'Someone' : 'Someone');
const modActionLabel = { hide: 'hid a message', remove: 'removed a message', report: 'reported a message' };
const fmtModDate = (d) => {
	if (!d) return '';
	try { return new Date(d).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); } catch { return ''; }
};
</script>

<template>
	<div class="channels-hub flex h-full min-h-0">
		<!-- ------------------------------------------------------ Left: roster -->
		<aside
			class="flex-col w-full md:w-[280px] md:shrink-0 md:border-r border-border/50 min-h-0"
			:class="activeName ? 'hidden md:flex' : 'flex'"
		>
			<div class="px-4 pt-4 pb-2 shrink-0">
				<div class="flex items-center justify-between mb-3">
					<h1 class="text-lg font-semibold text-foreground">Channels</h1>
					<Button v-if="isAdmin" size="sm" class="h-8 gap-1.5" @click="showCreate = true">
						<Icon name="lucide:plus" class="w-3.5 h-3.5" />
						New
					</Button>
				</div>
				<div class="relative">
					<Icon name="lucide:search" class="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50" />
					<input
						v-model="channelQuery"
						type="text"
						placeholder="Search channels & messages"
						class="w-full h-9 pl-9 pr-3 rounded-full glass-field text-sm placeholder:text-muted-foreground/50 focus:outline-none transition-all"
					>
				</div>
			</div>

			<div class="flex-1 overflow-y-auto px-2 pb-4 messages-scroll min-h-0">
				<div v-if="channelsLoading" class="space-y-1 px-2 pt-1">
					<div v-for="n in 6" :key="n" class="h-9 rounded-lg animate-pulse bg-muted/20" />
				</div>
				<template v-else-if="hasAnyChannels">
					<!-- Active: client sections (or General), each with uncategorized
					     channels then category sub-groups. Flattened rows render in one pass. -->
					<div v-for="section in groupedChannels" :key="section.key" class="mb-3">
						<p class="px-3 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 truncate">{{ section.label }}</p>
						<template v-for="(row, i) in section.rows" :key="row.type === 'channel' ? row.ch.id : `sub-${section.key}-${row.name}-${i}`">
							<p
								v-if="row.type === 'subheader'"
								class="pl-6 pr-3 pt-1.5 pb-0.5 text-[10px] uppercase tracking-wider text-muted-foreground/50 truncate"
							>{{ row.name }}</p>
							<div v-else class="group/row relative">
								<NuxtLink
									:to="channelHref(row.ch.name)"
									class="flex items-center gap-2 pr-14 py-2 rounded-lg transition-colors"
									:class="[
										row.indent ? 'pl-6' : 'pl-3',
										row.ch.name === activeName ? 'bg-primary/10 text-primary' : 'hover:bg-muted/30 text-foreground',
									]"
								>
									<Icon
										v-if="isRestricted(row.ch)"
										name="lucide:lock"
										class="w-3 h-3 shrink-0 text-muted-foreground/50"
										title="Restricted — invited members only"
									/>
									<span v-else class="text-muted-foreground/40 text-sm shrink-0">#</span>
									<span
										class="flex-1 min-w-0 text-sm truncate"
										:class="unreadCountFor(row.ch.id) && row.ch.name !== activeName ? 'font-semibold text-foreground' : 'font-medium'"
									>{{ cleanName(row.ch.name) }}</span>
									<span
										v-if="unreadCountFor(row.ch.id) && row.ch.name !== activeName"
										class="text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0 bg-primary text-primary-foreground group-hover/row:opacity-0 transition-opacity"
									>{{ unreadLabel(row.ch.id) }}</span>
								</NuxtLink>
								<div
									v-if="isAdmin"
									class="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5 opacity-0 group-hover/row:opacity-100 transition-all"
								>
									<button
										class="w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground/60 hover:bg-muted/60 hover:text-foreground transition-colors"
										title="Move to folder"
										@click.prevent.stop="openMoveFolder(row.ch)"
									>
										<Icon name="lucide:folder-input" class="w-3.5 h-3.5" />
									</button>
									<button
										class="w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground/60 hover:bg-muted/60 hover:text-foreground transition-colors"
										title="Archive channel"
										@click.prevent.stop="archiveChannel(row.ch)"
									>
										<Icon name="lucide:archive" class="w-3.5 h-3.5" />
									</button>
								</div>
							</div>
						</template>
					</div>

					<!-- Archived (collapsed) -->
					<div v-if="archivedChannels.length" class="mt-1">
						<button
							class="w-full flex items-center gap-1.5 px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground/60 hover:text-muted-foreground transition-colors"
							@click="showArchived = !showArchived"
						>
							<Icon :name="showArchived ? 'lucide:chevron-down' : 'lucide:chevron-right'" class="w-3 h-3 shrink-0" />
							Archived ({{ archivedChannels.length }})
						</button>
						<template v-if="showArchived">
							<div v-for="channel in archivedChannels" :key="channel.id" class="group/row relative">
								<NuxtLink
									:to="channelHref(channel.name)"
									class="flex items-center gap-2 pl-3 pr-8 py-2 rounded-lg transition-colors opacity-60 hover:opacity-100"
									:class="channel.name === activeName ? 'bg-primary/10 text-primary' : 'hover:bg-muted/30 text-foreground'"
								>
									<span class="text-muted-foreground/40 text-sm shrink-0">#</span>
									<span class="flex-1 min-w-0 text-sm font-medium truncate">{{ cleanName(channel.name) }}</span>
								</NuxtLink>
								<button
									v-if="isAdmin"
									class="absolute right-1.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground/60 opacity-0 group-hover/row:opacity-100 hover:bg-muted/60 hover:text-foreground transition-all"
									title="Restore channel"
									@click.prevent.stop="restoreChannel(channel)"
								>
									<Icon name="lucide:archive-restore" class="w-3.5 h-3.5" />
								</button>
							</div>
						</template>
					</div>
				</template>
				<div v-else-if="!isSearching" class="flex flex-col items-center justify-center text-center py-12 px-4">
					<Icon name="lucide:hash" class="w-8 h-8 text-muted-foreground/30 mb-2" />
					<p class="text-sm text-muted-foreground">No channels yet</p>
					<Button v-if="isAdmin" size="sm" variant="outline" class="mt-3 gap-1.5" @click="showCreate = true">
						<Icon name="lucide:plus" class="w-3.5 h-3.5" />
						New Channel
					</Button>
				</div>

				<!-- Message content search results (D) -->
				<div v-if="!channelsLoading && isSearching" class="mt-2">
					<p class="px-3 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">Messages</p>
					<div v-if="searching && !messageResults.length" class="px-3 py-2 text-xs text-muted-foreground/60">Searching…</div>
					<p v-else-if="!messageResults.length" class="px-3 py-2 text-xs text-muted-foreground/60">No messages found.</p>
					<button
						v-for="r in messageResults"
						:key="r.id"
						class="w-full text-left px-3 py-2 rounded-lg hover:bg-muted/30 transition-colors"
						@click="goToResult(r)"
					>
						<div class="flex items-center gap-1.5 text-[11px] text-muted-foreground">
							<Icon name="lucide:hash" class="w-3 h-3 shrink-0" />
							<span class="font-medium truncate">{{ cleanName(r.channel?.name) }}</span>
							<span v-if="r.user_created?.first_name" class="text-muted-foreground/40">·</span>
							<span class="shrink-0 truncate">{{ r.user_created?.first_name }}</span>
						</div>
						<p class="text-xs text-foreground/80 line-clamp-2 mt-0.5">{{ stripHtml(r.text) }}</p>
					</button>
				</div>
			</div>
		</aside>

		<!-- ------------------------------------------------ Right: conversation -->
		<section
			class="flex-1 flex-col min-w-0 min-h-0"
			:class="activeName ? 'flex' : 'hidden md:flex'"
		>
			<template v-if="activeName">
				<!-- Header -->
				<div class="flex items-center justify-between px-5 py-3 border-b border-border/50 shrink-0">
					<div class="flex items-center gap-3 min-w-0">
						<NuxtLink to="/apps/channels" class="md:hidden text-muted-foreground hover:text-foreground transition-colors">
							<Icon name="lucide:chevron-left" class="w-5 h-5" />
						</NuxtLink>
						<div class="flex items-center gap-2 min-w-0">
							<Icon v-if="activeIsRestricted" name="lucide:lock" class="w-3.5 h-3.5 shrink-0 text-muted-foreground" title="Restricted channel" />
							<h2 class="text-base font-semibold truncate">#{{ displayName }}</h2>
							<span
								class="w-2 h-2 rounded-full shrink-0"
								:class="isConnected ? 'bg-success' : 'bg-destructive'"
								:title="isConnected ? 'Connected' : 'Disconnected'"
							/>
						</div>
					</div>
					<TooltipProvider :delay-duration="120">
						<div class="flex items-center gap-1.5 shrink-0">
							<!-- Icon circles matching LayoutShareButton (w-8 h-8 rounded-full) so
							     the header's action cluster reads as one uniform trio. Tooltips
							     use the same reka <Tooltip> as the app dock/rail. -->
							<Tooltip v-if="canManageActive">
								<TooltipTrigger as-child>
									<button
										class="flex items-center justify-center w-8 h-8 rounded-full hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
										@click="showManage = true"
									>
										<Icon :name="activeIsRestricted ? 'lucide:users' : 'lucide:user-plus'" class="w-4 h-4" />
									</button>
								</TooltipTrigger>
								<TooltipContent :side-offset="6" class="z-[70]">
									{{ activeIsRestricted ? `Members (${activeMembers.length})` : 'Channel access' }}
								</TooltipContent>
							</Tooltip>
							<Tooltip>
								<TooltipTrigger as-child>
									<button
										class="flex items-center justify-center w-8 h-8 rounded-full hover:bg-muted/50 text-primary hover:text-primary transition-colors"
										@click="sidebarOpen = true"
									>
										<EarnestIcon class="w-4 h-4" />
									</button>
								</TooltipTrigger>
								<TooltipContent :side-offset="6" class="z-[70]">Ask Earnest</TooltipContent>
							</Tooltip>
							<LayoutShareButton :title="`#${displayName} | Earnest`" />
						</div>
					</TooltipProvider>
				</div>

				<!-- Connection error -->
				<div v-if="messagesError" class="px-5 py-2 bg-destructive/10 border-b border-destructive/20 flex items-center justify-between shrink-0">
					<p class="text-sm text-destructive">Connection error. Messages may not be up to date.</p>
					<button class="text-xs text-destructive font-medium" @click="refreshMessages">Retry</button>
				</div>

				<!-- Messages -->
				<div ref="messagesContainer" class="flex-1 overflow-y-auto px-5 py-4 messages-scroll min-h-0">
					<div v-if="messagesLoading" class="space-y-4">
						<div v-for="n in 5" :key="n" class="flex items-start gap-3">
							<div class="w-8 h-8 rounded-full bg-muted/60 animate-pulse shrink-0" />
							<div class="flex-1 space-y-1.5">
								<div class="h-3 bg-muted/40 rounded w-24 animate-pulse" />
								<div class="h-4 bg-muted/40 rounded w-3/4 animate-pulse" />
							</div>
						</div>
					</div>
					<div v-else-if="visibleMessages.length" class="space-y-3">
						<template v-for="message in visibleMessages" :key="message.id">
							<div v-if="message.id === firstUnreadId" class="flex items-center gap-2 py-1">
								<div class="flex-1 h-px bg-destructive/40" />
								<span class="text-[10px] font-semibold uppercase tracking-wider text-destructive shrink-0">New</span>
								<div class="flex-1 h-px bg-destructive/40" />
							</div>
							<!-- msg-slot: a grid row that collapses on leave; entering adds a
							     one-tick fade + slide from-pose. Compositor-driven (CSS only). -->
							<div
								class="msg-slot"
								:class="{ entering: enteringIds.has(message.id), leaving: leavingIds.has(message.id) }"
							>
								<div class="msg-slot-inner">
									<div
										:id="`msg-${message.id}`"
										class="rounded-lg transition-shadow"
										:class="highlightId === message.id ? 'ring-2 ring-primary/50 bg-primary/5' : ''"
									>
										<ChannelsMessage
											:message="message"
											:can-moderate="canManageActive"
											@moderated="onModerated(message.id)"
										/>
									</div>
								</div>
							</div>
						</template>
					</div>
					<div v-else class="flex flex-col items-center justify-center h-full text-center">
						<div class="w-12 h-12 rounded-2xl bg-muted/40 flex items-center justify-center mb-3">
							<Icon name="lucide:hash" class="w-6 h-6 text-muted-foreground/40" />
						</div>
						<p class="text-sm font-medium text-muted-foreground">This is the start of #{{ displayName }}</p>
						<p class="text-xs text-muted-foreground/60 mt-1">Send a message to get the conversation going.</p>
					</div>
				</div>

				<!-- Composer -->
				<div class="px-5 pb-4 pt-2 shrink-0">
					<div class="channel-input flex items-end gap-2 rounded-2xl border border-border/60 bg-muted/20 px-2 py-1 focus-within:border-primary/50 transition-all">
						<LazyFormTiptap
							v-model="newMessage"
							:show-toolbar="true"
							:disabled="!activeChannelId"
							:organization-id="selectedOrg"
							:enter-to-send="true"
							height="min-h-[36px]"
							custom-classes="px-2 py-1.5"
							:character-limit="0"
							:show-char-count="false"
							:allow-uploads="true"
							:context="{ collection: 'messages', itemId: activeChannelId }"
							class="flex-1 channel-tiptap"
							@submit="sendMessage"
						/>
						<button
							v-if="newMessage?.trim()"
							class="shrink-0 w-7 h-7 rounded-full bg-primary flex items-center justify-center hover:bg-primary/90 transition-colors mb-1 disabled:opacity-50"
							:disabled="sending || !activeChannelId"
							@click="sendMessage"
						>
							<Icon name="lucide:arrow-up" class="w-4 h-4 text-primary-foreground" />
						</button>
					</div>
					<p class="text-[10px] text-muted-foreground/40 mt-1.5 px-1">
						<kbd class="px-1 py-0.5 rounded bg-muted/40 text-[9px] font-mono">Enter</kbd> to send,
						<kbd class="px-1 py-0.5 rounded bg-muted/40 text-[9px] font-mono">Shift + Enter</kbd> for new line.
						Type <kbd class="px-1 py-0.5 rounded bg-muted/40 text-[9px] font-mono">@</kbd> to mention.
					</p>
				</div>
			</template>

			<!-- Desktop: nothing selected -->
			<div v-else class="flex-1 flex flex-col items-center justify-center text-center px-6">
				<div class="w-14 h-14 rounded-2xl bg-muted/40 flex items-center justify-center mb-3">
					<Icon name="lucide:messages-square" class="w-7 h-7 text-muted-foreground/40" />
				</div>
				<p class="text-sm font-medium text-muted-foreground">Select a channel</p>
				<p class="text-xs text-muted-foreground/60 mt-1">Pick a conversation from the list to start chatting.</p>
			</div>
		</section>

		<!-- Create channel -->
		<ClientOnly>
			<UModal v-model="showCreate">
				<div class="p-6 space-y-4">
					<h3 class="text-lg font-semibold text-foreground">Create channel</h3>
					<div class="space-y-1.5">
						<label class="text-[10px] uppercase tracking-wider text-muted-foreground">Channel name</label>
						<input
							v-model="newChannelName"
							type="text"
							placeholder="e.g. general, design, launch"
							class="w-full h-10 px-4 rounded-full glass-field text-sm focus:outline-none transition-all"
							@keydown.enter="createChannel"
						>
						<p v-if="newChannelName && newChannelName.length < 3" class="text-xs text-destructive">Must be at least 3 characters.</p>
					</div>
					<div class="space-y-1.5">
						<label class="text-[10px] uppercase tracking-wider text-muted-foreground">Folder <span class="text-muted-foreground/50 normal-case tracking-normal">(optional)</span></label>
						<input
							v-model="newChannelCategory"
							type="text"
							list="channel-categories"
							placeholder="e.g. Announcements, Ops — type a new one or pick existing"
							class="w-full h-10 px-4 rounded-full glass-field text-sm focus:outline-none transition-all"
							@keydown.enter="createChannel"
						>
						<datalist id="channel-categories">
							<option v-for="cat in existingCategories" :key="cat" :value="cat" />
						</datalist>
						<p class="text-[10px] text-muted-foreground/50">Groups the channel into a folder under its client. Leave blank for none.</p>
					</div>

					<!-- Audience -->
					<div class="space-y-1.5">
						<label class="text-[10px] uppercase tracking-wider text-muted-foreground">Who can access</label>
						<div class="grid grid-cols-2 gap-2">
							<button
								type="button"
								class="flex items-start gap-2 p-3 rounded-xl border text-left transition-colors"
								:class="newChannelAudience === 'organization' ? 'border-primary/50 bg-primary/5' : 'border-border/50 hover:bg-muted/30'"
								@click="newChannelAudience = 'organization'"
							>
								<Icon name="lucide:building-2" class="w-4 h-4 shrink-0 mt-0.5 text-muted-foreground" />
								<span class="min-w-0">
									<span class="block text-sm font-medium">Everyone</span>
									<span class="block text-[10px] text-muted-foreground/70 leading-tight">All members of this org</span>
								</span>
							</button>
							<button
								type="button"
								class="flex items-start gap-2 p-3 rounded-xl border text-left transition-colors"
								:class="newChannelAudience === 'restricted' ? 'border-primary/50 bg-primary/5' : 'border-border/50 hover:bg-muted/30'"
								@click="newChannelAudience = 'restricted'"
							>
								<Icon name="lucide:lock" class="w-4 h-4 shrink-0 mt-0.5 text-muted-foreground" />
								<span class="min-w-0">
									<span class="block text-sm font-medium">Specific people</span>
									<span class="block text-[10px] text-muted-foreground/70 leading-tight">Invited members only</span>
								</span>
							</button>
						</div>
					</div>

					<!-- People picker (restricted only) -->
					<div v-if="newChannelAudience === 'restricted'" class="space-y-1.5">
						<label class="text-[10px] uppercase tracking-wider text-muted-foreground">Invite members <span class="text-muted-foreground/50 normal-case tracking-normal">(you're added automatically)</span></label>
						<!-- Team / Client shortcuts: bulk-check members into the picker -->
						<div v-if="teamOptions.length || clientOptions.length" class="flex flex-wrap gap-2">
							<select
								v-if="teamOptions.length"
								class="h-9 px-3 rounded-full glass-field text-xs focus:outline-none"
								:disabled="applyingShortcut"
								@change="(e) => { applyCreateShortcut('team', e.target.value); e.target.selectedIndex = 0; }"
							>
								<option value="">+ Add a team…</option>
								<option v-for="t in teamOptions" :key="t.id" :value="t.id">{{ t.name }}</option>
							</select>
							<select
								v-if="clientOptions.length"
								class="h-9 px-3 rounded-full glass-field text-xs focus:outline-none"
								:disabled="applyingShortcut"
								@change="(e) => { applyCreateShortcut('client', e.target.value); e.target.selectedIndex = 0; }"
							>
								<option value="">+ Add a client…</option>
								<option v-for="c in clientOptions" :key="c.id" :value="c.id">{{ c.name }}</option>
							</select>
						</div>
						<div class="relative">
							<Icon name="lucide:search" class="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50" />
							<input
								v-model="memberSearch"
								type="text"
								placeholder="Search teammates"
								class="w-full h-9 pl-9 pr-3 rounded-full glass-field text-sm focus:outline-none transition-all"
							>
						</div>
						<div class="max-h-44 overflow-y-auto rounded-xl border border-border/50 divide-y divide-border/40 messages-scroll">
							<button
								v-for="u in memberPickerOptions"
								:key="u.id"
								type="button"
								class="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/30 transition-colors"
								@click="toggleNewMember(u.id)"
							>
								<span
									class="w-4 h-4 rounded flex items-center justify-center shrink-0 border"
									:class="newChannelMembers.includes(u.id) ? 'bg-primary border-primary text-primary-foreground' : 'border-border/60'"
								>
									<Icon v-if="newChannelMembers.includes(u.id)" name="lucide:check" class="w-3 h-3" />
								</span>
								<span class="flex-1 min-w-0 text-sm truncate">{{ memberLabel(u) }}</span>
							</button>
							<p v-if="!memberPickerOptions.length" class="px-3 py-3 text-xs text-muted-foreground/60">No teammates found.</p>
						</div>
						<p class="text-[10px] text-muted-foreground/50">{{ newChannelMembers.length }} invited. Org owners &amp; admins always have access.</p>
					</div>

					<div class="flex justify-end">
						<Button :disabled="creating || !newChannelName || newChannelName.length < 3" @click="createChannel">
							{{ creating ? 'Creating…' : 'Create channel' }}
						</Button>
					</div>
				</div>
			</UModal>
		</ClientOnly>

		<!-- Move to folder -->
		<ClientOnly>
			<UModal :model-value="!!moveTarget" @update:model-value="(v) => { if (!v) moveTarget = null; }">
				<div v-if="moveTarget" class="p-6 space-y-4">
					<h3 class="text-lg font-semibold text-foreground">Move #{{ cleanName(moveTarget.name) }}</h3>
					<div class="space-y-1.5">
						<label class="text-[10px] uppercase tracking-wider text-muted-foreground">Folder</label>
						<input
							v-model="moveCategory"
							type="text"
							list="channel-categories"
							placeholder="Type a folder name, or leave blank for none"
							class="w-full h-10 px-4 rounded-full glass-field text-sm focus:outline-none transition-all"
							@keydown.enter="saveFolder"
						>
						<p class="text-[10px] text-muted-foreground/50">
							Groups the channel into a folder under its client.
							<span v-if="moveTarget.project?.id">Overrides its project folder.</span>
						</p>
					</div>
					<div class="flex justify-between items-center gap-2">
						<Button
							variant="ghost"
							size="sm"
							class="text-muted-foreground"
							:disabled="savingFolder || !moveCategory.trim()"
							@click="() => { moveCategory = ''; saveFolder(); }"
						>
							Remove from folder
						</Button>
						<Button :disabled="savingFolder" @click="saveFolder">
							{{ savingFolder ? 'Saving…' : 'Save' }}
						</Button>
					</div>
				</div>
			</UModal>
		</ClientOnly>

		<!-- Manage members (restricted channels) -->
		<ClientOnly>
			<UModal v-model="showManage">
				<div class="p-6 space-y-4">
					<div>
						<h3 class="text-lg font-semibold text-foreground flex items-center gap-2">
							<Icon :name="activeIsRestricted ? 'lucide:lock' : 'lucide:hash'" class="w-4 h-4 text-muted-foreground" />
							Access · #{{ displayName }}
						</h3>
					</div>

					<!-- Audience toggle -->
					<div class="grid grid-cols-2 gap-2">
						<button
							type="button"
							class="flex items-start gap-2 p-3 rounded-xl border text-left transition-colors"
							:class="!activeIsRestricted ? 'border-primary/50 bg-primary/5' : 'border-border/50 hover:bg-muted/30'"
							:disabled="changingAudience"
							@click="changeAudience('organization')"
						>
							<Icon name="lucide:building-2" class="w-4 h-4 shrink-0 mt-0.5 text-muted-foreground" />
							<span class="min-w-0">
								<span class="block text-sm font-medium">Everyone</span>
								<span class="block text-[10px] text-muted-foreground/70 leading-tight">All org members</span>
							</span>
						</button>
						<button
							type="button"
							class="flex items-start gap-2 p-3 rounded-xl border text-left transition-colors"
							:class="activeIsRestricted ? 'border-primary/50 bg-primary/5' : 'border-border/50 hover:bg-muted/30'"
							:disabled="changingAudience"
							@click="changeAudience('restricted')"
						>
							<Icon name="lucide:lock" class="w-4 h-4 shrink-0 mt-0.5 text-muted-foreground" />
							<span class="min-w-0">
								<span class="block text-sm font-medium">Restricted</span>
								<span class="block text-[10px] text-muted-foreground/70 leading-tight">Invited members only</span>
							</span>
						</button>
					</div>
					<p v-if="changingAudience" class="text-[10px] text-muted-foreground/60">Updating access…</p>

					<template v-if="activeIsRestricted">
						<!-- Current members -->
						<div class="space-y-1">
							<label class="text-[10px] uppercase tracking-wider text-muted-foreground">Members ({{ activeMembers.length }})</label>
							<div v-if="membersLoading" class="text-xs text-muted-foreground/60 py-2">Loading…</div>
							<div v-else class="max-h-48 overflow-y-auto rounded-xl border border-border/50 divide-y divide-border/40 messages-scroll">
								<div v-for="m in activeMembers" :key="m.id" class="flex items-center gap-2 px-3 py-2">
									<span class="flex-1 min-w-0 text-sm truncate">
										{{ (m.user?.first_name || '') + ' ' + (m.user?.last_name || '') }}
										<span v-if="!m.user?.first_name" class="text-muted-foreground/60">{{ m.user?.email }}</span>
									</span>
									<span v-if="m.role === 'moderator'" class="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-primary/10 text-primary shrink-0">Moderator</span>
									<button
										v-if="(m.user?.id || m.user) !== activeOwnerId"
										class="w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground/60 hover:bg-destructive/10 hover:text-destructive transition-colors shrink-0"
										:disabled="savingMember"
										title="Remove"
										@click="removeMember(m.user?.id || m.user)"
									>
										<Icon name="lucide:x" class="w-3.5 h-3.5" />
									</button>
									<span v-else class="text-[9px] uppercase tracking-wider text-muted-foreground/50 shrink-0">Owner</span>
								</div>
							</div>
						</div>

						<!-- Add member -->
						<div class="space-y-1.5">
							<label class="text-[10px] uppercase tracking-wider text-muted-foreground">Add people</label>
							<!-- Team / Client shortcuts: bulk-add everyone -->
							<div v-if="teamOptions.length || clientOptions.length" class="flex flex-wrap gap-2">
								<select
									v-if="teamOptions.length"
									class="h-9 px-3 rounded-full glass-field text-xs focus:outline-none"
									:disabled="savingMember"
									@change="(e) => { addShortcutMembers('team', e.target.value); e.target.selectedIndex = 0; }"
								>
									<option value="">+ Add a team…</option>
									<option v-for="t in teamOptions" :key="t.id" :value="t.id">{{ t.name }}</option>
								</select>
								<select
									v-if="clientOptions.length"
									class="h-9 px-3 rounded-full glass-field text-xs focus:outline-none"
									:disabled="savingMember"
									@change="(e) => { addShortcutMembers('client', e.target.value); e.target.selectedIndex = 0; }"
								>
									<option value="">+ Add a client…</option>
									<option v-for="c in clientOptions" :key="c.id" :value="c.id">{{ c.name }}</option>
								</select>
							</div>
							<div class="relative">
								<Icon name="lucide:search" class="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50" />
								<input
									v-model="manageSearch"
									type="text"
									placeholder="Search teammates"
									class="w-full h-9 pl-9 pr-3 rounded-full glass-field text-sm focus:outline-none transition-all"
								>
							</div>
							<div v-if="manageSearch.trim()" class="max-h-40 overflow-y-auto rounded-xl border border-border/50 divide-y divide-border/40 messages-scroll">
								<button
									v-for="u in manageAddOptions"
									:key="u.id"
									type="button"
									class="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/30 transition-colors"
									:disabled="savingMember"
									@click="addMember(u.id)"
								>
									<Icon name="lucide:plus" class="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
									<span class="flex-1 min-w-0 text-sm truncate">{{ memberLabel(u) }}</span>
								</button>
								<p v-if="!manageAddOptions.length" class="px-3 py-3 text-xs text-muted-foreground/60">No teammates found.</p>
							</div>
						</div>
					</template>

					<!-- Moderation log -->
					<div class="border-t border-border/40 pt-3">
						<button
							class="w-full flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground/70 hover:text-muted-foreground transition-colors"
							@click="showModLog = !showModLog"
						>
							<span class="flex items-center gap-1.5">
								<Icon name="lucide:gavel" class="w-3 h-3" />
								Moderation log
							</span>
							<Icon :name="showModLog ? 'lucide:chevron-up' : 'lucide:chevron-down'" class="w-3 h-3" />
						</button>
						<div v-if="showModLog" class="mt-2">
							<div v-if="modLogLoading" class="text-xs text-muted-foreground/60 py-2">Loading…</div>
							<p v-else-if="!modLog.length" class="text-xs text-muted-foreground/60 py-2">No moderation activity yet.</p>
							<div v-else class="max-h-44 overflow-y-auto space-y-2 messages-scroll pr-1">
								<div v-for="ev in modLog" :key="ev.id" class="text-xs">
									<div class="flex items-center gap-1.5">
										<Icon
											:name="ev.action === 'report' ? 'lucide:flag' : ev.action === 'remove' ? 'lucide:trash-2' : 'lucide:eye-off'"
											class="w-3 h-3 shrink-0"
											:class="ev.action === 'remove' ? 'text-destructive' : 'text-muted-foreground/60'"
										/>
										<span class="font-medium text-foreground/90">{{ modActorName(ev.moderator) }}</span>
										<span class="text-muted-foreground/70">{{ modActionLabel[ev.action] || ev.action }}</span>
										<span v-if="ev.message_author" class="text-muted-foreground/50">by {{ modActorName(ev.message_author) }}</span>
										<span class="ml-auto text-muted-foreground/40 shrink-0">{{ fmtModDate(ev.date_created) }}</span>
									</div>
									<p v-if="ev.reason" class="text-muted-foreground/60 pl-[18px]">Reason: {{ ev.reason }}</p>
									<p v-if="ev.message_snippet" class="text-muted-foreground/50 pl-[18px] line-clamp-1 italic">“{{ ev.message_snippet }}”</p>
								</div>
							</div>
						</div>
					</div>

					<div class="flex justify-end">
						<Button variant="outline" size="sm" @click="showManage = false">Done</Button>
					</div>
				</div>
			</UModal>
		</ClientOnly>
	</div>
</template>

<style scoped>
@reference "~/assets/css/tailwind.css";

.messages-scroll {
	scrollbar-width: thin;
	scrollbar-color: transparent transparent;
	scroll-behavior: smooth;
}
.messages-scroll:hover { scrollbar-color: var(--border) transparent; }
.messages-scroll::-webkit-scrollbar { width: 6px; }
.messages-scroll::-webkit-scrollbar-track { background: transparent; }
.messages-scroll::-webkit-scrollbar-thumb { @apply bg-transparent rounded-full; }
.messages-scroll:hover::-webkit-scrollbar-thumb { @apply bg-border; }

/* ── Message enter/leave (1a/1b) ──────────────────────────────────────────────
   Compositor-driven via a reactive class + CSS transition (feedback_motion_stack_policy).
   Enter: brief opacity + translateY from-pose that flips to natural — height is
   untouched so it can't fight scrollToBottom or the "New" divider. Leave: fade +
   grid-row collapse so the row closes deliberately rather than popping. */
.msg-slot {
	display: grid;
	grid-template-rows: 1fr;
	transition: grid-template-rows var(--leave-ms, 200ms) ease, opacity var(--leave-ms, 200ms) ease-out,
		transform var(--enter-ms, 180ms) ease-out;
}
.msg-slot-inner {
	min-height: 0;
	overflow: hidden;
}
.msg-slot.entering {
	opacity: 0;
	transform: translateY(6px);
}
.msg-slot.leaving {
	grid-template-rows: 0fr;
	opacity: 0;
	pointer-events: none;
}
@media (prefers-reduced-motion: reduce) {
	.msg-slot {
		transition: none;
	}
	.msg-slot.entering {
		opacity: 1;
		transform: none;
	}
}

/* Strip Tiptap default chrome so the composer reads as a single pill bar. */
.channel-tiptap :deep(.tiptap-wrapper) { border: none !important; box-shadow: none !important; }
.channel-tiptap :deep(.tiptap-container) {
	border: none !important;
	border-radius: 0 !important;
	background: transparent !important;
	max-height: 160px;
}
.channel-tiptap :deep(.toolbar) {
	border: none !important;
	border-top: 1px solid hsl(var(--border) / 0.2) !important;
	border-radius: 0 !important;
}
.channel-tiptap :deep(.tiptap-container .ProseMirror) {
	font-size: 0.875rem;
	line-height: 1.625;
	min-height: 24px;
}
.channel-tiptap :deep(.tiptap-container .ProseMirror p.is-editor-empty:first-child::before) {
	color: var(--muted-foreground);
	opacity: 0.5;
}
</style>
