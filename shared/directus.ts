
export interface ExtensionSeoMetadata {
    title?: string;
    meta_description?: string;
    og_image?: string;
    additional_fields?: Record<string, unknown>;
    sitemap?: {
        change_frequency: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
        priority: string;
    };
    no_index?: boolean;
    no_follow?: boolean;
}

export interface AiAction {
	/** @primaryKey */
	id: number;
	/** @description Owning organization. */
	organization?: Organization | string | null;
	/** @description User who triggered the AI action. */
	user?: DirectusUser | string | null;
	/** @description The kind of action proposed. Free values allowed as the tool set grows. @required */
	action_type: 'generate_documents' | 'draft_email' | 'send_email' | 'create_tasks' | 'update_field' | 'other';
	/** @description HITL lifecycle. Outbound/destructive actions start pending; safe draft-creation may start executed. @required */
	status: 'pending' | 'approved' | 'rejected' | 'executed' | 'failed';
	/** @description Human-readable one-line summary of the proposed action. */
	title?: string | null;
	/** @description The action parameters (tool input). */
	payload?: Record<string, any> | null;
	/** @description Optional preview of what will happen on approval. */
	preview?: Record<string, any> | null;
	/** @description Execution result (created ids, etc.). */
	result?: Record<string, any> | null;
	/** @description Error message when status=failed. */
	error?: string | null;
	/** @description Optional related collection (e.g. "leads", "projects"). */
	entity_type?: string | null;
	/** @description Optional related record id. */
	entity_id?: string | null;
	/** @description Optional ai_chat_sessions id that produced this action. */
	session_id?: string | null;
	/** @description User who approved/rejected. */
	approved_by?: DirectusUser | string | null;
	/** @description When approved/rejected. */
	approved_at?: string | null;
	/** @description When the action executed. */
	executed_at?: string | null;
	date_created?: string | null;
	date_updated?: string | null;
}

export interface AiChatMessage {
	/** @primaryKey */
	id: number;
	sort?: number | null;
	/** @required */
	role: 'user' | 'assistant' | 'system';
	/** @required */
	content: string;
	/** @description Optional metadata: referenced items, suggestion IDs, action taken, etc. */
	metadata?: Record<string, any> | null;
	date_created?: string | null;
	/** @required */
	session: AiChatSession | string;
	/** @description User feedback on AI response: { rating: "positive"|"negative", correction?: string } */
	feedback?: Record<string, any> | null;
}

export interface AiChatSession {
	/** @primaryKey */
	id: number;
	status?: 'active' | 'archived' | null;
	/** @description Auto-generated or user-set session title */
	title?: string | null;
	/** @description Session context: page, selected items, active module, etc. */
	context?: Record<string, any> | null;
	date_created?: string | null;
	date_updated?: string | null;
	user?: DirectusUser | string | null;
	user_created?: DirectusUser | string | null;
	messages?: string;
}

export interface AiContextSnapshot {
	/** @primaryKey */
	id: number;
	/** @required */
	context_type: 'full' | 'clients' | 'projects' | 'invoices' | 'deals' | 'brand';
	/** @description Serialized context snapshot (JSON) */
	data?: Record<string, any> | null;
	/** @description Approximate token count of the data field */
	token_estimate?: number | null;
	date_created?: string | null;
	/** @description When this snapshot becomes stale */
	expires_at?: string | null;
	/** @required */
	organization: Organization | string;
}

export interface AiNote {
	/** @primaryKey */
	id: number;
	status?: 'active' | 'archived' | null;
	/** @description User-editable title, defaults to first ~80 chars of content */
	title?: string | null;
	/** @description Saved AI response content (markdown) @required */
	content: string;
	/** @description Auto-generated plain-text excerpt for list views (~200 chars) */
	excerpt?: string | null;
	/** @description ID of the specific message saved (string, not FK) */
	source_message_id?: string | null;
	/** @required */
	organization: Organization | string;
	/** @required */
	user: DirectusUser | string;
	/** @description Pin important notes to top of list */
	is_pinned?: boolean | null;
	user_created?: string | null;
	date_created?: string | null;
	date_updated?: string | null;
	source_session?: AiChatSession | string | null;
	tags?: AiNotesAiTag[] | string[];
}

export interface AiNotesAiTag {
	/** @primaryKey */
	id: number;
	sort?: number | null;
	ai_notes_id?: AiNote | string | null;
	ai_tags_id?: AiTag | string | null;
}

export interface AiNoticeHistory {
	/** @primaryKey */
	id: number;
	/** @description MD5 hash of noticeId:orgId:YYYY-MM for deduplication @required */
	notice_hash: string;
	/** @description Deterministic notice ID (e.g. client-overdue-invoices-abc123) @required */
	notice_id: string;
	/** @description client, project, or invoice */
	entity_type?: string | null;
	/** @description UUID of the entity */
	entity_id?: string | null;
	/** @required */
	sent_at: string;
	/** @required */
	organization: Organization | string;
}

export interface AiPreference {
	/** @primaryKey */
	id: number;
	/** @description JSON array of enabled module keys, e.g. ["tickets","projects","invoices"] */
	enabled_modules?: Record<string, any> | null;
	date_created?: string | null;
	date_updated?: string | null;
	/** @required */
	user: DirectusUser | string;
	user_created?: DirectusUser | string | null;
	persona?: 'default' | 'director' | null;
	/** @description Enable AI-generated personalized greetings */
	personalizations_enabled?: boolean | null;
	/** @description Reduce AI token usage */
	low_usage_mode?: boolean | null;
	/** @description Optional personal monthly token cap (null = unlimited) */
	token_budget_monthly?: number | null;
	ai_enabled?: boolean | null;
	organization?: Organization | string | null;
	/** @description How often to receive daily PM project briefs */
	digest_cadence?: 'daily' | 'weekly' | 'off' | null;
}

export interface AiTag {
	/** @primaryKey */
	id: number;
	/** @description Tag display name @required */
	name: string;
	/** @description URL-safe identifier, unique per org */
	slug?: string | null;
	/** @description Badge display color (hex) */
	color?: string | null;
	/** @description category = user-created topic, entity = linked to a client/contact/project @required */
	type: 'category' | 'entity';
	/** @description Only for entity tags — which collection is linked */
	entity_type?: 'client' | 'contact' | 'project' | null;
	/** @description UUID of the linked entity */
	entity_id?: string | null;
	/** @required */
	organization: Organization | string;
	user_created?: string | null;
	date_created?: string | null;
	date_updated?: string | null;
}

export interface AiUsageLog {
	/** @primaryKey */
	id: number;
	/** @required */
	user: DirectusUser | string;
	organization?: Organization | string | null;
	/** @description e.g. ai/chat, marketing/ai-analyze @required */
	endpoint: string;
	/** @description LLM model used */
	model?: string | null;
	input_tokens?: number | null;
	output_tokens?: number | null;
	total_tokens?: number | null;
	/** @description Estimated cost in USD */
	estimated_cost?: number | null;
	/** @description Related ai_chat_sessions ID (nullable) */
	session_id?: string | null;
	/** @description Extra context: client_id, analysis_type, etc. */
	metadata?: Record<string, any> | null;
	date_created?: string | null;
}

export interface AnimationPreset {
	/** @primaryKey */
	id: number;
	sort?: number | null;
	/** @description Preset name (e.g., "Hue Minimal") @required */
	name: string;
	/** @description When to use this preset */
	description?: string | null;
	is_default?: boolean | null;
	/** @description GSAP entrance animation config */
	entrance_config?: Record<string, any> | null;
	/** @description ScrollTrigger config */
	scroll_config?: Record<string, any> | null;
	mobile_optimized?: boolean | null;
}

export interface Appointment {
	/** @primaryKey */
	id: string;
	status?: 'pending' | 'confirmed' | 'canceled';
	sort?: number | null;
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	user_updated?: DirectusUser | string | null;
	date_updated?: string | null;
	title?: string | null;
	description?: string | null;
	start_time?: string | null;
	end_time?: string | null;
	external_event_id?: string | null;
	/** @description Is this a video meeting? */
	is_video?: boolean | null;
	/** @description Linked video meeting */
	video_meeting?: VideoMeeting | string | null;
	google_event_id?: string | null;
	outlook_event_id?: string | null;
	reminder_sent?: boolean | null;
	/** @description Video meeting link (if applicable) */
	meeting_link?: string | null;
	/** @description Twilio room name (if video meeting) */
	room_name?: string | null;
	/** @description Linked lead (if this appointment is about a lead) */
	related_lead?: Lead | string | null;
	/** @description Answers to the event type intake form. Shape mirrors intake_schema fields. */
	intake_responses?: Record<string, any> | null;
	/** @description Event type used when this appointment was booked. Null for legacy/pre-Stage-4 rows. */
	event_type?: EventType | string | null;
	/** @description Stripe Checkout Session id for paid bookings (Stage 5). Idempotency key for success URL + webhook. */
	payment_session_id?: string | null;
	attendees?: AppointmentsDirectusUser[] | string[];
}

export interface AppointmentsDirectusUser {
	/** @primaryKey */
	id: number;
	appointments_id?: Appointment | string | null;
	directus_users_id?: DirectusUser | string | null;
}

export interface ArAnalytic {
	/** @primaryKey */
	id: string;
	status?: 'published' | 'draft' | 'archived';
	sort?: number | null;
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	user_updated?: DirectusUser | string | null;
	date_updated?: string | null;
	client?: ArClient | string | null;
	event_type?: 'scan' | 'ar_view_start' | 'ar_view_end' | 'model_interaction' | 'contact_click' | 'video_play' | 'share' | null;
	session_id?: string | null;
	device_type?: 'ios' | 'android' | 'desktop' | 'unknown' | null;
	browser?: string | null;
	duration_seconds?: number | null;
	interaction_data?: Record<string, any> | null;
	referrer?: string | null;
	user_agent?: string | null;
}

export interface ArClient {
	/** @primaryKey */
	id: string;
	status?: 'published' | 'draft' | 'archived';
	sort?: number | null;
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	user_updated?: DirectusUser | string | null;
	date_updated?: string | null;
	/** @required */
	client_name: string;
	/** @required */
	slug: string;
	tagline?: string | null;
	product_type?: AugmentedReality | string | null;
	organization?: Organization | string | null;
	accent_color?: string | null;
	background_color?: string | null;
	logo_2d?: DirectusFile | string | null;
	contact_email?: string | null;
	contact_phone?: string | null;
	contact_website?: string | null;
	contact_address?: string | null;
	seasonal_effects?: boolean | null;
	analytics_enabled?: boolean | null;
	custom_message?: string | null;
	contract_start?: string | null;
	contract_end?: string | null;
	monthly_fee?: number | null;
	setup_fee_paid?: boolean | null;
	notes?: string | null;
	/** @description Thumbnail for main video intro */
	video_intro_poster?: string | null;
	/** @description Default camera position (e.g., "45deg 75deg 2m") */
	camera_orbit?: string | null;
	/** @description Lighting exposure (1.0 = normal) */
	exposure?: number | null;
	/** @description Shadow darkness (1.0 = normal) */
	shadow_intensity?: number | null;
	/** @description Enable auto-rotation of model */
	auto_rotate?: boolean | null;
	is_demo?: boolean | null;
	use_local_mode?: boolean | null;
	/** @description e.g., hue-logo-3d.glb */
	local_glb_filename?: string | null;
	local_usdz_filename?: string | null;
	model_glb?: DirectusFile | string | null;
	model_usdz?: DirectusFile | string | null;
	hero_video?: DirectusFile | string | null;
	hero_video_poster?: DirectusFile | string | null;
	logo_svg?: DirectusFile | string | null;
	ar_hotspots?: ArHotspot[] | string[];
}

export interface ArHotspot {
	/** @primaryKey */
	id: string;
	status?: 'published' | 'draft' | 'archived' | null;
	sort?: number | null;
	/** @description Short label shown on hover (e.g., "Meet the Chef") @required */
	label: string;
	/** @description Detailed description shown in info panel */
	description?: string | null;
	/** @description Icon displayed in the hotspot button */
	icon?: 'play' | 'default' | 'star' | 'crown' | 'person' | 'location' | 'leaf' | 'wine' | 'history' | 'people' | 'door' | 'pool' | 'balcony' | 'flower' | null;
	/** @description What happens when user taps this hotspot @required */
	action_type: 'info' | 'video' | 'link';
	/** @description X position (left/right) */
	position_x?: number | null;
	/** @description Y position (up/down) */
	position_y?: number | null;
	/** @description Z position (front/back) */
	position_z?: number | null;
	normal_x?: number | null;
	normal_y?: number | null;
	normal_z?: number | null;
	/** @description Camera position when focused (e.g., "45deg 75deg 2m"). Leave empty to not move camera. */
	camera_orbit?: string | null;
	/** @description MP4 video file */
	video_file?: string | null;
	/** @description Thumbnail shown before video plays */
	video_poster?: string | null;
	/** @description URL to open when tapped */
	link_url?: string | null;
	/** @description Open in new tab? */
	link_new_tab?: boolean | null;
	/** @required */
	ar_client: ArClient | string;
}

export interface AugmentedReality {
	/** @primaryKey */
	id: string;
	status?: 'published' | 'draft' | 'archived' | null;
	sort?: number | null;
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	user_updated?: DirectusUser | string | null;
	date_updated?: string | null;
	/** @description URL-friendly identifier (e.g., "aura", "presence") @required */
	slug: string;
	/** @description Product name (e.g., "AURA", "PRESENCE") @required */
	name: string;
	/** @description Short tagline (e.g., "For Luxury Service Providers") */
	tagline?: string | null;
	/** @description Target market description */
	target_market?: string | null;
	/** @description Full product description */
	description?: string | null;
	/** @description One-time creation/setup price */
	creation_price?: number | null;
	/** @description Recurring monthly price */
	monthly_price?: number | null;
	/** @description Label for monthly price (e.g., "Managed service", "Per vessel") */
	monthly_price_label?: string | null;
	/** @description Industries/businesses this product is ideal for */
	ideal_for?: string[] | null;
	/** @description What's included in the creation package */
	creation_package?: Array<{ item: string }> | null;
	/** @description What's included in the monthly service */
	monthly_service?: Array<{ item: string }> | null;
	/** @description Compelling quote for impact section */
	impact_quote?: string | null;
	/** @description Detailed impact/benefit description */
	impact_description?: string | null;
	/** @description Visual icon style for this product */
	icon_type?: 'circles' | 'rectangles' | 'organic' | 'frames' | 'waves' | null;
	/** @description Brand accent color for this product */
	accent_color?: string | null;
	/** @description Main product image */
	featured_image?: DirectusFile | string | null;
	/** @description Product features with title and description */
	features?: Array<{ title: string; description: string }> | null;
	/** @description SEO metadata for this product page */
	seo?: ExtensionSeoMetadata | null;
}

export interface Availability {
	/** @primaryKey */
	id: string;
	status?: 'published' | 'draft' | 'archived';
	sort?: number | null;
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	user_updated?: DirectusUser | string | null;
	date_updated?: string | null;
	user_id?: DirectusUser | string | null;
	day_of_week?: 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | null;
	start_time?: string | null;
	end_time?: string | null;
	recurring?: boolean | null;
	/** @description Is this day available? */
	is_available?: boolean | null;
	/** @description Break start time */
	break_start?: string | null;
	/** @description Break end time */
	break_end?: string | null;
}

export interface BeforeAndAfter {
	/** @primaryKey */
	id: number;
	status?: 'published' | 'draft' | 'archived';
	sort?: number | null;
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	user_updated?: DirectusUser | string | null;
	date_updated?: string | null;
	before_image?: DirectusFile | string | null;
	after_image?: DirectusFile | string | null;
	title?: string | null;
	caption?: string | null;
	/** @description Enable for logo before/afters (keeps images small and contained). Disable for website or full-width comparisons (images fill more of the frame). */
	is_logo?: boolean | null;
}

export interface BlockCallout {
	/** @primaryKey */
	id: number;
	sort?: number | null;
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	user_updated?: DirectusUser | string | null;
	date_updated?: string | null;
	type?: `process condensed` | `process expanded` | `know thyself` | `narrow the focus` | `service boxes` | null;
	status?: 'published' | 'draft' | 'archived';
}

export interface BlockCapabilitiesShowcase {
	/** @primaryKey */
	id: number;
	sort?: number | null;
	/** @required */
	title: string;
	layout?: 'grid' | 'carousel' | 'timeline' | null;
	/** @description Show all capabilities or select specific ones */
	show_all_capabilities?: boolean | null;
	/** @description Animation intensity level */
	animation_style?: 'minimal' | 'standard' | 'dramatic' | 'custom' | null;
	entrance_animation?: 'fade' | `slide-up` | `slide-left` | `slide-right` | 'scale' | 'rotate' | null;
	/** @description When animation triggers */
	scroll_trigger_start?: string | null;
	animation_delay?: number | null;
	stagger_children?: boolean | null;
	parallax_enabled?: boolean | null;
	background_style?: 'default' | 'gradient' | 'color' | 'image' | null;
	container_max_width?: 'narrow' | 'medium' | 'wide' | 'full' | null;
	animation_preset?: AnimationPreset | string | null;
	status?: 'published' | 'draft' | 'archived';
	selected_capabilities?: BlockCapabilitiesShowcaseCapability[] | string[];
}

export interface BlockCapabilitiesShowcaseCapability {
	/** @primaryKey */
	id: number;
	block_capabilities_showcase_id?: BlockCapabilitiesShowcase | string | null;
	capabilities_id?: Capability | string | null;
	sort?: number | null;
}

export interface BlockCard {
	/** @primaryKey */
	id: number;
	sort?: number | null;
	/** @description Cards section title */
	title?: string | null;
	card_style?: 'feature' | 'capability' | 'testimonial' | 'metric' | null;
	layout?: `grid-2` | `grid-3` | `grid-4` | null;
	cards?: Array<{ title: string; description: string; icon: string }> | null;
	/** @description Animation intensity level */
	animation_style?: 'minimal' | 'standard' | 'dramatic' | 'custom' | null;
	entrance_animation?: 'fade' | `slide-up` | `slide-left` | `slide-right` | 'scale' | 'rotate' | null;
	/** @description When animation triggers */
	scroll_trigger_start?: string | null;
	animation_delay?: number | null;
	stagger_children?: boolean | null;
	parallax_enabled?: boolean | null;
	background_style?: 'default' | 'gradient' | 'color' | 'image' | null;
	container_max_width?: 'narrow' | 'medium' | 'wide' | 'full' | null;
	animation_preset?: AnimationPreset | string | null;
	status?: 'published' | 'draft' | 'archived';
}

export interface BlockClientSuccess {
	/** @primaryKey */
	id: number;
	sort?: number | null;
	/** @required */
	title: string;
	show_testimonials?: boolean | null;
	show_metrics?: boolean | null;
	metrics?: Array<{ value: string; label: string }> | null;
	/** @description Animation intensity level */
	animation_style?: 'minimal' | 'standard' | 'dramatic' | 'custom' | null;
	entrance_animation?: 'fade' | `slide-up` | `slide-left` | `slide-right` | 'scale' | 'rotate' | null;
	/** @description When animation triggers */
	scroll_trigger_start?: string | null;
	animation_delay?: number | null;
	stagger_children?: boolean | null;
	parallax_enabled?: boolean | null;
	background_style?: 'default' | 'gradient' | 'color' | 'image' | null;
	container_max_width?: 'narrow' | 'medium' | 'wide' | 'full' | null;
	animation_preset?: AnimationPreset | string | null;
	status?: 'published' | 'draft' | 'archived';
	testimonials?: BlockClientSuccessClientTestimonial[] | string[];
}

export interface BlockClientSuccessClientTestimonial {
	/** @primaryKey */
	id: number;
	block_client_success_id?: BlockClientSuccess | string | null;
	client_testimonials_id?: ClientTestimonial | string | null;
	sort?: number | null;
}

export interface BlockCta {
	/** @primaryKey */
	id: number;
	sort?: number | null;
	/** @required */
	title: string;
	description?: string | null;
	primary_button_text?: string | null;
	primary_button_link?: string | null;
	/** @description Animation intensity level */
	animation_style?: 'minimal' | 'standard' | 'dramatic' | 'custom' | null;
	entrance_animation?: 'fade' | `slide-up` | `slide-left` | `slide-right` | 'scale' | 'rotate' | null;
	/** @description When animation triggers */
	scroll_trigger_start?: string | null;
	animation_delay?: number | null;
	stagger_children?: boolean | null;
	parallax_enabled?: boolean | null;
	background_style?: 'default' | 'gradient' | 'color' | 'image' | null;
	container_max_width?: 'narrow' | 'medium' | 'wide' | 'full' | null;
	animation_preset?: AnimationPreset | string | null;
	show_drawer_button?: boolean | null;
	drawer_button_text?: string | null;
	status?: 'published' | 'draft' | 'archived';
}

export interface BlockHero {
	/** @primaryKey */
	id: number;
	sort?: number | null;
	/** @description Main hero title @required */
	title: string;
	/** @description Hero subtitle or description */
	subtitle?: string | null;
	hero_style?: 'minimal' | 'split' | 'fullscreen' | 'cinematic' | null;
	/** @description Primary CTA button text */
	primary_button_text?: string | null;
	/** @description Primary CTA button link */
	primary_button_link?: string | null;
	show_scroll_indicator?: boolean | null;
	/** @description Animation intensity level */
	animation_style?: 'minimal' | 'standard' | 'dramatic' | 'custom' | null;
	entrance_animation?: 'fade' | `slide-up` | `slide-left` | `slide-right` | 'scale' | 'rotate' | null;
	/** @description When animation triggers */
	scroll_trigger_start?: string | null;
	animation_delay?: number | null;
	stagger_children?: boolean | null;
	parallax_enabled?: boolean | null;
	background_style?: 'default' | 'gradient' | 'color' | 'image' | null;
	container_max_width?: 'narrow' | 'medium' | 'wide' | 'full' | null;
	animation_preset?: AnimationPreset | string | null;
	background_image?: DirectusFile | string | null;
	foreground_image?: DirectusFile | string | null;
	status?: 'published' | 'draft' | 'archived';
}

export interface BlockItemSlideshow {
	/** @primaryKey */
	id: number;
	status?: 'published' | 'draft' | 'archived';
	sort?: number | null;
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	user_updated?: DirectusUser | string | null;
	date_updated?: string | null;
	thumbnail_navigation?: boolean | null;
	portfolio?: Portfolio | string | null;
}

export interface BlockItemsSlideshow {
	/** @primaryKey */
	id: number;
	status?: 'published' | 'draft' | 'archived';
	sort?: number | null;
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	user_updated?: DirectusUser | string | null;
	date_updated?: string | null;
	thumbnail_navigation?: boolean | null;
	title?: string | null;
	subtitle?: string | null;
	link?: string | null;
	link_text?: string | null;
	style?: `full width` | 'carousel' | null;
	portfolio?: BlockItemsSlideshowPortfolio[] | string[];
}

export interface BlockItemsSlideshowPortfolio {
	/** @primaryKey */
	id: number;
	block_items_slideshow_id?: BlockItemsSlideshow | string | null;
	portfolio_id?: Portfolio | string | null;
	sort?: number | null;
}

export interface BlockMasonry {
	/** @primaryKey */
	id: number;
	status?: 'published' | 'draft' | 'archived';
	sort?: number | null;
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	user_updated?: DirectusUser | string | null;
	date_updated?: string | null;
	description?: string | null;
	title?: string | null;
	portfolio?: BlockMasonryPortfolio[] | string[];
}

export interface BlockMasonryPortfolio {
	/** @primaryKey */
	id: number;
	block_masonry_id?: BlockMasonry | string | null;
	portfolio_id?: Portfolio | string | null;
	sort?: number | null;
}

export interface BlockParallaxGrid {
	/** @primaryKey */
	id: number;
	status?: 'published' | 'draft' | 'archived';
	sort?: number | null;
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	user_updated?: DirectusUser | string | null;
	date_updated?: string | null;
	title?: string | null;
	description?: string | null;
	grid_height?: number | null;
	images?: BlockParallaxGridFile[] | string[];
}

export interface BlockParallaxGridFile {
	/** @primaryKey */
	id: number;
	block_parallax_grid_id?: BlockParallaxGrid | string | null;
	directus_files_id?: DirectusFile | string | null;
	sort?: number | null;
}

export interface BlockPortfolioShowcase {
	/** @primaryKey */
	id: number;
	sort?: number | null;
	/** @required */
	title: string;
	layout?: 'grid' | 'masonry' | 'carousel' | null;
	max_items?: number | null;
	/** @description Auto-filter by current service */
	filter_by_service?: boolean | null;
	/** @description Animation intensity level */
	animation_style?: 'minimal' | 'standard' | 'dramatic' | 'custom' | null;
	entrance_animation?: 'fade' | `slide-up` | `slide-left` | `slide-right` | 'scale' | 'rotate' | null;
	/** @description When animation triggers */
	scroll_trigger_start?: string | null;
	animation_delay?: number | null;
	stagger_children?: boolean | null;
	parallax_enabled?: boolean | null;
	background_style?: 'default' | 'gradient' | 'color' | 'image' | null;
	container_max_width?: 'narrow' | 'medium' | 'wide' | 'full' | null;
	animation_preset?: AnimationPreset | string | null;
	status?: 'published' | 'draft' | 'archived';
	subtitle?: string | null;
	link?: string | null;
	link_text?: string | null;
	portfolio_items?: BlockPortfolioShowcasePortfolio[] | string[];
}

export interface BlockPortfolioShowcasePortfolio {
	/** @primaryKey */
	id: number;
	block_portfolio_showcase_id?: BlockPortfolioShowcase | string | null;
	portfolio_id?: Portfolio | string | null;
	sort?: number | null;
}

export interface BlockProcess {
	/** @primaryKey */
	id: number;
	sort?: number | null;
	/** @required */
	title: string;
	layout?: 'horizontal' | 'vertical' | 'grid' | null;
	steps?: Array<{ title: string; description: string; icon: string }> | null;
	/** @description Animation intensity level */
	animation_style?: 'minimal' | 'standard' | 'dramatic' | 'custom' | null;
	entrance_animation?: 'fade' | `slide-up` | `slide-left` | `slide-right` | 'scale' | 'rotate' | null;
	/** @description When animation triggers */
	scroll_trigger_start?: string | null;
	animation_delay?: number | null;
	stagger_children?: boolean | null;
	parallax_enabled?: boolean | null;
	background_style?: 'default' | 'gradient' | 'color' | 'image' | null;
	container_max_width?: 'narrow' | 'medium' | 'wide' | 'full' | null;
	animation_preset?: AnimationPreset | string | null;
	status?: 'published' | 'draft' | 'archived';
}

export interface BlockReveal {
	/** @primaryKey */
	id: number;
	status?: 'published' | 'draft' | 'archived';
	sort?: number | null;
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	user_updated?: DirectusUser | string | null;
	date_updated?: string | null;
	sections?: BlockRevealRevealBlock[] | string[];
}

export interface BlockRevealRevealBlock {
	/** @primaryKey */
	id: number;
	block_reveal_id?: BlockReveal | string | null;
	reveal_blocks_id?: RevealBlock | string | null;
	sort?: number | null;
}

export interface BlockStickyText {
	/** @primaryKey */
	id: number;
	status?: 'published' | 'draft' | 'archived';
	sort?: number | null;
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	user_updated?: DirectusUser | string | null;
	date_updated?: string | null;
	text_lines?: Array<{ text: string }> | null;
	scroll_height?: number | null;
	background_style?: 'default' | 'gradient' | 'color' | 'image' | null;
	text_style?: 'default' | 'large' | 'small' | null;
	text_mode?: 'progressive' | 'individual' | null;
}

export interface BlockText {
	/** @primaryKey */
	id: number;
	sort?: number | null;
	/** @description Section title (optional) */
	title?: string | null;
	/** @description Rich text content @required */
	content: string;
	text_style?: 'standard' | 'large' | 'quote' | 'highlighted' | null;
	/** @description Animation intensity level */
	animation_style?: 'minimal' | 'standard' | 'dramatic' | 'custom' | null;
	entrance_animation?: 'fade' | `slide-up` | `slide-left` | `slide-right` | 'scale' | 'rotate' | null;
	/** @description When animation triggers */
	scroll_trigger_start?: string | null;
	animation_delay?: number | null;
	stagger_children?: boolean | null;
	parallax_enabled?: boolean | null;
	background_style?: 'default' | 'gradient' | 'color' | 'image' | null;
	container_max_width?: 'narrow' | 'medium' | 'wide' | 'full' | null;
	animation_preset?: AnimationPreset | string | null;
	status?: 'published' | 'draft' | 'archived';
}

export interface Blog {
	/** @primaryKey */
	id: number;
	status?: 'published' | 'draft' | 'archived';
	sort?: number | null;
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	user_updated?: DirectusUser | string | null;
	date_updated?: string | null;
	title?: string | null;
	slug?: string | null;
	seo?: ExtensionSeoMetadata | null;
	content?: 'json' | null;
	editor?: 'json' | null;
	/** @description Short description for listings and SEO meta */
	excerpt?: string | null;
	/** @description Main article content */
	body?: string | null;
	featured_image?: DirectusFile | string | null;
	author?: People | string | null;
	/** @description When to publish (can be future-dated) */
	date_published?: string | null;
	/** @description Estimated reading time in minutes */
	reading_time?: number | null;
	/** @description Feature on magazine cover */
	featured?: boolean | null;
	/** @description Which brand/organization this post belongs to */
	organization?: Organization | string | null;
	categories?: BlogBlogCategory[] | string[];
	services?: BlogService[] | string[];
	industries?: BlogIndustry[] | string[];
}

export interface BlogBlogCategory {
	/** @primaryKey */
	id: number;
	blog_id?: Blog | string | null;
	blog_categories_id?: BlogCategory | string | null;
	sort?: number | null;
}

export interface BlogCategory {
	/** @primaryKey */
	id: string;
	status?: 'published' | 'draft' | 'archived';
	sort?: number | null;
	/** @required */
	name: string;
	slug?: string | null;
	description?: string | null;
	color?: string | null;
	/** @description Which brand/organization this category belongs to */
	organization?: Organization | string | null;
}

export interface BlogFile {
	/** @primaryKey */
	id: number;
	blog_id?: Blog | string | null;
	directus_files_id?: DirectusFile | string | null;
}

export interface BlogIndustry {
	/** @primaryKey */
	id: number;
	blog_id?: Blog | string | null;
	industries_id?: Industry | string | null;
	sort?: number | null;
}

export interface BlogService {
	/** @primaryKey */
	id: number;
	blog_id?: Blog | string | null;
	services_id?: Service | string | null;
	sort?: number | null;
}

export interface BusinessHour {
	/** @primaryKey */
	id: number;
	status?: 'published' | 'draft' | 'archived';
	sort?: number | null;
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	user_updated?: DirectusUser | string | null;
	date_updated?: string | null;
	phone_settings_id?: PhoneSetting | string | null;
	/** @required */
	day_of_week: 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
	is_open?: boolean | null;
	open_time?: string | null;
	close_time?: string | null;
}

export interface CallLog {
	/** @primaryKey */
	id: number;
	status?: 'published' | 'draft' | 'archived';
	sort?: number | null;
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	user_updated?: DirectusUser | string | null;
	date_updated?: string | null;
	/** @description Twilio call SID (unique identifier like CA1234...) */
	call_id?: string | null;
	event_type?: 'incoming' | 'outgoing' | 'missed' | 'voicemail' | null;
	call_duration?: number | null;
	transcription?: string | null;
	related_contact?: Contact | string | null;
	related_lead?: Lead | string | null;
	/** @description Caller's phone number (e.g., +15551234567) */
	from_number?: string | null;
	/** @description Your Twilio phone number that received the call */
	to_number?: string | null;
	/** @description Menu key pressed by caller (e.g., '1', '2', '3') */
	selected_option?: string | null;
	/** @description Partner's phone number where call was routed */
	routed_to?: string | null;
	/** @description When the call occurred (auto-populated) */
	timestamp?: string | null;
}

export interface CallRoute {
	/** @primaryKey */
	id: string;
	status?: 'published' | 'draft' | 'archived';
	sort?: number | null;
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	user_updated?: DirectusUser | string | null;
	date_updated?: string | null;
	/** @required */
	phone_settings_id: PhoneSetting | string;
	/** @required */
	department: string;
	/** @description Press 1, 2, etc. @required */
	menu_key: string;
	/** @description Routed to phone number @required */
	phone_number: string;
	active?: boolean | null;
}

export interface Capability {
	/** @primaryKey */
	id: number;
	status?: 'published' | 'draft' | 'archived';
	sort?: number | null;
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	user_updated?: DirectusUser | string | null;
	date_updated?: string | null;
	title?: string | null;
	description?: string | null;
	icon?: string | null;
	/** @description Which icon library contains this icon name */
	icon_family?: 'heroicons' | 'lucide' | null;
	features?: string | null;
	focus?: string | null;
	url?: string | null;
}

export interface CaseStudy {
	/** @primaryKey */
	id: string;
	status?: 'published' | 'draft' | 'archived';
	sort?: number | null;
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	user_updated?: DirectusUser | string | null;
	date_updated?: string | null;
	title?: string | null;
	url?: string | null;
	/** @description Short description for listings and previews */
	excerpt?: string | null;
	featured_image?: DirectusFile | string | null;
	organization?: Organization | string | null;
	challenge?: string | null;
	solution?: string | null;
	results?: string | null;
	project_duration?: string | null;
	project_year?: string | null;
	project_url?: string | null;
	/** @description Keywords and tags for categorization */
	tags?: string[] | null;
	featured?: boolean | null;
	client?: Client | string | null;
	gallery?: CaseStudiesFile[] | string[];
	services?: CaseStudiesService[] | string[];
	portfolio_items?: CaseStudiesPortfolio[] | string[];
	industries?: CaseStudiesIndustry[] | string[];
}

export interface CaseStudiesFile {
	/** @primaryKey */
	id: number;
	case_studies_id?: CaseStudy | string | null;
	directus_files_id?: DirectusFile | string | null;
	sort?: number | null;
}

export interface CaseStudiesIndustry {
	/** @primaryKey */
	id: number;
	case_studies_id?: CaseStudy | string | null;
	industries_id?: Industry | string | null;
	sort?: number | null;
}

export interface CaseStudiesPortfolio {
	/** @primaryKey */
	id: number;
	case_studies_id?: CaseStudy | string | null;
	portfolio_id?: Portfolio | string | null;
	sort?: number | null;
}

export interface CaseStudiesService {
	/** @primaryKey */
	id: number;
	case_studies_id?: CaseStudy | string | null;
	services_id?: Service | string | null;
	sort?: number | null;
}

export interface CdActivity {
	/** @primaryKey */
	id: string;
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	contact?: CdContact | string | null;
	type?: 'email' | 'text' | 'call' | 'meeting' | 'linkedin' | 'other' | 'card_scanned' | 'contact_added' | 'stage_change' | 'converted_client' | 'converted_partner' | 'converted_lead' | 'promoted_to_earnest' | null;
	label?: string | null;
	date?: string | null;
	note?: string | null;
	is_response?: boolean | null;
	response_note?: string | null;
}

export interface CdAiUsageLog {
	/** @primaryKey */
	id: string;
	date_created?: string | null;
	/** @description Which AI route was called, e.g. scan-card, ai-suggestions, ai-sayings. */
	endpoint?: string | null;
	/** @description Claude model used. */
	model?: string | null;
	/** @description Prompt tokens reported by Claude. */
	input_tokens?: number | null;
	/** @description Completion tokens reported by Claude. */
	output_tokens?: number | null;
	/** @description input + output tokens. */
	total_tokens?: number | null;
	/** @description Flat credits deducted for this action (the user-facing cost). */
	credits_charged?: number | null;
	/** @description Estimated real USD cost from Claude pricing — for tuning credit prices later. */
	estimated_cost?: number | null;
	/** @description Which balance was charged: the user's credit balance or their Earnest org token balance. */
	billed_to?: 'user' | 'org' | null;
	/** @description Earnest org charged, when billed_to = org. Null for standalone users. */
	organization?: Organization | string | null;
	/** @description The CardDesk contact/client this AI call related to. Null = general/portfolio-wide. */
	contact?: CdContact | string | null;
	/** @description Optional grouping id to thread related AI calls into one saved session. */
	session_id?: string | null;
	/** @description Endpoint-specific metadata (mode, emailType, etc.). */
	metadata?: Record<string, any> | null;
	/** @description The CardDesk user this AI call is billed to. Set explicitly by the server (admin) since logs are written with the service token. */
	user?: DirectusUser | string | null;
}

export interface CdCard {
	/** @primaryKey */
	id: string;
	/** @description Owner. */
	user?: DirectusUser | string | null;
	display_name?: string | null;
	title?: string | null;
	company?: string | null;
	email?: string | null;
	phone?: string | null;
	website?: string | null;
	linkedin?: string | null;
	/** @description Short tagline. */
	headline?: string | null;
	/** @description Card photo/logo. */
	image?: DirectusFile | string | null;
	/** @description Share activity with connections in the feed. */
	broadcast_activity?: boolean | null;
	date_created?: string | null;
	date_updated?: string | null;
	/** @description Instagram handle or URL. */
	instagram?: string | null;
	/** @description X/Twitter handle or URL. */
	twitter?: string | null;
	/** @description YouTube handle/channel or URL. */
	youtube?: string | null;
	/** @description Behance handle or URL. */
	behance?: string | null;
	/** @description Office / business address shown on the public CardDesk card. */
	office_address?: string | null;
	/** @description Visual design template for the public card: carddesk | editorial | glass | tech. */
	card_theme?: 'carddesk' | 'editorial' | 'glass' | 'tech' | null;
	/** @description Optional cover/banner image (16:9) shown across the top of the public card. */
	cover_image?: string | null;
	/** @description Optional company logo, shown opposite the profile photo. */
	logo_image?: string | null;
	/** @description When off, the office address is hidden on the public shared card. */
	show_address?: boolean;
	/** @description When on, hides the boxed row backgrounds/borders on the glass & tech designs for a cleaner, minimal look. */
	flat_layout?: boolean;
}

export interface CdConnection {
	/** @primaryKey */
	id: string;
	status?: 'pending' | 'accepted' | 'declined' | 'blocked' | null;
	/** @description User who initiated the connection. */
	requester?: DirectusUser | string | null;
	/** @description User who received the request. */
	addressee?: DirectusUser | string | null;
	date_created?: string | null;
	date_updated?: string | null;
}

export interface CdContact {
	/** @primaryKey */
	id: string;
	status?: 'published' | 'draft' | 'archived';
	sort?: number | null;
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	user_updated?: DirectusUser | string | null;
	date_updated?: string | null;
	name?: string | null;
	first_name?: string | null;
	last_name?: string | null;
	title?: string | null;
	company?: string | null;
	email?: string | null;
	phone?: string | null;
	industry?: 'Technology' | 'Finance' | 'Healthcare' | `Real Estate` | 'Legal' | 'Marketing' | `Venture Capital` | null;
	met_at?: string | null;
	rating?: 'hot' | 'warm' | 'nurture' | 'cold' | null;
	hibernated?: boolean | null;
	hibernated_at?: string | null;
	notes?: string | null;
	is_client?: boolean | null;
	client_at?: string | null;
	/** @description Earnest CRM contact this Card Desk card was promoted into. Null = unpromoted. */
	promoted_contact?: Contact | string | null;
	/** @description LinkedIn handle or URL. */
	linkedin?: string | null;
	/** @description Instagram handle or URL. */
	instagram?: string | null;
	/** @description X/Twitter handle or URL. */
	twitter?: string | null;
	/** @description YouTube handle/channel or URL. */
	youtube?: string | null;
	/** @description Behance handle or URL. */
	behance?: string | null;
	/** @description Contact photo (CardDesk). */
	image?: DirectusFile | string | null;
	/** @description Directus user id of this contact if they joined CardDesk (stamped on invite redemption). Bridges contact ↔ connection so the same human isn't two unrelated records. */
	linked_user?: string | null;
	/** @description Mailing / physical address for this contact (CardDesk). */
	address?: string | null;
	/** @description City / region for this contact (used for AI analysis). Distinct from full mailing address. */
	location?: string | null;
	/** @description How this contact was acquired. */
	source?: 'scan' | 'manual' | 'referral' | 'import' | 'event' | null;
	/** @description cd_contacts id of the contact who introduced/spawned this one (referral graph). Null = not a referral. */
	referred_by?: string | null;
	/** @description Relationship ladder stage. */
	pipeline_stage?: 'new' | 'warming' | 'opportunity' | 'client' | 'partner' | 'lost' | null;
	/** @description Goal tag set at Opportunity stage. */
	opportunity_goal?: 'client' | 'partner' | null;
	/** @description Graduated to a referral/collaboration partner. */
	is_partner?: boolean | null;
	/** @description When marked as partner. */
	partner_at?: string | null;
	/** @description Estimated deal value (USD). */
	estimated_value?: number | null;
	/** @description Linked Earnest leads.id after graduation. */
	earnest_lead_id?: string | null;
	/** @description Why a deal was lost. */
	lost_reason?: string | null;
	/** @description What sealed the graduation. */
	conversion_reason?: 'Project' | 'Contract' | 'Referral' | 'Retainer' | 'Collaboration' | null;
	/** @description Free-text detail on the conversion (also Earnest sign-up hook). */
	conversion_note?: string | null;
	/** @description Website / portfolio URL */
	website?: string | null;
	/** @description Additional phone numbers beyond the primary phone: [{label,value}] */
	phones?: Record<string, any> | null;
	/** @description Free-text objective for this contact — the specific win you're chasing (e.g. "Sign a small-business design package"). Shown on cards + detail; feeds AI next-step suggestions. */
	objective?: string | null;
	/** @description Pinned to the top of My Network for quick access. */
	pinned?: boolean | null;
	/** @description Touchpoints / interaction log for this contact (cd_activities). */
	activities?: CdActivity[] | string[];
}

export interface CdCreditAccount {
	/** @primaryKey */
	id: string;
	/** @description Owner of this credit balance. Set explicitly by the server (admin). */
	user?: DirectusUser | string | null;
	date_created?: string | null;
	/** @description Remaining AI credits (flat per-action units). */
	ai_credit_balance?: number | null;
	/** @description Lifetime credits consumed. */
	ai_credits_used_total?: number | null;
	/** @description Credits consumed in the current billing period. */
	ai_credits_used_this_period?: number | null;
	/** @description Start of the current credit billing period. */
	ai_credit_period_start?: string | null;
	/** @description True once the one-time onboarding grant has been applied. */
	free_credits_granted?: boolean | null;
	/** @description Stripe customer id for this user's CardDesk credit purchases. */
	stripe_customer_id?: string | null;
	/** @description Keys of one-time credit rewards already granted to this user (earn-as-you-go gamification). */
	claimed_rewards?: Record<string, any> | null;
}

export interface CdCreditPurchase {
	/** @primaryKey */
	id: string;
	/** @description Purchaser. Set explicitly by the server (admin). */
	user?: DirectusUser | string | null;
	date_created?: string | null;
	/** @description Stripe Checkout Session id. Unique — enforces idempotent fulfillment. */
	stripe_session_id?: string | null;
	/** @description Stripe PaymentIntent id. */
	stripe_payment_intent?: string | null;
	/** @description Purchased package id (e.g. credits_300). */
	package_id?: string | null;
	/** @description Credits granted by this purchase. */
	credits?: number | null;
	/** @description Amount paid, in cents. */
	amount_cents?: number | null;
	/** @description ISO currency code. */
	currency?: string | null;
	/** @description Fulfillment status. */
	status?: 'paid' | 'pending' | 'failed' | null;
}

export interface CdFeedback {
	/** @primaryKey */
	id: string;
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	/** @description Client this feedback relates to. Null = general. */
	contact?: CdContact | string | null;
	/** @description Session this feedback is about. */
	session?: CdSession | string | null;
	/** @description Thumbs reaction. */
	rating?: 'up' | 'down' | null;
	/** @description Which AI feature the feedback is about (e.g. ai-suggestions, ai-sayings). */
	source?: string | null;
	/** @description Did the advice work out? */
	outcome?: 'acted' | 'ignored' | 'worked' | 'didnt_work' | null;
	/** @description Optional free-text note. */
	note?: string | null;
}

export interface CdFeedEvent {
	/** @primaryKey */
	id: string;
	actor?: DirectusUser | string | null;
	type?: string | null;
	visibility?: 'private' | 'connections' | 'public' | null;
	payload?: Record<string, any> | null;
	date_created?: string | null;
}

export interface CdInvite {
	/** @primaryKey */
	id: string;
	/** @description Short URL-safe invite code. */
	code?: string | null;
	inviter?: DirectusUser | string | null;
	/** @description Most recent redeemer (audit; evergreen codes can be reused). */
	accepted_by?: DirectusUser | string | null;
	accepted_at?: string | null;
	/** @description Optional TTL; null = evergreen. */
	expires_at?: string | null;
	date_created?: string | null;
	/** @description cd_contacts id this invite was aimed at (contact-targeted invite). Lets redemption link the joiner back to the exact source contact. */
	contact?: string | null;
	/** @description Email address the invite was sent to (for contact-targeted invites). */
	target_email?: string | null;
}

export interface CdPlan {
	/** @primaryKey */
	id: string;
	/** @description Owner — directus_users id. Set server-side; all reads are scoped to this. */
	user?: string | null;
	/** @description cd_contacts id this plan is for. Null = general / portfolio-wide. */
	contact?: string | null;
	/** @description Short human-readable plan name, e.g. 'Sofia follow-up sequence'. */
	title?: string | null;
	/** @description Lifecycle of the plan. */
	status?: 'active' | 'done' | 'archived' | null;
	/** @description cd_sessions id (chat) this plan was generated from, if any. */
	source_session?: string | null;
	date_created?: string | null;
	date_updated?: string | null;
}

export interface CdReaction {
	/** @primaryKey */
	id: string;
	user?: DirectusUser | string | null;
	event?: CdFeedEvent | string | null;
	emoji?: string | null;
	date_created?: string | null;
}

export interface CdSession {
	/** @primaryKey */
	id: string;
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	/** @description Client this session relates to. Null = general/portfolio-wide. */
	contact?: CdContact | string | null;
	/** @description What kind of AI session. */
	type?: 'coaching' | 'suggestions' | 'lead_review' | 'insights' | 'note' | 'event' | 'chat' | null;
	/** @description Short human-readable title. */
	title?: string | null;
	/** @description Optional one-line summary. */
	summary?: string | null;
	/** @description Ordered conversation: array of { role, content, ai_generated, ts }. */
	messages?: Record<string, any> | null;
	/** @description Pinned to the top of the history. */
	is_pinned?: boolean | null;
}

export interface CdTask {
	/** @primaryKey */
	id: string;
	/** @description Owner — directus_users id. Set server-side; all reads are scoped to this. */
	user?: string | null;
	/** @description cd_plans id this task belongs to. Null = standalone one-off task. */
	plan?: string | null;
	/** @description cd_contacts id this task is about. Null = general. */
	contact?: string | null;
	/** @description What to do, e.g. 'Send LinkedIn connection request with personal note'. */
	title?: string | null;
	/** @description Outreach channel — powers the 'one channel at a time' rule. */
	channel?: 'email' | 'linkedin' | 'call' | 'meet' | 'other' | null;
	/** @description Optional detail — the specific thing to reference ('mention the Q4 partnership idea'). */
	note?: string | null;
	/** @description When this task is due. Drives the agenda + calendar placement. Null = someday/no date. */
	due_at?: string | null;
	/** @description Task state. */
	status?: 'pending' | 'done' | 'skipped' | null;
	/** @description When the task was marked done. */
	completed_at?: string | null;
	/** @description Order within the plan. */
	sort?: number | null;
	/** @description cd_sessions id (chat) this task was generated from, if any. */
	source_session?: string | null;
	date_created?: string | null;
	date_updated?: string | null;
}

export interface CdXpState {
	/** @primaryKey */
	id: string;
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	total_xp?: number | null;
	level?: number | null;
	streak?: number | null;
	last_activity_date?: string | null;
	total_scans?: number | null;
	total_contacts?: number | null;
	fast_followups?: number | null;
	hot_responses?: number | null;
	intros?: number | null;
	unlocked_badges?: Record<string, any> | null;
	completed_missions?: Record<string, any> | null;
	missions_date?: string | null;
	total_clients?: number | null;
	/** @description XP earned in the current ISO week (Mon-based). Reset when week_start rolls over. */
	week_xp?: number | null;
	/** @description Monday (YYYY-MM-DD) of the week week_xp is counting. */
	week_start?: string | null;
	/** @description Date (YYYY-MM-DD) the daily hype was last claimed. One claim per day. */
	hype_date?: string | null;
	/** @description Streak shields held (max 2). Earned at 7-day streaks and revivals; one is auto-consumed when exactly one day is missed so the streak survives. */
	streak_shields?: number | null;
	/** @description Contacts moved into the pipeline. Drives the pipeline_builder badge (10+). */
	pipeline_contacts?: number | null;
	/** @description Contacts marked qualified. Drives the qualifier badge (5+). */
	qualified_count?: number | null;
	/** @description Proposals sent. Drives the proposal_pro badge (3+). */
	proposals_sent?: number | null;
	/** @description Deals marked won. Drives the deal_closer badge (3+). */
	deals_won?: number | null;
	/** @description Lost reasons logged on dead deals. Drives the pipeline_honest badge (5+). */
	lost_reasons_logged?: number | null;
	/** @description Date (YYYY-MM-DD) the daily Network Quiz was last completed. One round per day. */
	quiz_date?: string | null;
	/** @description Count of this user's invites that were accepted (someone joined via their link). Drives the Recruiter badge. */
	invites_accepted?: number | null;
}

export interface ChannelMember {
	/** @primaryKey */
	id: number;
	/** @required */
	channel: Channel | string;
	/** @required */
	user: DirectusUser | string;
	/** @required */
	organization: Organization | string;
	/** @description Read cursor — messages after this are unread */
	last_read_at?: string | null;
	/** @description Anchor for the "new messages" divider */
	last_read_message?: Message | string | null;
	joined_at?: string | null;
	/** @description Suppress unread badge for this channel */
	muted?: boolean | null;
	/** @description NON-null = explicit access grant (ACL). null = cursor-only auto-join row. moderator also unlocks message moderation in this channel. */
	role?: 'member' | 'moderator' | null;
}

export interface ChannelModerationLog {
	/** @primaryKey */
	id: number;
	/** @required */
	channel: Channel | string;
	/** @required */
	organization: Organization | string;
	/** @description Who took the action (null for anon/system) */
	moderator?: DirectusUser | string | null;
	/** @required */
	action: 'hide' | 'remove' | 'report';
	/** @description Report reason / moderator note */
	reason?: string | null;
	/** @description Target message id (plain — the row may be hard-deleted) */
	message_id?: string | null;
	/** @description Snapshot: who wrote the moderated message */
	message_author?: DirectusUser | string | null;
	/** @description Snapshot: stripped text of the moderated message */
	message_snippet?: string | null;
	date_created?: string | null;
}

export interface Channel {
	/** @primaryKey */
	id: string;
	status?: 'published' | 'draft' | 'archived';
	sort?: number | null;
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	user_updated?: DirectusUser | string | null;
	date_updated?: string | null;
	name?: string | null;
	project?: Project | string | null;
	organization?: Organization | string | null;
	description?: string | null;
	ticket?: Ticket | string | null;
	/** @description The client this channel belongs to */
	client?: Client | string | null;
	/** @description One-level folder for org-level channels (Announcements, Eng, …). Ignored for client/project channels. */
	category?: string | null;
	/** @description Who can read this channel. Organization = every org member; Restricted = only listed members + org owner/admin. */
	audience?: 'organization' | 'restricted';
	messages?: Message[] | string[];
	/** @description Membership/ACL rows (channel_members). Used by the audience read filter in patch-channel-audience-perms.ts. */
	members?: ChannelMember[] | string[];
}

export interface ClientPortalUser {
	/** @primaryKey */
	id: number;
	date_created?: string | null;
	date_updated?: string | null;
	user_created?: string | null;
	user_updated?: string | null;
	/** @description The org this portal user belongs to @required */
	organization: Organization | string;
	/** @description The Directus user who logs in @required */
	user: DirectusUser | string;
	/** @description Root client scope. parent_client walk extends visibility to descendants. @required */
	client: Client | string;
	/** @required */
	status: 'pending' | 'active' | 'suspended';
	/** @description Who sent the invite (null for self-signup if ever supported) */
	invited_by?: DirectusUser | string | null;
	invited_at?: string | null;
	accepted_at?: string | null;
}

export interface Client {
	/** @primaryKey */
	id: string;
	status?: 'published' | 'draft' | 'archived';
	sort?: number | null;
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	date_updated?: string | null;
	/** @required */
	name: string;
	slug?: string | null;
	website?: string | null;
	industry?: string | null;
	notes?: string | null;
	tags?: string[] | null;
	/** @required */
	organization: Organization | string;
	logo?: string | null;
	primary_contact?: Contact | string | null;
	/** @description File storage folder for this client */
	folder?: string | null;
	/** @description Billing contact emails for invoice delivery */
	billing_contacts?: Array<{ name: string; email: string }> | null;
	/** @description Short code for invoice numbering (e.g., ABC, XYZ) */
	code?: string | null;
	/** @description Voice, visual style, positioning for this client */
	brand_direction?: string | null;
	/** @description Business objectives for this client */
	goals?: string | null;
	/** @description Who the client is trying to reach */
	target_audience?: string | null;
	/** @description Primary market or location */
	location?: string | null;
	/** @description Services we provide to this client */
	services?: string[] | null;
	/** @description Primary billing email for invoice delivery */
	billing_email?: string | null;
	/** @description AP contact name or department */
	billing_name?: string | null;
	/** @description Billing / mailing address */
	billing_address?: string | null;
	/** @description Default payment terms for new invoices */
	payment_terms?: 'due_on_receipt' | 'net_15' | 'net_30' | 'net_45' | 'net_60' | null;
	/** @description Parent client for sub-brands. Billing falls back to parent if not set on this client. */
	parent_client?: Client | string | null;
	/** @description Customer relationship state. Lifecycle (published/draft/archived) lives on `status`. */
	account_state?: 'active' | 'prospect' | 'inactive' | 'churned' | null;
	/** @description Bumped by /api/clients/bump-activity when a child project/ticket/task changes. Drives the "Recent" client sort. */
	last_activity_at?: string | null;
	/** @description Teams assigned to this client */
	assigned_teams?: ClientsTeam[] | string[];
	/** @description Individual users with direct access to this client */
	assigned_users?: ClientsDirectusUser[] | string[];
	/** @description Sub-brands that bill through this client */
	sub_brands?: Client[] | string[];
	/** @description Contacts who belong to this client. Inverse of contacts.client. */
	contacts?: Contact[] | string[];
	/** @description Partner/connector relationships pointing at this client. Inverse of contact_connections.client. */
	partner_connections?: ContactConnection[] | string[];
}

export interface ClientsDirectusUser {
	/** @primaryKey */
	id: number;
	clients_id?: Client | string | null;
	directus_users_id?: DirectusUser | string | null;
	sort?: number | null;
	date_created?: string | null;
}

export interface ClientsTeam {
	/** @primaryKey */
	id: number;
	clients_id?: Client | string | null;
	teams_id?: Team | string | null;
	sort?: number | null;
	date_created?: string | null;
}

export interface ClientTestimonial {
	/** @primaryKey */
	id: number;
	sort?: number | null;
	/** @description Client testimonial quote @required */
	quote: string;
	/** @required */
	client_name: string;
	/** @description Job title */
	client_title?: string | null;
	/** @required */
	client_company: string;
	/** @description Company logo */
	client_logo?: string | null;
	/** @description Client headshot (optional) */
	client_photo?: string | null;
	/** @description Brief context about the project */
	project_context?: string | null;
	/** @description Star rating (1-5) */
	rating?: number | null;
	/** @description Feature this testimonial */
	featured?: boolean | null;
	/** @description Related portfolio item from your existing portfolio collection */
	related_portfolio?: Portfolio | string | null;
	service_category?: 'brand_design' | 'web_design' | 'digital_marketing' | 'strategy' | null;
}

export interface ClientTimeline {
	/** @primaryKey */
	id: string;
	date_created?: string | null;
	/** @description Owning org. */
	organization?: Organization | string;
	/** @description Client this event belongs to. */
	client?: Client | string;
	/** @description e.g. contract.signed, invoice.paid, proposal.accepted, plan.approved, csat.submitted, changes.requested. */
	verb?: string;
	/** @description Human-readable one-liner shown on the timeline. */
	title?: string;
	/** @description Optional secondary detail (note text, amount label). */
	subtitle?: string | null;
	/** @description Who performed the action. */
	actor_type?: 'client' | 'staff' | 'system' | null;
	/** @description Display name of the actor (signer name, portal user). */
	actor_name?: string | null;
	/** @description The directus user, when the actor was authenticated. Null for anonymous portal actions. */
	actor_user?: DirectusUser | string | null;
	/** @description Collection of the doc that triggered this (contracts, invoices, ...). */
	source_collection?: string | null;
	/** @description PK of the source doc. */
	source_id?: string | null;
	/** @description Money amount for payment events (dollars). */
	amount?: number | null;
	/** @description App-relative link the timeline row points at. */
	href?: string | null;
	/** @description Lucide icon name for the timeline row. */
	icon?: string | null;
	/** @description Freeform extra data. */
	metadata?: Record<string, any> | null;
}

export interface CommentReport {
	/** @primaryKey */
	id: number;
	status?: 'pending' | 'reviewed' | 'dismissed';
	date_created?: string | null;
	user_created?: DirectusUser | string | null;
	/** @description The reported comment @required */
	comment: Comment | string;
	/** @required */
	reason: 'spam' | 'inappropriate' | 'harassment' | 'off_topic' | 'other';
	/** @description Optional explanation */
	details?: string | null;
	/** @description Admin who reviewed this report */
	reviewed_by?: DirectusUser | string | null;
	reviewed_at?: string | null;
}

export interface Comment {
	/** @primaryKey */
	id: number;
	status?: 'published' | 'draft' | 'archived';
	sort?: number | null;
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	user_updated?: DirectusUser | string | null;
	date_updated?: string | null;
	user?: DirectusUser | string | null;
	comment?: string | null;
	parent_id?: number | null;
	collection?: string | null;
	tickets_id?: string | null;
	item?: string | null;
	is_edited?: boolean | null;
	is_resolved?: boolean | null;
	/** @description Admin who hid this comment */
	hidden_by?: DirectusUser | string | null;
	/** @description When the comment was hidden */
	hidden_at?: string | null;
}

export interface ContactConnection {
	/** @primaryKey */
	id: number;
	sort?: number | null;
	date_created?: string | null;
	user_created?: string | null;
	/** @description The connector (usually category=partner) @required */
	contact: Contact | string;
	/** @description The client this contact has a relationship with (beyond employment) @required */
	client: Client | string;
	/** @description Nature of the connection @required */
	role: 'referral_partner' | 'vendor' | 'board' | 'consultant' | 'investor' | 'other';
	/** @description Direction of the introduction (for referral attribution) */
	introduced_by?: 'partner' | 'us' | null;
	/** @description Optional free-form context about the relationship */
	notes?: string | null;
}

export interface Contact {
	/** @primaryKey */
	id: string;
	status?: 'published' | 'draft' | 'archived';
	sort?: number | null;
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	user_updated?: DirectusUser | string | null;
	date_updated?: string | null;
	first_name?: string | null;
	last_name?: string | null;
	email?: string | null;
	phone?: string | null;
	title?: string | null;
	user?: DirectusUser | string | null;
	notes?: string | null;
	/** @description Company name (separate from organization relation) */
	company?: string | null;
	/** @description Streamlined categories focused on Hue's target market */
	category?: 'client' | 'prospect' | 'architect' | 'developer' | 'hospitality' | 'partner' | 'media' | null;
	/** @description Contact photo or headshot */
	photo?: string | null;
	/** @description Personal or company website */
	website?: string | null;
	/** @description LinkedIn profile URL */
	linkedin_url?: string | null;
	/** @description Instagram handle (without @) */
	instagram_handle?: string | null;
	/** @description Custom tags for flexible categorization (e.g., VIP, Speaker, Budget-Conscious) */
	tags?: string[] | null;
	/** @description Mailing address for sending materials */
	mailing_address?: string | null;
	prefix?: `Mr.` | `Ms.` | `Mrs.` | `Dr.` | `Prof.` | `Mx.` | null;
	industry?: 'Technology' | 'Healthcare' | 'Finance' | 'Education' | `Real Estate` | 'Hospitality' | 'Legal' | `Non-Profit` | 'Government' | null;
	email_subscribed?: boolean | null;
	email_unsubscribed_at?: string | null;
	unsubscribe_token?: string | null;
	email_bounced?: boolean | null;
	email_bounced_at?: string | null;
	email_bounce_type?: string | null;
	last_opened_at?: string | null;
	last_clicked_at?: string | null;
	total_emails_sent?: number | null;
	total_opens?: number | null;
	total_clicks?: number | null;
	custom_fields?: string | null;
	source?: string | null;
	timezone?: string | null;
	/** @description The client company this contact belongs to */
	client?: Client | string | null;
	/** @description When true, this contact is used as a billing recipient for invoices issued to its client (and inherited by sub-clients via parent_client walk). */
	is_billing_contact?: boolean;
	/** @description Most recent inbound or outbound touch across email / meeting / message / task. Maintained by server hooks; nullable for never-contacted rows. */
	last_contacted_at?: string | null;
	/** @description Which channel produced the timestamp in last_contacted_at. Pair with the timestamp to render "Met yesterday" vs "Emailed last week". */
	last_contacted_channel?: 'email' | 'meeting' | 'message' | 'task' | 'manual' | null;
	organizations?: ContactsOrganization[] | string[];
	lists?: MailingListContact[] | string[];
	/** @description Leads associated with this contact. Inverse of leads.related_contact. */
	leads?: Lead[] | string[];
	/** @description Cross-client connections. Inverse of contact_connections.contact. */
	connections?: ContactConnection[] | string[];
	/** @description Projects this contact is pinned to. */
	projects?: ProjectsContact[] | string[];
}

export interface ContactsOrganization {
	/** @primaryKey */
	id: number;
	contacts_id?: Contact | string | null;
	organizations_id?: Organization | string | null;
	sort?: number | null;
}

export interface ContentPlan {
	/** @primaryKey */
	id: number;
	date_created?: string | null;
	date_updated?: string | null;
	user_created?: DirectusUser | string | null;
	/** @description Optional human-friendly title. Auto-derived from project + month/event when blank. */
	title?: string | null;
	/** @description Retainer (or fixed-fee) project this plan delivers against. Joins the hour pool. */
	project?: Project | string | null;
	/** @description Client this plan is for (denormalized for portal scoping). Should match project.client. */
	target_client?: Client | string | null;
	/** @description Shape of this plan. monthly_cadence is the default for retainers; campaign/launch tie to a project_event. */
	plan_type?: 'monthly_cadence' | 'campaign' | 'launch' | 'custom';
	/** @description First-of-month anchor for monthly_cadence plans. Null for campaign/launch. */
	target_month?: string | null;
	/** @description Project milestone/event this plan is built around (campaign/launch). Null for monthly cadence. */
	project_event?: ProjectEvent | string | null;
	/** @description Plan-level approval state. Used to gate plan-level review independently of per-post approval_state. */
	state?: 'draft' | 'in_review' | 'approved' | 'archived';
	/** @description One-line goal for this plan ("Drive RSVPs to launch event"). */
	objective?: string | null;
	/** @description Themes/pillars for the plan ("Behind the scenes", "Product hero shots", …). */
	themes?: string[] | null;
	/** @description Full strategy/intro shown to the client at the top of the review page. */
	strategy?: string | null;
	/** @description Optional hero image for the plan card in Studio and the top of the portal review page. */
	cover_image_url?: string | null;
	/** @description Opaque token used by the portal review surface. Server-managed. */
	approval_token?: string | null;
	approved_by?: DirectusUser | string | null;
	approved_at?: string | null;
	/** @description When the plan was first sent to the client for review. */
	sent_for_review_at?: string | null;
	/** @description Owning organization (tenant scope). @required */
	organization: Organization | string;
}

export interface Contract {
	/** @primaryKey */
	id: number;
	status?: 'published' | 'draft' | 'archived' | null;
	sort?: number | null;
	date_created?: string | null;
	date_updated?: string | null;
	user_created?: string | null;
	user_updated?: string | null;
	/** @description e.g. "Master Services Agreement — Atlas Fintech" @required */
	title: string;
	contract_status?: 'draft' | 'sent' | 'signed' | 'declined' | 'cancelled' | 'expired' | null;
	total_value?: number | null;
	date_sent?: string | null;
	/** @description After this, the unsigned contract auto-expires */
	valid_until?: string | null;
	/** @description When the agreement takes effect (often signing date) */
	effective_date?: string | null;
	/** @description Internal notes (not rendered to the client). Use blocks for the contract body. */
	notes?: string | null;
	/** @description Ordered array of block entries: { block_id, heading, content, page_break_after } */
	blocks?: Record<string, any> | null;
	/** @description Final signed PDF (uploaded post-signing) */
	file?: string | null;
	/** @description Timestamp of signature */
	signed_at?: string | null;
	signed_by_name?: string | null;
	signed_by_email?: string | null;
	signed_by_ip?: string | null;
	/** @description Typed-name string OR data-URL of drawn signature */
	signature_data?: string | null;
	/** @description UUID for the public unauth signing URL */
	signing_token?: string | null;
	/** @required */
	organization: Organization | string;
	/** @description Recipient — usually the client signer */
	contact?: Contact | string | null;
	lead?: Lead | string | null;
	/** @description Source proposal (if generated from one) */
	proposal?: Proposal | string | null;
	client?: Client | string | null;
}

export interface Course {
	/** @primaryKey */
	id: string;
	status?: 'published' | 'draft' | 'archived';
	sort?: number | null;
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	user_updated?: DirectusUser | string | null;
	date_updated?: string | null;
	title?: string | null;
	description?: string | null;
	menu_id?: Menu | string | null;
	options?: Option[] | string[];
}

export interface CurrentWork {
	/** @primaryKey */
	id: number;
	/** @description Only Published items appear on the site. */
	status?: 'published' | 'draft' | 'archived';
	sort?: number | null;
	/** @description Client / project name. @required */
	name: string;
	/** @description Small label shown at rest, e.g. "Brand & Digital". */
	category?: string | null;
	/** @description Status pill copy. */
	stage?: string | null;
	/** @description One short, editorial descriptor — revealed on interaction. Keep it NDA-safe. */
	descriptor?: string | null;
	/** @description Discipline tags revealed on hover. */
	disciplines?: string[] | null;
	/** @description Base color for the gradient used when no image is set. */
	tint?: string | null;
	/** @description Optional crop. Omit for an NDA-safe gradient fallback. */
	image?: string | null;
	/** @description Optional URL once there's a public page to point at. */
	link?: string | null;
	date_created?: string | null;
	date_updated?: string | null;
}

export interface DirectorBriefing {
	/** @primaryKey */
	id: number;
	/** @description Owning organization. */
	organization?: Organization | string | null;
	/** @description User who convened this briefing. */
	user?: DirectusUser | string | null;
	/** @description Org-wide meeting or a focused one-entity meeting. */
	scope_type?: 'org' | 'entity';
	/** @description Focused meeting: the collection (e.g. "projects", "clients"). */
	entity_type?: string | null;
	/** @description Focused meeting: the record id. */
	entity_id?: string | null;
	/** @description Agenda subject key (money, clients, projects, leads, proposals, tickets) or blank for a free topic. */
	subject?: string | null;
	/** @description Optional free-text steer the user raised. */
	topic?: string | null;
	/** @description Deterministic lookup key: scope + subject + topic. The office finds the latest briefing for a section by this. */
	cache_key?: string;
	/** @description Ties this briefing to its proposed steps (ai_actions rows with session_id == this). */
	plan_id?: string | null;
	/** @description Earnest's narrative rationale/briefing prose. */
	intro?: string | null;
	/** @description Money-mode metric snapshot. */
	finance?: Record<string, any> | null;
	/** @description Money-mode opportunity intel snapshot. */
	opportunity?: Record<string, any> | null;
	/** @description Focused client-review scorecard snapshot. */
	client_rating?: Record<string, any> | null;
	/** @description Optional board-packet (agenda) snapshot at draft time. */
	agenda?: Record<string, any> | null;
	/** @description Number of proposed steps at draft time. */
	step_count?: number | null;
	date_created?: string | null;
	date_updated?: string | null;
}

export interface DirectorMinute {
	/** @primaryKey */
	id: number;
	/** @description Owning organization (row-scopes read). */
	organization?: Organization | string | null;
	/** @description The Director who recorded these minutes. */
	author?: DirectusUser | string | null;
	/** @description The live session these minutes came from, if any (solo meetings have none). */
	session?: DirectorSession | string | null;
	/** @description Human label (subject / topic). */
	title?: string | null;
	/** @description Org-wide, a focused one-entity meeting, or a personal "my work" review. */
	scope_type?: 'org' | 'entity' | 'mine';
	/** @description Focused meeting: the collection (e.g. "projects"). */
	entity_type?: string | null;
	/** @description Focused meeting: the record id. */
	entity_id?: string | null;
	/** @description Agenda subject key or blank for a free topic. */
	subject?: string | null;
	/** @description Optional free-text steer that framed the meeting. */
	topic?: string | null;
	/** @description The plan whose steps were decided (ai_actions rows with session_id == this). */
	plan_id?: string | null;
	/** @description AI-generated plain-English recap of what was reviewed and decided. */
	summary?: string | null;
	/** @description The briefing intro/rationale carried over so the recap deck reads on its own. */
	intro?: string | null;
	/** @description TL;DR takeaway bullets for the recap deck. */
	points?: Record<string, any> | null;
	/** @description Money-mode snapshot metrics on screen at recording time. */
	finance?: Record<string, any> | null;
	/** @description Money-mode opportunity intel snapshot. */
	opportunity?: Record<string, any> | null;
	/** @description Focused client-review scorecard snapshot. */
	client_rating?: Record<string, any> | null;
	/** @description Snapshot of every proposed step + how it was decided: [{id, action_type, title, preview, status}]. */
	steps?: Record<string, any> | null;
	/** @description Action items captured during the meeting: [{type, title, priority, assignees}]. */
	captured?: Record<string, any> | null;
	/** @description The Ask-Earnest thread: [{role, text}]. */
	qa?: Record<string, any> | null;
	/** @description Rollup {done, skipped, failed, open, total, captured}. */
	stats?: Record<string, any> | null;
	/** @description recorded (saved) / shared (fanned out to teammates for review). */
	status?: 'recorded' | 'shared';
	date_created?: string | null;
	date_updated?: string | null;
}

export interface DirectorParticipant {
	/** @primaryKey */
	id: number;
	/** @description The live session. */
	session?: DirectorSession | string | null;
	/** @description Owning organization (row-scopes realtime read). */
	organization?: Organization | string | null;
	/** @description The attendee. */
	user?: DirectusUser | string | null;
	/** @description Host convened; members were invited or joined. */
	role?: 'host' | 'member';
	/** @description invited (notified, not joined) / active (in the room) / left. */
	status?: 'invited' | 'active' | 'left';
	/** @description Which slide this attendee is viewing (presence dot). */
	current_slide?: number | null;
	/** @description Last presence heartbeat. */
	last_seen?: string | null;
	date_created?: string | null;
	date_updated?: string | null;
}

export interface DirectorQa {
	/** @primaryKey */
	id: number;
	/** @description The live session. */
	session?: DirectorSession | string | null;
	/** @description Owning organization (row-scopes realtime read). */
	organization?: Organization | string | null;
	/** @description Who asked (null for Earnest's answer). */
	user?: DirectusUser | string | null;
	/** @description user question / assistant (Earnest) answer. */
	role?: 'user' | 'assistant';
	/** @description The question or answer text. */
	text?: string | null;
	date_created?: string | null;
}

export interface DirectorSession {
	/** @primaryKey */
	id: number;
	/** @description Owning organization (row-scopes realtime read). */
	organization?: Organization | string | null;
	/** @description User who convened the meeting. */
	host?: DirectusUser | string | null;
	/** @description Who is currently driving the deck (attendees can follow). */
	presenter?: DirectusUser | string | null;
	/** @description Human label (subject / topic). */
	title?: string | null;
	/** @description Live meetings show in the join list; ended ones are history. */
	status?: 'live' | 'ended';
	/** @description Org-wide meeting or a focused one-entity meeting. */
	scope_type?: 'org' | 'entity';
	/** @description Focused meeting: the collection (e.g. "projects"). */
	entity_type?: string | null;
	/** @description Focused meeting: the record id. */
	entity_id?: string | null;
	/** @description Agenda subject key or blank for a free topic. */
	subject?: string | null;
	/** @description Optional free-text steer. */
	topic?: string | null;
	/** @description Ties this session to its proposed steps (ai_actions rows with session_id == this) + briefing. */
	plan_id?: string | null;
	/** @description The presenter's current slide index (attendees following jump here). */
	current_slide?: number | null;
	/** @description When on, attendees' decks follow the presenter's slide. */
	follow_presenter?: boolean;
	/** @description Bumped on every step decision / plan change so attendees re-fetch steps. */
	revision?: number;
	/** @description Last event {actorId, actorName, type, stepId, status, at} — drives the live ticker. */
	last_activity?: Record<string, any> | null;
	date_created?: string | null;
	date_updated?: string | null;
	/** @description Which advisors (agenda subject keys) are IN the room. null/empty = all. Curation is the privacy lever — omit "money" and no one in the meeting sees the money. */
	included_subjects?: Record<string, any> | null;
	/** @description When on, only the presenter can approve/skip; everyone else is a view-only observer (and force-follows). */
	view_only?: boolean;
	/** @description The advisor (subject) the presenter is currently on — followers mirror it. */
	shared_subject?: string | null;
	/** @description The presenter's current view mode — followers mirror it so they see the same screen. */
	shared_view_mode?: 'outline' | 'slides' | null;
}

export interface DocumentBlock {
	/** @primaryKey */
	id: number;
	status?: 'published' | 'draft' | 'archived' | null;
	sort?: number | null;
	date_created?: string | null;
	date_updated?: string | null;
	user_created?: string | null;
	user_updated?: string | null;
	/** @description e.g. "Studio bio", "Standard NDA terms" @required */
	name: string;
	/** @description Filter / group in the picker */
	category?: 'bio' | 'references' | 'case_study' | 'deliverables' | 'pricing' | 'timeline' | 'terms' | 'nda' | 'cover' | 'other' | null;
	/** @description One-liner shown in the block picker */
	description?: string | null;
	/** @description Which document types can use this block */
	applies_to?: Array<'proposals' | 'contracts'> | null;
	/** @description Owning organization @required */
	organization: Organization | string;
	/** @description Block content (markdown). Renders into proposals + contracts. Per-document overrides don't mutate this. */
	content?: string | null;
	/** @description Block primitive — drives editor + renderer dispatch via the shared block registry. */
	type?: 'rich_text' | 'cover' | 'signed_letter' | 'figure' | 'repeater' | 'grouped_list' | 'pull_quote' | 'scope_tree' | 'pricing_tiers' | 'line_items' | 'footnotes' | 'numbered_clauses' | 'definitions' | 'signature_block' | null;
	/** @description Typed payload matching `type`. For rich_text: { heading, body_markdown }. */
	payload?: Record<string, any> | null;
}

export interface EarlyAccess {
	/** @primaryKey */
	id: string;
	status?: 'new' | 'contacted' | 'invited' | 'joined' | 'archived' | null;
	sort?: number | null;
	date_created?: string | null;
	/** @required */
	name: string;
	/** @required */
	email: string;
	/** @description Their role / title */
	role?: string | null;
	phone?: string | null;
	company?: string | null;
	business_type?: 'agency' | 'solo' | 'small_business' | 'startup' | 'other' | null;
	team_size?: '1' | `2-5` | `6-15` | `16-50` | `50+` | null;
	website?: string | null;
	/** @description Tools they use today (what we'd replace) */
	current_tools?: string | null;
	/** @description What they want to achieve with Earnest */
	goals?: string | null;
	/** @description Features / apps they're most interested in */
	features_interested?: string[] | null;
	timeline?: 'exploring' | 'month' | 'now' | null;
	source?: string | null;
	/** @description Where they came from (page / utm) */
	referrer?: string | null;
	/** @description Anything else they told us */
	notes?: string | null;
}

export interface EarnestHistory {
	/** @primaryKey */
	id: string;
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	organization?: Organization | string | null;
	/** @description The day this snapshot represents @required */
	date: string;
	/** @description Earnest score 0-100 */
	score?: number | null;
	ep_earned?: number | null;
	streak?: number | null;
	/** @description Five dimension breakdown */
	dimensions?: Record<string, any> | null;
}

export interface EarnestReview {
	/** @primaryKey */
	id: string;
	status?: 'published' | 'draft' | 'archived';
	sort?: number | null;
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	/** @description The user who submitted this review */
	user?: DirectusUser | string | null;
	/** @description The review text @required */
	quote: string;
	/** @description Star rating 1-5 @required */
	rating: number;
	/** @description How the reviewer appears publicly */
	display_name?: string | null;
	/** @description Job title for public display */
	display_title?: string | null;
	/** @description Company for public display */
	display_company?: string | null;
	/** @description Photo for public display */
	display_photo?: DirectusFile | string | null;
	/** @description User opted in to share publicly */
	is_public?: boolean | null;
	/** @description Admin curated for prominent display */
	featured?: boolean | null;
	source?: 'companion' | 'website' | 'manual' | null;
}

export interface EarnestScanCredit {
	/** @primaryKey */
	id: string;
	/** @description Organization this pool belongs to @required */
	account_id: Organization | string;
	/** @description Monthly allotment from plan */
	scans_monthly?: number | null;
	/** @description Purchased bonus scans */
	scans_banked?: number | null;
	scans_used_this_month?: number | null;
	last_reset_at?: string | null;
	date_created?: string | null;
}

export interface EarnestScore {
	/** @primaryKey */
	id: string;
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	date_updated?: string | null;
	organization?: Organization | string | null;
	total_ep?: number | null;
	level?: number | null;
	/** @description Todays earnest score 0-100 */
	current_score?: number | null;
	streak?: number | null;
	best_streak?: number | null;
	last_activity_date?: string | null;
	days_active_this_week?: number | null;
	total_tasks_completed?: number | null;
	projects_fully_completed?: number | null;
	advance_schedule_count?: number | null;
	consecutive_high_completion_days?: number | null;
	consecutive_responsive_days?: number | null;
	consecutive_top_rank_days?: number | null;
	badges_unlocked?: Record<string, any> | null;
	/** @description Five dimension breakdown */
	dimension_scores?: Record<string, any> | null;
}

export interface EarnestShowcaseBrand {
	/** @primaryKey */
	id: string;
	status?: 'published' | 'draft' | 'archived';
	sort?: number | null;
	/** @description Brand name @required */
	name: string;
	/** @description Brand logo @required */
	logo: DirectusFile | string;
	/** @description Optional website URL */
	url?: string | null;
	/** @description Show prominently */
	featured?: boolean | null;
}

export interface EarnestTokenPool {
	/** @primaryKey */
	id: string;
	/** @description Organization this pool belongs to @required */
	account_id: Organization | string;
	/** @required */
	pool_type: 'agency' | 'client';
	/** @description Monthly allotment from plan */
	tokens_monthly?: number | null;
	/** @description Purchased/bonus tokens available */
	tokens_banked?: number | null;
	tokens_used_this_month?: number | null;
	last_reset_at?: string | null;
	stripe_subscription_id?: string | null;
	/** @description Earnest plan ID at time of pool creation */
	plan_tier?: string | null;
	date_created?: string | null;
}

export interface EmailEvent {
	/** @primaryKey */
	id: number;
	sort?: number | null;
	date_created?: string | null;
	/** @description Campaign this event belongs to */
	email_id?: Email | string | null;
	/** @description SendGrid's unique event id — used to dedupe retries */
	sg_event_id?: string | null;
	/** @description SendGrid message id — shared across events from the same send */
	sg_message_id?: string | null;
	event?: 'delivered' | 'open' | 'click' | 'bounce' | 'dropped' | 'deferred' | 'processed' | 'spamreport' | 'unsubscribe' | 'group_unsubscribe' | 'group_resubscribe' | null;
	recipient?: string | null;
	/** @description When SendGrid recorded the event */
	timestamp?: string | null;
	/** @description Clicked URL (for click events) */
	url?: string | null;
	/** @description Failure reason from SendGrid (for bounce/dropped/deferred) */
	reason?: string | null;
	/** @description Full SendGrid event payload for debugging */
	raw?: Record<string, any> | null;
	/** @description Organization (denormalized from campaign for filter perf) */
	organization?: Organization | string | null;
	/** @description DEPRECATED — use `contact` (uuid) instead. This integer field is unused and can be ignored. */
	contact_id?: number | null;
	/** @description Contact matched by recipient email at event time */
	contact?: Contact | string | null;
}

export interface EmailPartial {
	/** @primaryKey */
	id: number;
	status?: 'published' | 'draft' | 'archived';
	sort?: number | null;
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	user_updated?: DirectusUser | string | null;
	date_updated?: string | null;
	name?: string | null;
	slug?: string | null;
	type?: 'header' | 'footer' | 'web_version_bar' | null;
	description?: string | null;
	mjml_source?: string | null;
	variables_schema?: Record<string, any> | null;
	instance_variables?: Record<string, any> | null;
	is_default?: boolean | null;
	/** @description Organization that owns this partial. Null = system default. */
	organization?: Organization | string | null;
}

export interface Email {
	/** @primaryKey */
	id: number;
	status?: 'published' | 'draft' | 'archived' | 'sending' | 'sent' | 'failed';
	sort?: number | null;
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	user_updated?: DirectusUser | string | null;
	date_updated?: string | null;
	/** @required */
	name: string;
	subject?: string | null;
	template_id?: EmailTemplate | string | null;
	target_lists?: string | null;
	cc_list?: string | null;
	bcc_list?: string | null;
	custom_variables?: string | null;
	scheduled_at?: string | null;
	sent_at?: string | null;
	total_recipients?: number | null;
	total_sent?: number | null;
	total_failed?: number | null;
	send_errors?: Record<string, any> | null;
	preview_html?: string | null;
	/** @description Organization this campaign belongs to */
	organization?: Organization | string | null;
}

export interface EmailTemplate {
	/** @primaryKey */
	id: number;
	status?: 'published' | 'draft' | 'archived';
	sort?: number | null;
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	user_updated?: DirectusUser | string | null;
	date_updated?: string | null;
	name?: string | null;
	/** @required */
	slug: string;
	type?: 'newsletter' | 'transactional' | null;
	subject_template?: string | null;
	mjml_source?: string | null;
	html_compiled?: string | null;
	mjml_assembled_at?: string | null;
	block_count?: number | null;
	include_header?: boolean | null;
	include_footer?: boolean | null;
	include_web_version_bar?: boolean | null;
	header_partial_id?: EmailPartial | string | null;
	footer_partial_id?: EmailPartial | string | null;
	/** @description Organization this template belongs to */
	organization?: Organization | string | null;
	/** @description Marks this template as a starter/preset available to all organizations. */
	is_starter?: boolean | null;
	/** @description Background color behind the email body (mj-body). Defaults to white. */
	body_background_color?: string | null;
	/** @description Per-template design tokens used by the block builder. Shape: { body_background, font_family, font_size, text_color }. Null fields fall back to defaults at MJML compile time. */
	design_settings?: Record<string, any> | null;
	blocks?: TemplateBlock[] | string[];
}

export interface EventType {
	/** @primaryKey */
	id: number;
	/** @required */
	status: 'published' | 'draft' | 'archived';
	sort?: number | null;
	/** @required */
	organization: Organization | string;
	/** @description Host who owns the event type. Slug uniqueness is per-host. @required */
	host_user: DirectusUser | string;
	/** @description e.g. "Intro Call" @required */
	title: string;
	/** @description URL-safe slug. Unique per host_user. @required */
	slug: string;
	/** @description Shown on the booking page. */
	description?: string | null;
	/** @required */
	duration: 15 | 30 | 45 | 60 | 90 | 120;
	/** @description Hex color or design-token; defaults to --accent. */
	color?: string | null;
	/** @description Array of { name, label, type, required, options? } describing the intake form. Empty = skip intake step. */
	intake_schema?: Record<string, any> | null;
	/** @description Null = free. Stage 5 wires Stripe Connect. */
	price_cents?: number | null;
	/** @description Exactly one per host_user. Bare /book/<org>/<user> renders this one. */
	is_default?: boolean;
	enabled?: boolean;
	date_created?: string | null;
	date_updated?: string | null;
	user_created?: string | null;
	user_updated?: string | null;
}

export interface Expense {
	/** @primaryKey */
	id: string;
	status?: 'draft' | 'submitted' | 'approved' | 'paid' | 'rejected' | null;
	/** @description Expense description @required */
	name: string;
	category?: 'software' | 'hardware' | 'travel' | 'marketing' | 'office' | 'contractor' | 'hosting' | 'insurance' | 'legal' | 'other' | null;
	/** @description Expense amount in USD @required */
	amount: number;
	/** @required */
	date: string;
	description?: string | null;
	is_billable?: boolean | null;
	is_reimbursable?: boolean | null;
	/** @description Vendor or payee name */
	vendor?: string | null;
	payment_method?: 'cash' | 'credit_card' | 'bank_transfer' | 'check' | 'other' | null;
	sort?: number | null;
	user_created?: string | null;
	date_created?: string | null;
	user_updated?: string | null;
	date_updated?: string | null;
	/** @required */
	organization: Organization | string;
	project?: Project | string | null;
	/** @description Receipt or supporting document */
	receipt?: DirectusFile | string | null;
}

export interface GbpPost {
	/** @primaryKey */
	id: string;
	/** @description Has this been posted to GBP? */
	post_status?: 'draft' | 'posted' | 'skipped';
	/** @description Blog post title for reference */
	title?: string | null;
	/** @description GBP post body — copy this to Google Business Profile (1500 char max) */
	caption?: string | null;
	/** @description Direct URL to featured image — open in browser to download for GBP */
	image_url?: string | null;
	/** @description Full URL to the magazine article */
	link?: string | null;
	/** @description Original blog post this was generated from */
	source_post?: string | null;
	/** @description Optional edits or notes before posting */
	notes?: string | null;
	date_created?: string | null;
	user_created?: string | null;
	/** @description Original blog post this was generated from */
	source_blog_post?: Blog | string | null;
}

export interface Goal {
	/** @primaryKey */
	id: string;
	status?: 'active' | 'draft' | 'completed' | 'paused' | 'archived';
	sort?: number | null;
	user_created?: string | null;
	date_created?: string | null;
	user_updated?: string | null;
	date_updated?: string | null;
	/** @required */
	title: string;
	description?: string | null;
	type?: 'financial' | 'networking' | 'performance' | 'marketing' | 'custom';
	target_value?: number | null;
	target_unit?: string | null;
	current_value?: number | null;
	start_date?: string | null;
	end_date?: string | null;
	timeframe?: 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'custom' | null;
	priority?: 'low' | 'medium' | 'high' | null;
	assigned_to?: string | null;
	team?: string | null;
	client?: string | null;
	tags?: string[] | null;
	metadata?: Record<string, any> | null;
	organization?: string | null;
	/** @description Who the goal is for. user = personal; team/client/organization = shared. @required */
	scope: 'user' | 'team' | 'client' | 'organization';
	/** @description High-level theme. Replaces the older `type` field. @required */
	category: 'revenue' | 'growth' | 'retention' | 'learning' | 'wellbeing' | 'delivery' | 'custom';
	snapshots?: GoalSnapshot[] | string[];
}

export interface GoalSnapshot {
	/** @primaryKey */
	id: string;
	goal?: Goal | string;
	/** @required */
	value: number;
	notes?: string | null;
	user_created?: string | null;
	date_created?: string | null;
}

export interface HeldEmail {
	/** @primaryKey */
	id: string;
	date_created?: string | null;
	date_updated?: string | null;
	/** @description Owning org (null if the source invoice could not be resolved). */
	organization?: Organization | string | null;
	/** @description Which money email this draft is. */
	channel?: 'invoice_notice' | 'payment_notification';
	/** @description Primary recipient (TO). */
	to_email?: string | null;
	/** @description Email subject line. */
	subject?: string | null;
	/** @description Money amount for display (dollars). */
	amount?: number | null;
	/** @description Why it was held (money-gate reason). */
	reason?: string | null;
	/** @description held → sent/discarded. */
	status?: 'held' | 'sent' | 'discarded';
	/** @description When a human flushed the draft. */
	sent_at?: string | null;
	/** @description The user who sent the draft. */
	sent_by?: DirectusUser | string | null;
	/** @description Full SendGrid message object — re-sent byte-for-byte on flush. */
	payload?: Record<string, any> | null;
	/** @description Source doc collection (invoices). */
	source_collection?: string | null;
	/** @description Source doc PK (invoice id). */
	source_id?: string | null;
}

export interface Hero {
	/** @primaryKey */
	id: number;
	status?: 'published' | 'draft' | 'archived';
	sort?: number | null;
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	user_updated?: DirectusUser | string | null;
	date_updated?: string | null;
	title?: string | null;
	caption?: string | null;
	background_image?: DirectusFile | string | null;
	foreground_image?: DirectusFile | string | null;
	background_color?: string | null;
	background_position?: 'Center' | 'Left' | 'Right' | null;
	background_size?: 'Fill' | 'Contain' | null;
	foreground_position?: 'Center' | 'Left' | 'Right' | null;
	foreground_size?: 'Fill' | 'Contain' | null;
	/** @description This is for internal identification. */
	internal_description?: string | null;
}

export interface Home {
	/** @primaryKey */
	id: number;
	portfolio?: HomeFile[] | string[];
	hero_slides?: HomeSlide[] | string[];
}

export interface HomeFile {
	/** @primaryKey */
	id: number;
	home_id?: Home | string | null;
	directus_files_id?: DirectusFile | string | null;
	sort?: number | null;
}

export interface HomeSlide {
	/** @primaryKey */
	id: number;
	home_id?: Home | string | null;
	slides_id?: Slide | string | null;
}

export interface Industry {
	/** @primaryKey */
	id: string;
	status?: 'published' | 'draft' | 'archived';
	sort?: number | null;
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	user_updated?: DirectusUser | string | null;
	date_updated?: string | null;
	name?: string | null;
	class?: string | null;
	color?: string | null;
	url?: string | null;
	/** @description Short tagline for the industry hero section (e.g. 'Mission-driven brands for the organizations shaping communities.') */
	headline?: string | null;
	/** @description Fuller description of how Hue serves this industry. Appears below the headline on the industry detail page. */
	description?: string | null;
	portfolio?: PortfolioIndustry[] | string[];
	content_blocks?: IndustriesContentBlock[] | string[];
	case_studies?: CaseStudiesIndustry[] | string[];
}

export interface IndustriesContentBlock {
	/** @primaryKey */
	id: number;
	industries_id?: Industry | string | null;
	item?: BlockHero | BlockText | BlockCard | BlockProcess | BlockCta | BlockStickyText | BlockClientSuccess | BlockPortfolioShowcase | BlockCapabilitiesShowcase | string | null;
	collection?: string | null;
	sort?: number | null;
}

export interface Invoice {
	/** @primaryKey */
	id: string;
	status?: 'pending' | 'processing' | 'paid' | 'archived';
	sort?: number | null;
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	user_updated?: DirectusUser | string | null;
	date_updated?: string | null;
	bill_to?: Organization | string | null;
	/** @required */
	due_date: string;
	invoice_code?: string | null;
	/** @required */
	invoice_date: string;
	note?: string | null;
	memo?: string | null;
	/** @description This is automatically calculated once you create and save line items. */
	total_amount?: number | null;
	emails?: string[] | null;
	melio?: string | null;
	/** @description The client this invoice is for @required */
	client: Client | string;
	/** @description Snapshot: billing email at time of invoicing */
	billing_email?: string | null;
	/** @description Snapshot: billing contact name at time of invoicing */
	billing_name?: string | null;
	/** @description Snapshot: billing address at time of invoicing */
	billing_address?: string | null;
	/** @description Photo of check received */
	check_image?: DirectusFile | string | null;
	/** @description Date the client mailed the check */
	date_mailed?: string | null;
	/** @required */
	line_items: LineItem[] | string[];
	payments?: PaymentsReceived[] | string[];
	/** @description Projects associated with this invoice */
	projects?: InvoicesProject[] | string[];
	project_events?: ProjectEventsInvoice[] | string[];
}

export interface InvoicesProduct {
	/** @primaryKey */
	id: number;
	invoices_id?: Invoice | string | null;
	products_id?: Product | string | null;
}

export interface InvoicesProject {
	/** @primaryKey */
	id: number;
	invoices_id?: Invoice | string | null;
	projects_id?: Project | string | null;
}

export interface JunctionDirectusUsersTeam {
	/** @primaryKey */
	id: number;
	directus_users_id?: DirectusUser | string | null;
	teams_id?: Team | string | null;
	sort?: number | null;
	is_manager?: boolean | null;
}

export interface LeadActivity {
	/** @primaryKey */
	id: number;
	status?: 'published' | 'draft' | 'archived';
	sort?: number | null;
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	user_updated?: DirectusUser | string | null;
	date_updated?: string | null;
	activity_type?: `business card scan` | `phone call` | `email sent` | `email received` | 'meeting' | `proposal sent` | `follow up` | 'note' | null;
	activity_date?: string | null;
	subject?: string | null;
	description?: string | null;
	outcome?: 'positive' | 'neutral' | 'negative' | `no response` | null;
	duration_minutes?: number | null;
	next_action?: string | null;
	next_action_date?: string | null;
	lead?: Lead | string | null;
	contact?: Contact | string | null;
	attachments?: LeadActivitiesFile[] | string[];
}

export interface LeadActivitiesFile {
	/** @primaryKey */
	id: number;
	lead_activities_id?: LeadActivity | string | null;
	directus_files_id?: DirectusFile | string | null;
}

export interface Lead {
	/** @primaryKey */
	id: number;
	status?: 'published' | 'draft' | 'archived';
	sort?: number | null;
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	user_updated?: DirectusUser | string | null;
	date_updated?: string | null;
	priority?: 'low' | 'medium' | 'high' | 'urgent' | null;
	lead_score?: number | null;
	source?: `business card` | 'call' | 'website' | 'referral' | 'event' | null;
	estimated_value?: number | null;
	related_contact?: Contact | string | null;
	source_details?: string | null;
	next_follow_up?: string | null;
	project_type?: string | null;
	timeline?: 'urgent' | `1-3 months` | `3-6 months` | 'flexible' | null;
	notes?: string | null;
	converted_to_customer?: boolean | null;
	actual_value?: number | null;
	lost_reason?: string | null;
	closed_date?: string | null;
	/** @description Team member assigned to this lead */
	assigned_to?: DirectusUser | string | null;
	/** @description Pipeline stage */
	stage?: 'new' | 'contacted' | 'qualified' | 'proposal_sent' | 'negotiating' | 'won' | 'lost' | null;
	/** @description Associated organization */
	organization?: Organization | string | null;
	/** @description Custom tags for flexible categorization across the pipeline (e.g., hot, referral, rfp) */
	tags?: string[] | null;
	/** @description Disposition flag for spam / unqualified leads. Orthogonal to status lifecycle. */
	is_junk?: boolean;
	/** @description Client this lead converted into (set on conversion). Used for partner-ROI attribution. */
	resulting_client?: Client | string | null;
}

export interface LeadStageListRule {
	/** @primaryKey */
	id: number;
	status?: 'published' | 'draft' | 'archived';
	sort?: number | null;
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	/** @description Organization that owns this rule @required */
	organization: Organization | string;
	/** @description Turn off to pause this rule without deleting it */
	enabled?: boolean | null;
	/** @description Stage the lead is moving FROM. Leave empty to match any previous stage. */
	from_stage?: 'new' | 'contacted' | 'qualified' | 'proposal_sent' | 'negotiating' | 'won' | 'lost' | null;
	/** @description Stage the lead is moving TO @required */
	to_stage: 'new' | 'contacted' | 'qualified' | 'proposal_sent' | 'negotiating' | 'won' | 'lost';
	/** @description Mailing list to add the lead's contact to. Auto-creates a contact if the lead has none. */
	add_to_list?: MailingList | string | null;
	/** @description Mailing list to unsubscribe the lead's contact from */
	remove_from_list?: MailingList | string | null;
	/** @description Optional human-friendly name, e.g. 'Lost → add to nurture drip' */
	description?: string | null;
}

export interface LineItem {
	/** @primaryKey */
	id: string;
	status?: 'published' | 'draft' | 'archived';
	sort?: number | null;
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	user_updated?: DirectusUser | string | null;
	date_updated?: string | null;
	invoice_id?: Invoice | string | null;
	description?: string | null;
	/** @required */
	product: Product | string;
	quantity?: number | null;
	/** @required */
	rate: number;
	amount?: number | null;
}

export interface MailingListContact {
	/** @primaryKey */
	id: number;
	/** @required */
	list_id: MailingList | string;
	/** @required */
	contact_id: Contact | string;
	subscribed?: boolean | null;
	date_subscribed?: string | null;
	date_unsubscribed?: string | null;
	source?: string | null;
	custom_fields?: string | null;
}

export interface MailingList {
	/** @primaryKey */
	id: number;
	status?: 'published' | 'draft' | 'archived';
	sort?: number | null;
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	user_updated?: DirectusUser | string | null;
	date_updated?: string | null;
	name?: string | null;
	/** @required */
	slug: string;
	description?: string | null;
	is_default?: boolean | null;
	double_opt_in?: boolean | null;
	subscriber_count?: number | null;
	/** @description Organization this list belongs to */
	organization?: Organization | string | null;
	contacts?: MailingListContact[] | string[];
}

export interface MarketingCampaign {
	/** @primaryKey */
	id: number;
	/** @description Campaign or analysis title @required */
	title: string;
	/** @description User-stated campaign goal */
	goal?: string | null;
	status?: 'draft' | 'scheduled' | 'partial_sent' | 'completed' | 'cancelled' | 'active' | 'paused' | 'archived' | null;
	type?: 'campaign' | 'dashboard' | 'feed_recommendation' | null;
	/** @description Full AI-generated plan (CampaignAnalysis or DashboardAnalysis) */
	plan_data?: Record<string, any> | null;
	organization?: Organization | string | null;
	start_date?: string | null;
	end_date?: string | null;
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	date_updated?: string | null;
	/** @description Null for legacy dashboard/campaign rows; set for feed-driven campaigns. */
	card_type?: 'dormant_clients' | 'project_complete' | 'lead_reengagement' | 'new_client_welcome' | 'service_promo' | 'campaign_clone' | 'partner_anniversary' | 'event_teaser' | null;
	/** @description e.g. request_testimonial | repurpose_to_campaign — for phased card types. */
	phase?: string | null;
	/** @description Full VoiceFingerprint at generation time — supports the visible "Drafted from your context" panel. */
	voice_fingerprint_snapshot?: Record<string, any> | null;
	/** @description Fact IDs referenced in any touch — drives the visible context panel. */
	facts_used?: string[] | null;
	/** @description { ranker, generator, voice } — for eval reproducibility. */
	prompt_versions?: Record<string, any> | null;
	/** @description Audience at generation time — survives subsequent CRM drift. */
	audience_snapshot?: Record<string, any> | null;
	/** @description Total across this campaign (generation + regenerate). */
	tokens_spent?: number | null;
	/** @description cluster_strategy / phase_strategy text from the generator. */
	generator_strategy?: string | null;
	/** @description Why this timing/channel mix — from the generator. */
	cadence_rationale?: string | null;
	/** @description FK to the marketing_recommendations card that produced this campaign. */
	recommendation?: MarketingRecommendation | string | null;
}

export interface MarketingRecommendation {
	/** @primaryKey */
	id: number;
	/** @required */
	organization: Organization | string;
	/** @description Which of the 8 recommendation card types this is. @required */
	card_type: 'dormant_clients' | 'project_complete' | 'lead_reengagement' | 'new_client_welcome' | 'service_promo' | 'campaign_clone' | 'partner_anniversary' | 'event_teaser';
	/** @description pending → generating → drafted → approved | skipped | expired @required */
	status: 'pending' | 'generating' | 'drafted' | 'approved' | 'skipped' | 'expired';
	/** @description From ranker — 0-100. Higher = more time-sensitive. */
	urgency?: number | null;
	/** @description Full RecommendationCandidate from the signal extractor. */
	candidate_data?: Record<string, any> | null;
	/** @description { why_now, urgency, audience_overlap_with } from the ranker. */
	ranker_output?: Record<string, any> | null;
	/** @description Identifier for the ranker batch this came from. Eval-traceable. */
	ranker_run_id?: string | null;
	/** @description e.g. "v3" — for eval reproducibility. */
	ranker_prompt_version?: string | null;
	/** @description Optional user note when skipped. */
	skipped_reason?: string | null;
	/** @description When this card first appeared in the feed. */
	surfaced_at?: string | null;
	/** @description After this, a daily cron flips status to expired. */
	expires_at?: string | null;
	date_created?: string | null;
	date_updated?: string | null;
	user_created?: string | null;
	user_updated?: string | null;
	/** @description Set when the user approves and a campaign is created. */
	resulting_campaign?: MarketingCampaign | string | null;
}

export interface MarketingTouche {
	/** @primaryKey */
	id: number;
	/** @required */
	campaign: MarketingCampaign | string;
	/** @description Denormalized from campaign for fast org-scoped queries. @required */
	organization: Organization | string;
	/** @description Order within campaign (0, 1, 2…). */
	sequence_index?: number | null;
	/** @required */
	kind: 'email' | 'social';
	/** @required */
	audience_target: 'project_contact' | 'lookalike_audience' | 'public';
	/** @description all | opened_previous | unopened_previous | cluster:<label> */
	audience_filter?: string | null;
	/** @description Hours from campaign start. */
	send_offset_hours?: number | null;
	/** @description Computed at schedule time from campaign start + offset. */
	scheduled_for?: string | null;
	sent_at?: string | null;
	/** @required */
	status: 'pending' | 'scheduled' | 'sent' | 'cancelled' | 'failed';
	/** @description Null when kind=social. */
	email_subject?: string | null;
	/** @description Inbox preview line. */
	email_preview_text?: string | null;
	/** @description 80-150 words target. */
	email_body_markdown?: string | null;
	email_cta?: 'book_call' | 'reply' | 'view_portfolio' | 'view_case_study' | 'reply_with_question' | null;
	/** @description Null when kind=email. */
	social_channel?: 'linkedin' | 'instagram' | 'twitter' | null;
	social_caption?: string | null;
	/** @description AI-generated description of the desired image. */
	social_image_brief?: string | null;
	/** @description Populated after user uploads/generates an image. */
	social_image_url?: string | null;
	/** @description FK to social_posts created at schedule time. */
	source_social_post?: SocialPost | string | null;
	/** @description FK to email send record (no relation yet — wired when email-send infra is centralized). */
	source_email_send?: string | null;
	/** @required */
	personalization_state: 'none' | 'requested' | 'in_progress' | 'completed';
	opens_count?: number | null;
	clicks_count?: number | null;
	replies_count?: number | null;
	/** @description Generation + any regenerate spend. */
	tokens_spent?: number | null;
	/** @description Prior subjects/bodies kept for one-click undo. */
	regenerate_history?: Record<string, any> | null;
	/** @description Short note from cluster_strategy / phase_strategy at gen time. */
	generator_strategy_excerpt?: string | null;
	date_created?: string | null;
	date_updated?: string | null;
	user_created?: string | null;
	user_updated?: string | null;
	/** @description Mailing list this touch targets. When set, the send path resolves recipients from mailing_list_contacts (bypasses campaign.audience_snapshot). XOR with audience_filter at the app layer. */
	mailing_list?: MailingList | string | null;
	/** @description Per-target subject + body variants. Keyed by `list:<id>` or `segment:<filter>`. Null when the touch has no forks. See [[project_composition_canvas_redesign]] Item A.2. */
	body_variants?: Record<string, any> | null;
	/** @description Email body as HTML (Tiptap output). New writes from the canvas land here; the legacy email_body_markdown column is kept one release as a fallback read source. See [[project_composition_canvas_redesign]] Item C / P4.3. */
	email_body_html?: string | null;
	/** @description Recipient buckets this touch targets. Reverse of marketing_touch_targets.touch. */
	targets?: MarketingTouchTarget[] | string[];
}

export interface MarketingTouchTarget {
	/** @primaryKey */
	id: number;
	/** @required */
	touch: MarketingTouche | string;
	/** @description Denormalized from touch.organization for fast org-scoped reads. @required */
	organization: Organization | string;
	/** @required */
	target_kind: 'mailing_list' | 'audience_segment';
	/** @description Set when target_kind=mailing_list. XOR with audience_filter. */
	mailing_list?: MailingList | string | null;
	/** @description Set when target_kind=audience_segment. One of: all | opened_previous | unopened_previous | cluster:<label>. */
	audience_filter?: string | null;
	/** @description Display order in the chip row. */
	sort?: number | null;
	date_created?: string | null;
	date_updated?: string | null;
}

export interface MarketingTouchVariant {
	/** @primaryKey */
	id: number;
	/** @required */
	touch: MarketingTouche | string;
	/** @required */
	contact: Contact | string;
	/** @description Denormalized from touch.organization for fast org-scoped queries. @required */
	organization: Organization | string;
	/** @required */
	status: 'pending' | 'processing' | 'completed' | 'failed';
	/** @description Set when worker claims this row. Stale claims (>60s) reclaimable. */
	processing_started_at?: string | null;
	generated_at?: string | null;
	/** @description Already personalized — no {{first_name}} substitution at send time. */
	email_subject?: string | null;
	email_preview_text?: string | null;
	email_body_markdown?: string | null;
	tokens_spent?: number | null;
	prompt_version?: string | null;
	/** @description Set when status=failed. */
	error_message?: string | null;
	/** @description Snapshot of per-contact facts fed into the generator (for debug + audit). */
	context_used?: Record<string, any> | null;
	date_created?: string | null;
	date_updated?: string | null;
}

export interface MeetingChatMessage {
	/** @primaryKey */
	id: number;
	date_created?: string | null;
	/** @required */
	meeting: VideoMeeting | string;
	sender_session_id?: string | null;
	sender_name?: string | null;
	/** @required */
	message: string;
	sent_at?: string | null;
}

export interface MeetingNote {
	/** @primaryKey */
	id: number;
	date_created?: string | null;
	date_updated?: string | null;
	user_created?: string | null;
	user_updated?: string | null;
	/** @description Meeting this note belongs to @required */
	meeting: VideoMeeting | string;
	/** @description Who captured the note (set on create, read-only thereafter) */
	author?: DirectusUser | string | null;
	/** @description Distinguishes general notes from team-binding decisions @required */
	note_type: 'note' | 'decision';
	/** @required */
	content: string;
	/** @description Seconds since meeting actual_start when the note was captured (lets the recap align notes to transcript) */
	meeting_offset_seconds?: number | null;
}

export interface MeetingRequest {
	/** @primaryKey */
	id: string;
	status?: 'published' | 'draft' | 'archived';
	sort?: number | null;
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	user_updated?: DirectusUser | string | null;
	date_updated?: string | null;
	requester_id?: DirectusUser | string | null;
	requested_date?: string | null;
	notes?: string | null;
	linked_appointment?: Appointment | string | null;
	host_user?: DirectusUser | string | null;
	preferred_time?: string | null;
	duration_minutes?: 15 | 30 | 45 | 60 | 90 | 120 | null;
	meeting_type?: 'consultation' | 'discovery' | 'project_review' | 'presentation' | 'general' | null;
	request_status?: 'pending' | 'approved' | 'rejected' | null;
	admin_notes?: string | null;
	/** @description Guest name (for external/website requests) */
	guest_name?: string | null;
	/** @description Guest email (for external/website requests) */
	guest_email?: string | null;
	/** @description Guest phone (optional) */
	guest_phone?: string | null;
	/** @description Guest company (optional) */
	guest_company?: string | null;
	/** @description Where this request originated */
	source?: 'website' | 'internal' | 'phone' | 'referral' | null;
}

export interface MeetingSnapshot {
	/** @primaryKey */
	id: number;
	date_created?: string | null;
	/** @required */
	meeting: VideoMeeting | string;
	author?: DirectusUser | string | null;
	image?: DirectusFile | string | null;
	caption?: string | null;
	/** @description Seconds into the meeting when the snapshot was taken. */
	meeting_offset_seconds?: number | null;
}

export interface Menu {
	/** @primaryKey */
	id: string;
	status?: 'published' | 'draft' | 'archived';
	sort?: number | null;
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	user_updated?: DirectusUser | string | null;
	date_updated?: string | null;
	restaurant_id?: Restaurant | string | null;
	category?: 'lunch' | 'dinner' | null;
	price?: string | null;
	courses?: Course[] | string[];
}

export interface Message {
	/** @primaryKey */
	id: string;
	status?: 'published' | 'draft' | 'archived';
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	user_updated?: DirectusUser | string | null;
	date_updated?: string | null;
	text?: string | null;
	channel?: Channel | string | null;
	parent_id?: string | null;
}

export interface NewsletterBlock {
	/** @primaryKey */
	id: number;
	status?: 'published' | 'draft' | 'archived';
	sort?: number | null;
	name?: string | null;
	/** @required */
	slug: string;
	description?: string | null;
	mjml_source?: string | null;
	thumbnail?: DirectusFile | string | null;
	is_system?: boolean | null;
	category?: 'header' | 'hero' | 'content' | `two-column` | `three-column` | 'cta' | 'image' | 'stats' | 'quote' | 'list' | 'divider' | 'social' | 'footer' | null;
	date_created?: string | null;
	date_updated?: string | null;
	user_created?: DirectusUser | string | null;
	user_updated?: DirectusUser | string | null;
	variables_schema?: string | null;
}

export interface Option {
	/** @primaryKey */
	id: string;
	status?: 'published' | 'draft' | 'archived';
	sort?: number | null;
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	user_updated?: DirectusUser | string | null;
	date_updated?: string | null;
	title?: string | null;
	description?: string | null;
	course_id?: Course | string | null;
}

export interface Organization {
	/** @primaryKey */
	id: string;
	status?: 'published' | 'draft' | 'archived' | null;
	sort?: number | null;
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	user_updated?: DirectusUser | string | null;
	date_updated?: string | null;
	name?: string | null;
	website?: string | null;
	logo?: DirectusFile | string | null;
	brand_color?: string | null;
	folder?: DirectusFolder | string | null;
	category?: 'Client' | 'Vendor' | `Sub-Brand` | null;
	tags?: string[] | null;
	notes?: string | null;
	stripe_customer_id?: string | null;
	phone?: string | null;
	/** @description Three letter code for organization identity. */
	code?: string | null;
	address?: string | null;
	/** @required */
	industry: Industry | string;
	/** @description These emails will be notified for this organization. */
	emails?: string[] | null;
	origin_date?: string | null;
	icon?: DirectusFile | string | null;
	description?: string | null;
	parent_organization?: Organization | string | null;
	email?: string | null;
	short_name?: string | null;
	active?: boolean | null;
	/** @description Subscription plan tier */
	plan?: 'free' | 'solo' | 'studio' | 'agency' | 'enterprise' | null;
	/** @description Voice, visual style, and brand positioning */
	brand_direction?: string | null;
	/** @description Business objectives and growth targets */
	goals?: string | null;
	/** @description Primary target audience or market segment */
	target_audience?: string | null;
	/** @description Primary market or geographic location */
	location?: string | null;
	/** @description Remaining AI token balance (null = unlimited) */
	ai_token_balance?: number | null;
	/** @description Monthly AI token allotment (null = unlimited) */
	ai_token_limit_monthly?: number | null;
	/** @description Tokens consumed in current billing period */
	ai_tokens_used_this_period?: number | null;
	/** @description Start of current AI billing period */
	ai_billing_period_start?: string | null;
	/** @description Remaining scan credits (null = unlimited, -1 sentinel from plan = unlimited) */
	scan_credits_balance?: number | null;
	/** @description Monthly scan credit allotment from plan (null = no plan set) */
	scan_credits_limit_monthly?: number | null;
	/** @description Scans consumed in current billing period */
	scans_used_this_period?: number | null;
	/** @description Twilio sub-account SID — provisioned when Communications add-on is activated */
	twilio_subaccount_sid?: string | null;
	/** @description Twilio sub-account auth token — treat as secret */
	twilio_subaccount_token?: string | null;
	/** @description active | suspended */
	twilio_subaccount_status?: 'active' | 'suspended' | null;
	/** @description Active add-on subscriptions — managed by Stripe webhooks. Keys are addon IDs, values have stripe_subscription_item_id and active_since. */
	active_addons?: Record<string, any> | null;
	/** @description Default hourly rate for time tracking billable entries */
	default_hourly_rate?: number | null;
	/** @description URL-safe stable identifier. Auto-generated from name; unique across the org table. */
	slug?: string;
	/** @description Soft-delete timestamp. When set, the org is archived; restore clears it. A cleanup cron hard-deletes rows aged past the retention window. */
	archived_at?: string | null;
	/** @description Org-level mirror of the active Stripe Subscription id. */
	stripe_subscription_id?: string | null;
	/** @description When true (and plan supports whitelabel), hides "Powered by Earnest." on client-facing documents. */
	whitelabel?: boolean;
	/** @description Applied across invoices, proposals, and contracts sent from this organization. */
	document_theme?: 'classic' | 'editorial' | 'mono';
	/** @description Used by the Mono theme as the brand accent. Defaults to a neutral gray. */
	document_accent?: string | null;
	/** @description Stripe Express connected-account id (acct_…). Each org has their own; invoice payments route through this account. */
	stripe_account_id?: string | null;
	/** @description Snapshot of the connected account state. Updated by the Connect webhook on `account.updated`. */
	stripe_account_status?: 'none' | 'pending' | 'active' | 'restricted';
	/** @description ISO-2 country code used at account creation. Express onboarding is currently US-only. */
	stripe_account_country?: string;
	/** @description Org default for new meetings. Null = inherit plan default (free=off, studio+=on). */
	default_recording?: boolean | null;
	/** @description Org default for new meetings. Null = inherit plan default (free=off, solo+=on). */
	default_transcription?: boolean | null;
	/** @description Address recipients hit when they reply to an org-branded transactional email (notifications, meeting/video invites). Empty falls back to the global Earnest reply-to. */
	email_reply_to?: string | null;
	/** @description Physical mailing address rendered in the marketing-email footer (CAN-SPAM requirement). Transactional emails never show it. Free-form text — line breaks preserved. */
	mailing_address?: string | null;
	/** @description Optional monitoring BCC. When set, every email sent for this org is also BCC'd here. Leave blank to use only the global BCC. */
	email_bcc?: string | null;
	/** @description Brand accent palette applied to every member of this org + the client portal. Drives --info/--tag/--app accent tokens. */
	app_palette?: 'neutral' | 'seaMist' | 'aurora' | null;
	/** @description When off, the Goals section is hidden across the org (Account → Goals nav + related-goals cards). Defaults on. */
	goals_enabled?: boolean | null;
	/** @description Earnest-admin grant. When on: wholesale token/credit pricing + zero platform fee on this org’s invoice payments. Fulfillment unchanged. */
	wholesale_pricing?: boolean;
	users?: OrganizationsDirectusUser[] | string[];
	projects?: Project[] | string[];
	tickets?: Ticket[] | string[];
	teams?: Team[] | string[];
	/** @description Active membership rows. Used by the row-permission rule in setup-org-row-permissions.ts. */
	memberships?: OrgMembership[] | string[];
	/** @description Active portal-user rows. Mirror of memberships alias. Used by Client policy row filter. */
	client_portal_users?: ClientPortalUser[] | string[];
}

export interface OrganizationsDirectusUser {
	/** @primaryKey */
	id: number;
	organizations_id?: Organization | string | null;
	directus_users_id?: DirectusUser | string | null;
	sort?: number | null;
}

export interface OrgMembership {
	/** @primaryKey */
	id: string;
	status?: 'active' | 'pending' | 'suspended';
	invited_at?: string | null;
	accepted_at?: string | null;
	date_created?: string | null;
	date_updated?: string | null;
	/** @required */
	organization: Organization | string;
	/** @required */
	user: DirectusUser | string;
	/** @required */
	role: OrgRole | string;
	/** @description Only set for client-role users — scopes their access */
	client?: Client | string | null;
	invited_by?: DirectusUser | string | null;
}

export interface OrgRole {
	/** @primaryKey */
	id: string;
	sort?: number | null;
	date_created?: string | null;
	date_updated?: string | null;
	/** @required */
	name: string;
	/** @description owner, admin, manager, member, client @required */
	slug: string;
	/** @description System roles cannot be deleted */
	is_system?: boolean | null;
	/** @description Feature CRUD permission matrix */
	permissions?: Record<string, any> | null;
	/** @required */
	organization: Organization | string;
}

export interface PageAgency {
	/** @primaryKey */
	id: number;
	status?: 'published' | 'draft' | 'archived';
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	user_updated?: DirectusUser | string | null;
	date_updated?: string | null;
	title?: string | null;
	description?: string | null;
	seo?: ExtensionSeoMetadata | null;
	slug?: string | null;
	content_blocks?: PageAgencyContentBlock[] | string[];
}

export interface PageAgencyContentBlock {
	/** @primaryKey */
	id: number;
	page_agency_id?: PageAgency | string | null;
	item?: BlockHero | BlockText | BlockCard | BlockProcess | BlockCta | BlockCapabilitiesShowcase | BlockPortfolioShowcase | BlockClientSuccess | BlockMasonry | BlockStickyText | BlockReveal | BlockItemSlideshow | BlockItemsSlideshow | BlockCallout | BlockMasonryPortfolio | BlockParallaxGrid | string | null;
	collection?: string | null;
	sort?: number | null;
}

export interface PageHome {
	/** @primaryKey */
	id: number;
	status?: 'published' | 'draft' | 'archived';
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	user_updated?: DirectusUser | string | null;
	date_updated?: string | null;
	title?: string | null;
	description?: string | null;
	slug?: string | null;
	seo?: ExtensionSeoMetadata | null;
	content_blocks?: PageHomeContentBlock[] | string[];
}

export interface PageHomeContentBlock {
	/** @primaryKey */
	id: number;
	page_home_id?: PageHome | string | null;
	item?: BlockItemsSlideshow | BlockItemSlideshow | BlockReveal | BlockStickyText | BlockMasonry | BlockClientSuccess | BlockPortfolioShowcase | BlockCapabilitiesShowcase | BlockCta | BlockProcess | BlockCard | BlockText | BlockHero | BlockCallout | string | null;
	collection?: string | null;
	sort?: number | null;
}

export interface PageIndustries {
	/** @primaryKey */
	id: number;
	status?: 'published' | 'draft' | 'archived';
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	user_updated?: DirectusUser | string | null;
	date_updated?: string | null;
	title?: string | null;
	description?: string | null;
	seo?: ExtensionSeoMetadata | null;
	slug?: string | null;
	content_blocks?: PageIndustriesContentBlock[] | string[];
}

export interface PageIndustriesContentBlock {
	/** @primaryKey */
	id: number;
	page_industries_id?: PageIndustry | string | null;
	item?: BlockHero | BlockText | BlockCard | BlockProcess | BlockCta | BlockCapabilitiesShowcase | BlockPortfolioShowcase | BlockClientSuccess | BlockMasonry | BlockStickyText | BlockReveal | BlockItemSlideshow | BlockItemsSlideshow | string | null;
	collection?: string | null;
	sort?: number | null;
}

export interface PagePortfolio {
	/** @primaryKey */
	id: number;
	status?: 'published' | 'draft' | 'archived';
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	user_updated?: DirectusUser | string | null;
	date_updated?: string | null;
	title?: string | null;
	description?: string | null;
	slug?: string | null;
	seo?: ExtensionSeoMetadata | null;
	content_blocks?: PagePortfolioContentBlock[] | string[];
}

export interface PagePortfolioContentBlock {
	/** @primaryKey */
	id: number;
	page_portfolio_id?: PagePortfolio | string | null;
	item?: BlockHero | BlockText | BlockCard | BlockProcess | BlockCta | BlockCapabilitiesShowcase | BlockPortfolioShowcase | BlockClientSuccess | BlockMasonry | BlockStickyText | BlockReveal | BlockItemSlideshow | BlockItemsSlideshow | string | null;
	collection?: string | null;
	sort?: number | null;
}

export interface PagesContentBlock {
	/** @primaryKey */
	id: number;
	item?: BlockHero | BlockText | BlockCard | BlockProcess | BlockCta | BlockCapabilitiesShowcase | BlockPortfolioShowcase | BlockClientSuccess | BlockMasonry | BlockStickyText | BlockReveal | BlockItemSlideshow | BlockItemsSlideshow | string | null;
	collection?: string | null;
}

export interface PageServices {
	/** @primaryKey */
	id: number;
	status?: 'published' | 'draft' | 'archived';
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	user_updated?: DirectusUser | string | null;
	date_updated?: string | null;
	title?: string | null;
	description?: string | null;
	seo?: ExtensionSeoMetadata | null;
	slug?: string | null;
	content_blocks?: PageServicesContentBlock[] | string[];
}

export interface PageServicesContentBlock {
	/** @primaryKey */
	id: number;
	page_services_id?: PageService | string | null;
	item?: BlockHero | BlockText | BlockCard | BlockProcess | BlockCta | BlockCapabilitiesShowcase | BlockPortfolioShowcase | BlockClientSuccess | BlockMasonry | BlockStickyText | BlockReveal | BlockItemSlideshow | BlockItemsSlideshow | BlockCallout | string | null;
	collection?: string | null;
	sort?: number | null;
}

export interface PartnerLogo {
	/** @primaryKey */
	id: string;
	sort?: number | null;
	/** @description Company name @required */
	name: string;
	/** @description Logo image (SVG or PNG preferred) @required */
	logo: DirectusFile | string;
	/** @description Company website URL */
	url?: string | null;
	active?: boolean | null;
	date_created?: string | null;
}

export interface PasswordResetToken {
	/** @primaryKey */
	id: string;
	date_created?: string | null;
	/** @description User this reset token belongs to. */
	user?: DirectusUser | string;
	/** @description 64-char hex (crypto.randomBytes(32).toString("hex")). Indexed. */
	token?: string;
	/** @description Token becomes invalid after this time. Set to 1h after creation by convention. */
	expires_at?: string;
	/** @description Set when the token is redeemed. Single-use — non-null means burnt. */
	used_at?: string | null;
	/** @description IP that requested the reset (best-effort, from req headers). */
	requested_ip?: string | null;
}

export interface PaymentsReceived {
	/** @primaryKey */
	id: string;
	status?: 'paid' | 'pending';
	sort?: number | null;
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	user_updated?: DirectusUser | string | null;
	date_updated?: string | null;
	invoice_id?: Invoice | string | null;
	amount?: string | null;
	payment_intent?: string | null;
	user_id?: DirectusUser | string | null;
	receipt_url?: string | null;
	stripe_status?: string | null;
	charge_id?: string | null;
	date_received?: string | null;
	organization?: Organization | string | null;
	payment_method?: string | null;
	/** @description Check #, Zelle confirmation, Venmo handle, etc. */
	reference?: string | null;
	/** @description Optional free-text note about this payment. */
	note?: string | null;
	/** @description Photo of the check or screenshot of the Zelle/Venmo confirmation. */
	check_image?: DirectusFile | string | null;
	/** @description Date the check was deposited (for the "checks awaiting deposit" workflow). */
	deposit_date?: string | null;
}

export interface People {
	/** @primaryKey */
	id: number;
	status?: 'published' | 'draft' | 'archived';
	sort?: number | null;
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	user_updated?: DirectusUser | string | null;
	date_updated?: string | null;
	email?: string | null;
	phone?: string | null;
	image?: DirectusFile | string | null;
	bio?: string | null;
	first_name?: string | null;
	last_name?: string | null;
	title?: string | null;
	url?: string | null;
	/** @description Where this record originated */
	source?: 'earnest' | 'carddesk' | 'import' | 'manual' | null;
	/** @description ID in the original collection (contacts.id or cd_contacts.id) */
	source_id?: string | null;
	/** @description Original collection name (contacts, cd_contacts) */
	source_collection?: string | null;
	prefix?: `Mr.` | `Ms.` | `Mrs.` | `Dr.` | `Prof.` | `Mx.` | null;
	/** @description Full display name (auto-generated from first + last if blank) */
	display_name?: string | null;
	photo?: string | null;
	/** @description Company name (free text) */
	company?: string | null;
	industry?: 'Technology' | 'Finance' | 'Healthcare' | `Real Estate` | 'Legal' | 'Marketing' | 'Education' | 'Hospitality' | `Non-Profit` | 'Government' | `Venture Capital` | 'Other' | null;
	website?: string | null;
	linkedin_url?: string | null;
	instagram_handle?: string | null;
	mailing_address?: string | null;
	timezone?: string | null;
	category?: 'client' | 'prospect' | 'partner' | 'vendor' | 'media' | 'networking' | 'other' | null;
	/** @description Lead temperature (from CardDesk or manual) */
	rating?: 'hot' | 'warm' | 'nurture' | 'cold' | null;
	tags?: string[] | null;
	/** @description Arbitrary key-value metadata */
	custom_fields?: Record<string, any> | null;
	notes?: string | null;
	/** @description Where/when first met (from CardDesk) */
	met_at?: string | null;
	/** @description CardDesk conversion flag */
	is_client?: boolean | null;
	/** @description When converted to client in CardDesk */
	client_at?: string | null;
	/** @description Soft-paused in CardDesk (no deletion) */
	hibernated?: boolean | null;
	email_subscribed?: boolean | null;
	unsubscribe_token?: string | null;
	email_bounced?: boolean | null;
	total_emails_sent?: number | null;
	total_opens?: number | null;
	total_clicks?: number | null;
	client?: Client | string | null;
	user?: DirectusUser | string | null;
	/** @description Flag this person as a Hue team member */
	is_team_member?: boolean | null;
	/** @description One-line tagline for profile page */
	headline?: string | null;
	/** @description Full biography for profile page */
	extended_bio?: string | null;
	/** @description Career highlights */
	resume_highlights?: Array<{ year: string; role: string; company: string; description: string }> | null;
	/** @description Education history */
	education?: Array<{ degree: string; school: string; year: string }> | null;
	/** @description Skills and specialties */
	specialties?: string[] | null;
	organizations?: PeopleOrganization[] | string[];
}

export interface PeopleOrganization {
	/** @primaryKey */
	id: number;
	people_id?: People | string | null;
	organizations_id?: Organization | string | null;
	sort?: number | null;
}

export interface PhoneSetting {
	/** @primaryKey */
	id: string;
	status?: 'published' | 'draft' | 'archived';
	sort?: number | null;
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	user_updated?: DirectusUser | string | null;
	date_updated?: string | null;
	/** @description e.g., 'Main Office', 'Support Hotline', 'Sales Line' @required */
	line_name: string;
	/** @description Unique slug (e.g., 'main', 'support', 'sales') @required */
	line_identifier: string;
	/** @description The Twilio number for this line (e.g., +15551234567) */
	twilio_phone_number?: string | null;
	/** @required */
	company_name: string;
	/** @description Text greeting (if no audio) */
	greeting_text?: string | null;
	/** @description Audio greeting (overrides text if provided) */
	greeting_audio?: DirectusFile | string | null;
	business_hours_enabled?: boolean | null;
	timezone?: `America/New_York` | `America/Chicago` | `America/Denver` | `America/Phoenix` | `America/Los_Angeles` | null;
	/** @description Text message when outside business hours (if no audio) */
	after_hours_message?: string | null;
	/** @description Audio message for after hours (overrides text if provided) */
	after_hours_audio?: DirectusFile | string | null;
	active?: boolean | null;
	/** @description Text-to-speech voice for automated messages */
	voice?: `Polly.Joanna-Neural` | `Polly.Matthew-Neural` | `Polly.Ruth-Neural` | `Polly.Stephen-Neural` | `Polly.Salli-Neural` | `Polly.Joey-Neural` | `Polly.Kendra-Neural` | `Polly.Kimberly-Neural` | `Google.en-US-Wavenet-F` | `Google.en-US-Wavenet-D` | 'alice' | 'man' | 'woman' | null;
	/** @description Owning organization */
	organization?: Organization | string | null;
	business_hours?: BusinessHour[] | string[];
	call_routes?: CallRoute[] | string[];
}

export interface Portfolio {
	/** @primaryKey */
	id: string;
	status?: 'published' | 'draft' | 'archived';
	sort?: number | null;
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	user_updated?: DirectusUser | string | null;
	date_updated?: string | null;
	name?: string | null;
	/** @description Client description. */
	description?: string | null;
	logo?: DirectusFile | string | null;
	synopsis?: string | null;
	challenge?: string | null;
	creation?: string | null;
	service?: Service | string | null;
	caption?: string | null;
	slug?: string | null;
	/** @description Image featured on details page.  If blank, will use first image in images. */
	featured_image?: DirectusFile | string | null;
	parent_id?: Portfolio | string | null;
	hero?: Hero | string | null;
	/** @required */
	url: string;
	/** @description Business outcomes and results — used on case study pages (e.g. market perception, new business won, team impact) */
	results?: string | null;
	/** @description Feature this item as a case study on the homepage and portfolio page */
	featured?: boolean | null;
	/** @description Year the project was completed (e.g. 2024) */
	project_year?: string | null;
	/** @description How long the project took (e.g. 8 weeks, 3 months) */
	project_duration?: string | null;
	client?: Client | string | null;
	images?: PortfolioFile[] | string[];
	videos?: Video[] | string[];
	industries?: PortfolioIndustry[] | string[];
	capabilities?: PortfolioCapability[] | string[];
	projects?: Portfolio[] | string[];
	before_and_afters?: PortfolioBeforeAndAfter[] | string[];
	services?: PortfolioService[] | string[];
}

export interface PortfolioBeforeAndAfter {
	/** @primaryKey */
	id: number;
	portfolio_id?: Portfolio | string | null;
	before_and_afters_id?: BeforeAndAfter | string | null;
	sort?: number | null;
}

export interface PortfolioCapability {
	/** @primaryKey */
	id: number;
	portfolio_id?: Portfolio | string | null;
	capabilities_id?: Capability | string | null;
}

export interface PortfolioFile {
	/** @primaryKey */
	id: number;
	portfolio_id?: Portfolio | string | null;
	directus_files_id?: DirectusFile | string | null;
	sort?: number | null;
}

export interface PortfolioIndustry {
	/** @primaryKey */
	id: number;
	portfolio_id?: Portfolio | string | null;
	industries_id?: Industry | string | null;
	sort?: number | null;
}

export interface PortfolioService {
	/** @primaryKey */
	id: number;
	portfolio_id?: Portfolio | string | null;
	services_id?: Service | string | null;
	sort?: number | null;
}

export interface Product {
	/** @primaryKey */
	id: string;
	status?: 'published' | 'draft' | 'archived';
	sort?: number | null;
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	user_updated?: DirectusUser | string | null;
	date_updated?: string | null;
	name?: string | null;
	type?: 'Service' | 'Product' | null;
	service?: Service | string | null;
	image?: DirectusFile | string | null;
	price?: number | null;
	description?: string | null;
}

export interface ProjectCategory {
	/** @primaryKey */
	id: string;
	status?: 'published' | 'draft' | 'archived';
	sort?: number | null;
	/** @required */
	name: string;
	color?: string | null;
	icon?: string | null;
}

export interface ProjectDigest {
	/** @primaryKey */
	id: number;
	date_created?: string | null;
	date_updated?: string | null;
	user_created?: string | null;
	user_updated?: string | null;
	/** @required */
	project: Project | string;
	/** @description User this digest was generated for (typically the project PM) @required */
	recipient: DirectusUser | string;
	/** @description Date the digest covers (used for daily idempotency) @required */
	digest_date: string;
	/** @description Markdown brief, ~300 words */
	summary?: string | null;
	/** @description When the recipient first viewed the brief */
	read_at?: string | null;
}

export interface ProjectEventCategory {
	/** @primaryKey */
	id: string;
	status?: 'published' | 'draft' | 'archived';
	sort?: number | null;
	/** @required */
	name: string;
	/** @required */
	color: string;
	text_color?: string | null;
	icon?: string | null;
}

export interface ProjectEventFile {
	/** @primaryKey */
	id: number;
	sort?: number | null;
	project_event_id?: ProjectEvent | string | null;
	directus_files_id?: DirectusFile | string | null;
}

export interface ProjectEvent {
	/** @primaryKey */
	id: string;
	status?: 'draft' | 'Scheduled' | 'Active' | 'Completed' | 'archived';
	sort?: number | null;
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	user_updated?: DirectusUser | string | null;
	date_updated?: string | null;
	type?: 'General' | 'Design' | 'Content' | 'Timeline' | 'Financial' | 'Hours' | null;
	approval?: `No Approval Necessary` | `Need Approval` | 'Approved' | null;
	priority?: 'Normal' | 'Urgent' | null;
	hours?: string | null;
	payment_amount?: string | null;
	paid?: boolean | null;
	title?: string | null;
	description?: string | null;
	project?: Project | string | null;
	date?: string | null;
	link?: string | null;
	file?: DirectusFile | string | null;
	amount?: number | null;
	prototype_link?: string | null;
	content?: string | null;
	event_date?: string | null;
	is_milestone?: boolean | null;
	category_id?: ProjectEventCategory | string | null;
	/** @description Number of business days for this phase */
	duration_days?: number | null;
	/** @description Calculated end date of the phase */
	end_date?: string | null;
	/** @description Team member assigned to this event */
	assigned_to?: string | null;
	/** @description Dependency on another event */
	depends_on?: string | null;
	/** @description User who approved this event */
	approved_by?: DirectusUser | string | null;
	/** @description When this event was approved */
	approved_at?: string | null;
	/** @description Unique token for shareable approval links */
	approval_token?: string | null;
	comments?: ProjectEventsComment[] | string[];
	tasks?: Task[] | string[];
	files?: ProjectEventFile[] | string[];
	invoices?: ProjectEventsInvoice[] | string[];
	spawned_projects?: Project[] | string[];
	/** @description Meetings linked to this milestone (kickoff / mid-review / signoff) */
	meetings?: VideoMeeting[] | string[];
}

export interface ProjectEventsComment {
	/** @primaryKey */
	id: number;
	project_events_id?: ProjectEvent | string | null;
	comments_id?: Comment | string | null;
	sort?: number | null;
}

export interface ProjectEventsInvoice {
	/** @primaryKey */
	id: number;
	project_events_id?: ProjectEvent | string | null;
	invoices_id?: Invoice | string | null;
	sort?: number | null;
}

export interface Project {
	/** @primaryKey */
	id: string;
	status?: 'Pending' | 'Scheduled' | `In Progress` | 'completed' | 'Archived';
	sort?: number | null;
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	user_updated?: DirectusUser | string | null;
	date_updated?: string | null;
	service?: Service | string | null;
	title?: string | null;
	description?: string | null;
	url?: string | null;
	tags?: string[] | null;
	organization?: Organization | string | null;
	template?: `web-project` | `branding-project` | null;
	contract_value?: number | null;
	start_date?: string | null;
	due_date?: string | null;
	completion_date?: string | null;
	projected_date?: string | null;
	team?: Team | string | null;
	/** @description Timeline line color */
	color?: string | null;
	/** @description Optional icon identifier */
	icon?: string | null;
	parent_id?: Project | string | null;
	parent_event_id?: ProjectEvent | string | null;
	member_visible?: boolean | null;
	category_id?: ProjectCategory | string | null;
	/** @description The client this project is for */
	client?: Client | string | null;
	/** @description How the project bills. Drives retainer hour tracking. */
	billing_type?: 'fixed_fee' | 'hourly_retainer' | 'time_and_materials' | 'non_billable' | null;
	/** @description Hours allocated per period (e.g. 20 hrs/month) */
	retainer_hours_per_period?: number | null;
	/** @description Reset cadence for the hour pool */
	retainer_period?: 'monthly' | 'quarterly' | null;
	/** @description Hourly rate snapshot used for invoicing retainer overages */
	retainer_hourly_rate?: number | null;
	/** @description When this retainer began (informational — period math uses calendar) */
	retainer_started_at?: string | null;
	/** @description Display monthly hours used to the client in the portal. Per-entry detail is never shown. */
	show_hours_to_client?: boolean;
	/** @description Client satisfaction rating (1–5) submitted from the portal when the work was delivered. Written by /api/portal/csat. */
	csat_rating?: 1 | 2 | 3 | 4 | 5 | null;
	/** @description Optional free-text the client left with their CSAT rating. */
	csat_comment?: string | null;
	/** @description When the client submitted their CSAT rating. Null = not yet rated. */
	csat_submitted_at?: string | null;
	events?: ProjectEvent[] | string[];
	assigned_to?: ProjectsDirectusUser[] | string[];
	tickets?: Ticket[] | string[];
	children?: Project[] | string[];
	files?: ProjectsFile[] | string[];
	/** @description AI-generated daily PM briefs for this project */
	digests?: ProjectDigest[] | string[];
	/** @description Extra contacts pinned to this project (beyond the client roster). */
	contacts?: ProjectsContact[] | string[];
}

export interface ProjectsContact {
	/** @primaryKey */
	id: string;
	sort?: number | null;
	date_created?: string | null;
	/** @description Project this contact is attached to. */
	project?: Project | string;
	/** @description Contact pinned to this project. */
	contact?: Contact | string;
}

export interface ProjectsDirectusUser {
	/** @primaryKey */
	id: number;
	projects_id?: Project | string | null;
	directus_users_id?: DirectusUser | string | null;
	sort?: number | null;
}

export interface ProjectsFile {
	/** @primaryKey */
	id: number;
	projects_id?: Project | string | null;
	directus_files_id?: DirectusFile | string | null;
}

export interface ProjectStatusUpdate {
	/** @primaryKey */
	id: string;
	/** @required */
	project: Project | string;
	/** @required */
	status: 'on_track' | 'at_risk' | 'off_track';
	text?: string | null;
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
}

export interface Prompt {
	/** @primaryKey */
	id: number;
	status?: 'published' | 'draft' | 'archived';
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	user_updated?: DirectusUser | string | null;
	date_updated?: string | null;
	name?: string | null;
	description?: string | null;
	content?: string | null;
}

export interface Proposal {
	/** @primaryKey */
	id: string;
	status?: 'published' | 'draft' | 'archived';
	sort?: number | null;
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	user_updated?: DirectusUser | string | null;
	date_updated?: string | null;
	organization?: Organization | string | null;
	date_sent?: string | null;
	notes?: string | null;
	file?: DirectusFile | string | null;
	/** @description Proposal name/title @required */
	title: string;
	/** @description Originating lead */
	lead?: Lead | string | null;
	/** @description Primary contact */
	contact?: Contact | string | null;
	/** @description Proposal dollar value */
	total_value?: number | null;
	/** @description Proposal expiration date */
	valid_until?: string | null;
	/** @description Current proposal status */
	proposal_status?: 'draft' | 'sent' | 'viewed' | 'accepted' | 'rejected' | 'expired' | null;
	/** @description Ordered array of block entries: { block_id, heading, content, page_break_after } */
	blocks?: Record<string, any> | null;
}

export interface ProposalsFile {
	/** @primaryKey */
	id: number;
	proposals_id?: string | null;
	directus_files_id?: string | null;
}

export interface PushSubscription {
	/** @primaryKey */
	id: number;
	date_created?: string | null;
	date_updated?: string | null;
	/** @description Owner of this push subscription @required */
	user: DirectusUser | string;
	/** @description The origin that owns this subscription (app.earnest.guru / carddesk.earnest.guru) @required */
	origin: string;
	/** @description Push service URL returned by the browser. Must be unique — same endpoint = same subscription. @required */
	endpoint: string;
	/** @description Client public key (base64url) @required */
	p256dh: string;
	/** @description Client auth secret (base64url) @required */
	auth: string;
	/** @description Captured at subscribe time for debugging + "scanned on another device" copy */
	user_agent?: string | null;
	/** @description Last time we successfully delivered a push to this endpoint */
	last_seen_at?: string | null;
}

export interface Reaction {
	/** @primaryKey */
	id: string;
	status?: 'published' | 'draft' | 'archived';
	sort?: number | null;
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	user_updated?: DirectusUser | string | null;
	date_updated?: string | null;
	user?: DirectusUser | string | null;
	reaction?: string | null;
	item?: string | null;
	table?: string | null;
	date_added?: string | null;
}

export interface Request {
	/** @primaryKey */
	id: string;
	status?: 'published' | 'draft' | 'archived';
	sort?: number | null;
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	user_updated?: DirectusUser | string | null;
	date_updated?: string | null;
	project?: `Branding / Strategy` | `Digital / Web` | `Corporate / Data Design` | `Reputation Management` | `Print / Graphic Design` | `Video / Audio` | 'Other' | null;
	explanation?: string | null;
	budget?: string | null;
	first_name?: string | null;
	last_name?: string | null;
	title?: string | null;
	company?: string | null;
	email?: string | null;
	phone?: string | null;
	contact_preference?: string | null;
	next_step?: string | null;
	research?: string | null;
	ip_address?: string | null;
	date_submitted?: string | null;
}

export interface Restaurant {
	/** @primaryKey */
	id: string;
	status?: 'published' | 'draft' | 'archived';
	sort?: number | null;
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	user_updated?: DirectusUser | string | null;
	date_updated?: string | null;
	name?: string | null;
	address?: string | null;
	logo?: DirectusFile | string | null;
	image?: DirectusFile | string | null;
	website?: string | null;
	cuisine?: string | null;
	slug?: string | null;
	latitude?: number | null;
	location?: string | null;
	longitude?: number | null;
	menus?: Menu[] | string[];
}

export interface RevealBlock {
	/** @primaryKey */
	id: number;
	status?: 'published' | 'draft' | 'archived';
	sort?: number | null;
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	user_updated?: DirectusUser | string | null;
	date_updated?: string | null;
	title?: string | null;
	content?: string | null;
}

export interface SchedulerSetting {
	/** @primaryKey */
	id: string;
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	date_updated?: string | null;
	/** @required */
	user_id: DirectusUser | string;
	default_duration?: 15 | 30 | 45 | 60 | null;
	default_meeting_type?: 'consultation' | 'discovery' | 'general' | null;
	/** @description Minutes buffer before meetings */
	buffer_before?: number | null;
	/** @description Minutes buffer after meetings */
	buffer_after?: number | null;
	send_confirmations?: boolean | null;
	send_reminders?: boolean | null;
	reminder_time?: 15 | 30 | 60 | 1440 | null;
	/** @description Allow public booking */
	public_booking_enabled?: boolean | null;
	/** @description Custom URL slug for booking page */
	booking_page_slug?: string | null;
	/** @description Title shown on booking page */
	booking_page_title?: string | null;
	booking_page_description?: string | null;
	google_calendar_enabled?: boolean | null;
	google_refresh_token?: string | null;
	google_calendar_id?: string | null;
	outlook_calendar_enabled?: boolean | null;
	outlook_refresh_token?: string | null;
	timezone?: `America/New_York` | `America/Chicago` | `America/Denver` | `America/Los_Angeles` | null;
}

export interface Service {
	/** @primaryKey */
	id: string;
	status?: 'published' | 'draft' | 'archived';
	sort?: number | null;
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	user_updated?: DirectusUser | string | null;
	date_updated?: string | null;
	title?: string | null;
	name?: string | null;
	description?: string | null;
	url?: string | null;
	class?: string | null;
	color?: string | null;
	tags?: string[] | null;
	seo?: ExtensionSeoMetadata | null;
	featured_image?: DirectusFile | string | null;
	sticky_text?: Array<{ text: string }> | null;
	default_animation_preset?: AnimationPreset | string | null;
	word?: string | null;
	caption?: string | null;
	case_studies?: CaseStudiesService[] | string[];
	content_blocks?: ServicesContentBlock[] | string[];
	portfolio?: Portfolio[] | string[];
	capabilities?: ServicesCapability[] | string[];
}

export interface ServicesCapability {
	/** @primaryKey */
	id: number;
	services_id?: Service | string | null;
	capabilities_id?: Capability | string | null;
	sort?: number | null;
}

export interface ServicesContentBlock {
	/** @primaryKey */
	id: number;
	services_id?: Service | string | null;
	item?: BlockHero | BlockText | BlockCard | BlockProcess | BlockCta | BlockCapabilitiesShowcase | BlockPortfolioShowcase | BlockClientSuccess | BlockStickyText | BlockReveal | BlockMasonry | BlockItemSlideshow | BlockItemsSlideshow | BlockCallout | string | null;
	collection?: string | null;
	sort?: number | null;
	status?: 'draft' | 'published' | 'archived' | null;
}

export interface ServiceTemplate {
	/** @primaryKey */
	id: number;
	/** @description Only `published` templates show in the AI draft picker */
	status?: 'published' | 'draft' | 'archived' | null;
	sort?: number | null;
	date_created?: string | null;
	date_updated?: string | null;
	user_created?: string | null;
	user_updated?: string | null;
	/** @description e.g. "Brand Identity Package" @required */
	name: string;
	category?: 'branding' | 'web' | 'marketing' | 'retainer' | 'other' | null;
	/** @description One-liner shown in the picker */
	description?: string | null;
	/** @description Legacy free-text scope. Superseded by scope_payload (structured ScopeTreePayload). Kept read-only for back-compat on rows pre-dating the typed-block migration. */
	scope_template?: string | null;
	/** @description Reference base price */
	default_total?: number | null;
	/** @description Typical project length */
	default_duration_days?: number | null;
	/** @description Owning organization @required */
	organization: Organization | string;
	/** @description Hex swatch for calendar chips, invoice line items, and any other surface that distinguishes services. Null falls through to the Work-app accent. */
	color?: string | null;
	/** @description A single emoji to personalize the service. Renders alongside the colour swatch wherever the service appears. */
	icon?: string | null;
	/** @description Structured ScopeTreePayload — phased deliverables editable in-app via ScopeTreeEditor. Replaces free-text scope_template. */
	scope_payload?: Record<string, any> | null;
}

export interface ShopCategory {
	/** @primaryKey */
	id: string;
	status?: 'published' | 'draft' | 'archived';
	sort?: number | null;
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	user_updated?: DirectusUser | string | null;
	date_updated?: string | null;
	name?: string | null;
	/** @required */
	slug: string;
	icon?: string | null;
}

export interface ShopOrderItem {
	/** @primaryKey */
	id: string;
	status?: 'published' | 'draft' | 'archived';
	sort?: number | null;
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	user_updated?: DirectusUser | string | null;
	date_updated?: string | null;
	order?: ShopOrder | string | null;
	product?: ShopProduct | string | null;
	variant?: ShopVariant | string | null;
	quantity?: number | null;
	unit_price?: number | null;
	total_price?: number | null;
}

export interface ShopOrder {
	/** @primaryKey */
	id: string;
	status?: 'published' | 'draft' | 'archived';
	sort?: number | null;
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	user_updated?: DirectusUser | string | null;
	date_updated?: string | null;
	/** @description Auto-generated order number */
	order_number?: string | null;
	payment_method?: 'terminal' | 'tap_to_pay' | 'qr_code' | 'online' | null;
	subtotal?: number | null;
	tax?: number | null;
	total?: number | null;
	stripe_payment_intent_id?: string | null;
	customer_email?: string | null;
	notes?: string | null;
	items?: ShopOrderItem[] | string[];
}

export interface ShopProduct {
	/** @primaryKey */
	id: string;
	status?: 'published' | 'draft' | 'archived';
	sort?: number | null;
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	user_updated?: DirectusUser | string | null;
	date_updated?: string | null;
	name?: string | null;
	/** @required */
	slug: string;
	description?: string | null;
	price?: number | null;
	in_stock?: boolean | null;
	category?: ShopCategory | string | null;
	images?: ShopProductsFile[] | string[];
	variants?: ShopVariant[] | string[];
}

export interface ShopProductsFile {
	/** @primaryKey */
	id: number;
	shop_products_id?: ShopProduct | string | null;
	directus_files_id?: DirectusFile | string | null;
}

export interface ShopSettings {
	/** @primaryKey */
	id: string;
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	user_updated?: DirectusUser | string | null;
	date_updated?: string | null;
	free_shipping_threshold?: number | null;
	free_shipping_enabled?: boolean | null;
	tax_rate?: number | null;
	tax_label?: string | null;
	minimum_order_amount?: number | null;
	currency?: 'USD' | null;
	shop_enabled?: boolean | null;
	shop_announcement?: string | null;
	shop_announcement_enabled?: boolean | null;
	default_shipping_option?: ShopShippingOption | string | null;
	return_policy_days?: number | null;
	low_stock_threshold?: number | null;
}

export interface ShopShippingOption {
	/** @primaryKey */
	id: string;
	status?: 'published' | 'draft' | 'archived';
	sort?: number | null;
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	user_updated?: DirectusUser | string | null;
	date_updated?: string | null;
	name?: string | null;
	description?: string | null;
	price?: number | null;
	estimated_days?: string | null;
}

export interface ShopVariant {
	/** @primaryKey */
	id: string;
	status?: 'published' | 'draft' | 'archived';
	sort?: number | null;
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	user_updated?: DirectusUser | string | null;
	date_updated?: string | null;
	product?: ShopProduct | string | null;
	name?: string | null;
	sku?: string | null;
	stock?: number | null;
}

export interface Slide {
	/** @primaryKey */
	id: number;
	status?: 'published' | 'draft' | 'archived';
	sort?: number | null;
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	user_updated?: DirectusUser | string | null;
	date_updated?: string | null;
	title?: string | null;
	slides_id?: string | null;
}

export interface SocialAccount {
	/** @primaryKey */
	id: string;
	status?: 'published' | 'draft' | 'archived';
	sort?: number | null;
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	user_updated?: DirectusUser | string | null;
	date_updated?: string | null;
	/** @required */
	platform: 'instagram' | 'tiktok';
	/** @description Unique ID from the platform @required */
	platform_user_id: string;
	/** @description Display name on the platform @required */
	account_name: string;
	/** @description The @username handle @required */
	account_handle: string;
	/** @description Profile picture URL from platform */
	profile_picture_url?: string | null;
	/** @description Encrypted OAuth access token @required */
	access_token: string;
	/** @description Encrypted OAuth refresh token */
	refresh_token?: string | null;
	/** @description When the access token expires @required */
	token_expires_at: string;
	/** @description Connection status of this account */
	account_status?: 'active' | 'expired' | 'revoked';
	/** @description Platform-specific data (page_id, scopes, etc.) */
	metadata?: Record<string, any> | null;
	/** @description Owning organization @required */
	organization: Organization | string;
	/** @description Which agency client owns this account (null = house/agency-owned) */
	client?: Client | string | null;
}

export interface SocialActivity {
	/** @primaryKey */
	id: string;
	date_created?: string | null;
	/** @description Owning organization (tenant) @required */
	organization: Organization | string;
	/** @description Connected social_accounts row @required */
	account: SocialAccount | string;
	/** @required */
	platform: 'facebook' | 'instagram' | 'threads';
	/** @required */
	type: 'comment' | 'mention' | 'reaction' | 'follow' | 'lead';
	/** @description Meta's comment_id, post_id, etc. */
	ref_id?: string | null;
	/** @description Parent post if applicable */
	post_id?: string | null;
	actor_id?: string | null;
	actor_name?: string | null;
	preview?: string | null;
	/** @description Original webhook payload for debugging + future re-parse */
	raw_payload?: Record<string, any> | null;
	read?: boolean;
	/** @description Platform timestamp @required */
	created_at: string;
}

export interface SocialActivityLog {
	/** @primaryKey */
	id: string;
	status?: 'published' | 'draft' | 'archived';
	sort?: number | null;
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	user_updated?: DirectusUser | string | null;
	date_updated?: string | null;
}

export interface SocialAnalyticsSnapshot {
	/** @primaryKey */
	id: string;
	status?: 'published' | 'draft' | 'archived';
	sort?: number | null;
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	user_updated?: DirectusUser | string | null;
	date_updated?: string | null;
	/** @description The social account this snapshot belongs to @required */
	social_account: SocialAccount | string;
	/** @description Linked post for post-level metrics (null for account-level) */
	social_post?: SocialPost | string | null;
	/** @required */
	snapshot_type: 'account' | 'post';
	/** @description When these metrics were captured @required */
	captured_at: string;
	/** @description Platform-specific metrics object (followers, likes, impressions, etc.) @required */
	metrics: Record<string, any>;
}

export interface SocialComment {
	/** @primaryKey */
	id: string;
	status?: 'published' | 'draft' | 'archived';
	sort?: number | null;
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	user_updated?: DirectusUser | string | null;
	date_updated?: string | null;
	/** @description The post this comment belongs to @required */
	social_post: SocialPost | string;
	/** @description The account this comment was made on @required */
	social_account: SocialAccount | string;
	/** @description Comment ID from the platform @required */
	platform_comment_id: string;
	/** @description User ID of the commenter on the platform @required */
	platform_user_id: string;
	/** @description Commenter username @required */
	username: string;
}

export interface SocialMessage {
	/** @primaryKey */
	id: string;
	date_created?: string | null;
	/** @description Parent thread @required */
	thread: SocialThread | string;
	/** @description Denormalized from thread for fast tenant filtering @required */
	organization: Organization | string;
	/** @description Meta's mid; UNIQUE for idempotent webhook ingestion @required */
	platform_message_id: string;
	/** @description PSID/IGSID or Page ID @required */
	from_id: string;
	is_outgoing?: boolean;
	text?: string | null;
	/** @description [{ type: image|video|audio|file, url }] */
	attachments?: Record<string, any> | null;
	/** @description [{ from_id, emoji }] */
	reactions?: Record<string, any> | null;
	/** @description Platform timestamp (not Directus date_created) @required */
	created_at: string;
}

export interface SocialPost {
	/** @primaryKey */
	id: string;
	status?: 'published' | 'draft' | 'archived';
	sort?: number | null;
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	user_updated?: DirectusUser | string | null;
	date_updated?: string | null;
	/** @description Post caption / text content @required */
	caption: string;
	/** @description Array of media URLs @required */
	media_urls: Record<string, any>;
	/** @description Array of media types — "image" or "video" per URL @required */
	media_types: Record<string, any>;
	/** @description Preview thumbnail URL */
	thumbnail_url?: string | null;
	post_type?: 'image' | 'video' | 'carousel' | 'reel' | 'story';
	/** @description Array of target accounts with platform-specific options @required */
	platforms: Record<string, any>;
	/** @description When to publish this post @required */
	scheduled_at: string;
	/** @description Publishing workflow status */
	post_status?: 'draft' | 'scheduled' | 'publishing' | 'published' | 'failed';
	/** @description Results per platform after publishing (post IDs, URLs, etc.) */
	publish_results?: Record<string, any> | null;
	/** @description When the post was actually published */
	published_at?: string | null;
	/** @description Error details if publishing failed */
	error_message?: string | null;
	/** @description Owning organization @required */
	organization: Organization | string;
	/** @description Which agency client this post is for (defaults from selected accounts at compose time) */
	client?: Client | string | null;
	/** @description Optional URL appended to the caption at publish time. LinkedIn / Facebook / Threads will fetch OG tags and render a link card. */
	cta_url?: string | null;
	/** @description Short call-to-action label rendered alongside the URL (e.g. "Visit Website", "Book a Call"). */
	cta_label?: string | null;
	/** @description Retainer (or fixed-fee) project this post is work for. Joins the hour pool. */
	project?: Project | string | null;
	/** @description Client this post is for. Set independently of any connected account. */
	target_client?: Client | string | null;
	/** @description Studio review workflow. Independent of publish status until approved. */
	approval_state?: 'draft' | 'in_review' | 'requested_changes' | 'approved' | 'rejected' | 'scheduled' | 'published';
	/** @description Opaque token used by the Phase 5 portal review surface. Server-managed. */
	approval_token?: string | null;
	/** @description User who approved (or on whose behalf approval was recorded). */
	approved_by?: DirectusUser | string | null;
	/** @description When approval landed. */
	approved_at?: string | null;
	/** @description CDN URL for the cover art / mockup shown in Studio before media is finalized. */
	design_image_url?: string | null;
	/** @description Link to the source Figma frame for design review. */
	figma_frame_url?: string | null;
	/** @description First-of-month anchor used to group posts under a retainer period. */
	target_month?: string | null;
	/** @description Content plan this post belongs to (monthly cadence, campaign, or launch). */
	content_plan?: ContentPlan | string | null;
	/** @description Per-platform caption forks. null = all channels publish the master caption. Shape: { instagram?: string, linkedin?: string, facebook?: string, threads?: string, tiktok?: string }. */
	caption_variants?: Record<string, any> | null;
	/** @description Feedback the client left when requesting changes on this post from the portal review. */
	client_feedback?: string | null;
}

export interface SocialThread {
	/** @primaryKey */
	id: string;
	date_created?: string | null;
	date_updated?: string | null;
	user_created?: string | null;
	user_updated?: string | null;
	/** @description Owning organization (tenant) @required */
	organization: Organization | string;
	/** @description Connected social_accounts row @required */
	account: SocialAccount | string;
	/** @required */
	platform: 'facebook' | 'instagram' | 'threads';
	/** @description Meta's t_{...} for FB, conversation ID for IG @required */
	thread_id: string;
	/** @description PSID (FB) or IGSID (IG) @required */
	participant_id: string;
	participant_name?: string | null;
	participant_avatar?: string | null;
	last_message_at?: string | null;
	/** @description Snippet of latest message for list rendering */
	last_message_preview?: string | null;
	unread_count?: number;
	archived?: boolean;
	/** @description Optional triage assignee */
	assigned_to?: DirectusUser | string | null;
}

export interface Task {
	/** @primaryKey */
	id: string;
	status?: 'new' | 'approved' | 'in_progress' | 'completed';
	sort?: number | null;
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	user_updated?: DirectusUser | string | null;
	date_updated?: string | null;
	description?: string | null;
	ticket_id?: Ticket | string | null;
	title?: string | null;
	priority?: 'low' | 'medium' | 'high' | 'urgent' | null;
	schedule?: 'today' | 'this_week' | 'later' | 'unscheduled' | null;
	due_date?: string | null;
	date_completed?: string | null;
	project_id?: Project | string | null;
	project_event_id?: ProjectEvent | string | null;
	channel_id?: Channel | string | null;
	team_id?: Team | string | null;
	organization_id?: Organization | string | null;
	category?: 'quick' | 'ticket' | 'project' | 'event' | 'channel' | 'team' | null;
	ai_suggested?: boolean | null;
	client_id?: Client | string | null;
	/** @description Meeting this task was promoted from (action item back-link) */
	source_meeting?: VideoMeeting | string | null;
	assigned_to?: TasksDirectusUser[] | string[];
}

export interface TasksDirectusUser {
	/** @primaryKey */
	id: number;
	tasks_id?: Task | string | null;
	directus_users_id?: DirectusUser | string | null;
	sort?: number | null;
}

export interface Team {
	/** @primaryKey */
	id: string;
	status?: 'published' | 'draft' | 'archived';
	sort?: number | null;
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	user_updated?: DirectusUser | string | null;
	date_updated?: string | null;
	name?: string | null;
	description?: string | null;
	organization?: Organization | string | null;
	icon?: DirectusFile | string | null;
	active?: boolean | null;
	/** @description What this team specializes in */
	focus?: string | null;
	/** @description Current objectives for this team */
	goals?: string | null;
	users?: JunctionDirectusUsersTeam[] | string[];
	projects?: Project[] | string[];
	/** @description Clients assigned to this team */
	assigned_clients?: ClientsTeam[] | string[];
}

export interface TemplateBlock {
	/** @primaryKey */
	id: number;
	sort?: number | null;
	date_created?: string | null;
	/** @required */
	template_id: EmailTemplate | string;
	/** @required */
	block_id: NewsletterBlock | string;
	instance_variables?: Record<string, any> | null;
}

export interface Testimonial {
	/** @primaryKey */
	id: string;
	sort?: number | null;
	/** @required */
	name: string;
	role?: string | null;
	/** @required */
	quote: string;
	rating?: number | null;
	featured?: boolean | null;
	date_created?: string | null;
	/** @description Headshot photo */
	avatar?: DirectusFile | string | null;
}

export interface Ticket {
	/** @primaryKey */
	id: string;
	status?: 'Pending' | 'Scheduled' | `In Progress` | 'Completed' | 'Archived';
	sort?: number | null;
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	user_updated?: DirectusUser | string | null;
	date_updated?: string | null;
	title?: string | null;
	description?: string | null;
	due_date?: string | null;
	/** @required */
	organization: Organization | string;
	priority?: 'low' | 'medium' | 'high' | null;
	project?: Project | string | null;
	team?: Team | string | null;
	/** @description The client this ticket is for */
	client?: Client | string | null;
	/** @description Client satisfaction rating (1–5) submitted from the portal when the work was delivered. Written by /api/portal/csat. */
	csat_rating?: 1 | 2 | 3 | 4 | 5 | null;
	/** @description Optional free-text the client left with their CSAT rating. */
	csat_comment?: string | null;
	/** @description When the client submitted their CSAT rating. Null = not yet rated. */
	csat_submitted_at?: string | null;
	files?: TicketsFile[] | string[];
	services?: TicketsService[] | string[];
	assigned_to?: TicketsDirectusUser[] | string[];
	tasks?: Task[] | string[];
}

export interface TicketsComment {
	/** @primaryKey */
	id: number;
	tickets_id?: Ticket | string | null;
	comments_id?: Comment | string | null;
	sort?: number | null;
}

export interface TicketsDirectusUser {
	/** @primaryKey */
	id: number;
	tickets_id?: Ticket | string | null;
	directus_users_id?: DirectusUser | string | null;
}

export interface TicketsFile {
	/** @primaryKey */
	id: number;
	tickets_id?: Ticket | string | null;
	directus_files_id?: DirectusFile | string | null;
}

export interface TicketsService {
	/** @primaryKey */
	id: number;
	tickets_id?: Ticket | string | null;
	services_id?: Service | string | null;
	sort?: number | null;
}

export interface TimeEntry {
	/** @primaryKey */
	id: number;
	status?: 'running' | 'completed' | 'archived' | null;
	sort?: number | null;
	/** @required */
	organization: Organization | string;
	/** @required */
	user: DirectusUser | string;
	client?: Client | string | null;
	project?: Project | string | null;
	ticket?: Ticket | string | null;
	task?: Task | string | null;
	description?: string | null;
	/** @required */
	start_time: string;
	end_time?: string | null;
	/** @description Stored duration in minutes (allows manual adjustment) */
	duration_minutes?: number | null;
	/** @description Calendar date derived from start_time */
	date?: string | null;
	billable?: boolean | null;
	/** @description Rate snapshot at time of entry */
	hourly_rate?: number | null;
	billed?: boolean | null;
	invoice?: Invoice | string | null;
	tags?: string[] | null;
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	user_updated?: DirectusUser | string | null;
	date_updated?: string | null;
	/** @description Social post this time was spent on. Joins the post into the retainer hour pool. */
	source_social_post?: SocialPost | string | null;
	/** @description Content plan this time entry was logged against (for "hours per deliverable" reporting on retainers). */
	source_content_plan?: ContentPlan | string | null;
}

export interface TokenPurchase {
	/** @primaryKey */
	id: string;
	date_created?: string | null;
	/** @description Org credited (organizations.id) */
	organization?: string | null;
	/** @description Buyer (directus_users.id) */
	user_id?: string | null;
	/** @description Idempotency key — UNIQUE. One row per paid Checkout Session. */
	stripe_session_id?: string | null;
	stripe_payment_intent?: string | null;
	package_id?: string | null;
	/** @description Tokens granted */
	tokens?: number | null;
	amount_cents?: number | null;
	currency?: string | null;
	status?: string | null;
}

export interface UpsellEvent {
	/** @primaryKey */
	id: string;
	/** @description Feature slug, e.g. brand_light */
	feature?: string;
	/** @description directus_users id of who clicked */
	user?: string | null;
	/** @description organizations id */
	organization?: string | null;
	/** @description UI surface, e.g. rail-settings */
	source?: string | null;
	date_created?: string | null;
}

export interface UserPresence {
	/** @primaryKey */
	id: string;
	status?: 'published' | 'draft' | 'archived';
	sort?: number | null;
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	user_updated?: DirectusUser | string | null;
	date_updated?: string | null;
	user_id?: DirectusUser | string | null;
	location?: string | null;
	last_seen?: string | null;
}

export interface VideoMeetingAttendee {
	/** @primaryKey */
	id: number;
	video_meeting?: VideoMeeting | string;
	attendee_type?: 'user' | 'guest';
	directus_user?: DirectusUser | string | null;
	/** @description Name for external guests */
	guest_name?: string | null;
	/** @description Email for external guests */
	guest_email?: string | null;
	guest_phone?: string | null;
	status?: 'invited' | 'waiting' | 'admitted' | 'rejected' | 'in_meeting' | 'left';
	invite_sent_at?: string | null;
	joined_at?: string | null;
	left_at?: string | null;
	invite_method?: 'email' | 'sms' | 'both' | 'link' | null;
	date_created?: string | null;
	date_updated?: string | null;
	/** @description Linked contact when the attendee was added via the contact picker. NULL for manually-entered guests. */
	contact?: Contact | string | null;
}

export interface VideoMeeting {
	/** @primaryKey */
	id: string;
	status?: 'scheduled' | 'in_progress' | 'completed' | 'cancelled' | 'no_show' | 'archived' | null;
	sort?: number | null;
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	user_updated?: DirectusUser | string | null;
	date_updated?: string | null;
	/** @description Unique room identifier @required */
	room_name: string;
	/** @description Twilio Room SID */
	room_sid?: string | null;
	/** @description Meeting title @required */
	title: string;
	/** @description Meeting description or agenda */
	description?: string | null;
	meeting_type?: 'consultation' | 'discovery' | 'project_review' | 'presentation' | 'followup' | 'general' | null;
	duration_minutes?: 15 | 30 | 45 | 60 | 90 | 120 | null;
	/** @description Scheduled start time */
	scheduled_start?: string | null;
	/** @description Scheduled end time */
	scheduled_end?: string | null;
	actual_start?: string | null;
	actual_end?: string | null;
	actual_duration_minutes?: number | null;
	/** @description Host display name */
	host_identity?: string | null;
	/** @description Host user (staff member) */
	host_user?: DirectusUser | string | null;
	max_participants?: number | null;
	/** @description Peak concurrent participants */
	participant_count?: number | null;
	recording_enabled?: boolean | null;
	recording_url?: string | null;
	meeting_url?: string | null;
	/** @description Optional password protection */
	password?: string | null;
	/** @description Guest name */
	invitee_name?: string | null;
	/** @description Guest email for invite */
	invitee_email?: string | null;
	/** @description Guest phone for SMS invite */
	invitee_phone?: string | null;
	invite_method?: 'email' | 'sms' | 'both' | 'none' | null;
	invite_sent?: boolean | null;
	invite_sent_at?: string | null;
	reminder_sent?: boolean | null;
	reminder_sent_at?: string | null;
	reminder_minutes_before?: 0 | 15 | 30 | 60 | 1440 | null;
	booked_via?: 'direct' | 'public' | 'phone' | 'api' | null;
	/** @description Notes from booking form */
	booking_notes?: string | null;
	related_contact?: Contact | string | null;
	related_organization?: Organization | string | null;
	related_appointment?: Appointment | string | null;
	/** @description JSON log of participant events */
	participants_log?: Record<string, any> | null;
	notes?: string | null;
	follow_up_required?: boolean | null;
	follow_up_notes?: string | null;
	google_event_id?: string | null;
	outlook_event_id?: string | null;
	/** @description Require host to admit guests before they can join */
	waiting_room_enabled?: boolean;
	project?: Project | string | null;
	/** @description Linked lead (if this meeting is about a lead) */
	related_lead?: Lead | string | null;
	/** @description Project event (milestone) this meeting belongs to */
	project_event?: ProjectEvent | string | null;
	/** @description Daily.co transcript handle */
	transcript_id?: string | null;
	/** @description Daily-hosted transcript download URL */
	transcript_url?: string | null;
	/** @description Plain-text transcript with speaker labels */
	transcript_text?: string | null;
	/** @description Markdown summary generated by Earnest AI */
	summary?: string | null;
	/** @description AI-extracted action items */
	action_items?: Array<{ description: string; assignee: string; due_date: string }> | null;
	/** @description AI summary lifecycle */
	summary_status?: 'pending' | 'generating' | 'complete' | 'failed' | null;
	summary_generated_at?: string | null;
	/** @description Last failure message, if any */
	summary_error?: string | null;
	/** @description Auto-start Deepgram transcription on host join. Null = inherit org default. */
	transcription_enabled?: boolean | null;
	/** @description Auto-filled from project.client when this meeting is linked to a project. Used to scope and rank contact pickers. */
	client?: Client | string | null;
	attendees?: VideoMeetingAttendee[] | string[];
	/** @description Structured notes & decisions captured during the meeting (separate from the freeform notes field) */
	note_entries?: MeetingNote[] | string[];
}

export interface Video {
	/** @primaryKey */
	id: string;
	status?: 'published' | 'draft' | 'archived';
	sort?: number | null;
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	user_updated?: DirectusUser | string | null;
	date_updated?: string | null;
	platform?: 'youtube' | 'vimeo' | null;
	link?: string | null;
	portfolio?: Portfolio | string | null;
	tags?: string[] | null;
	title?: string | null;
	description?: string | null;
}

export interface VisitorQuestion {
	/** @primaryKey */
	id: string;
	status?: 'new' | 'answered' | 'added_to_faq' | 'archived' | null;
	sort?: number | null;
	date_created?: string | null;
	/** @description Submitter's email — where you'd reply. @required */
	email: string;
	/** @description The visitor's question — candidate FAQ entry. @required */
	question: string;
	/** @description Your reply / drafted FAQ answer. Fill this in when turning it into FAQ content. */
	answer?: string | null;
	/** @description Which form / page it came from. */
	source?: string | null;
	/** @description Page / URL the visitor submitted from. */
	referrer?: string | null;
}

export interface DirectusAccess {
	/** @primaryKey */
	id: string;
	role?: DirectusRole | string | null;
	user?: DirectusUser | string | null;
	policy?: DirectusPolicy | string;
	sort?: number | null;
}

export interface DirectusActivity {
	/** @primaryKey */
	id: number;
	action?: string;
	user?: DirectusUser | string | null;
	timestamp?: string;
	ip?: string | null;
	user_agent?: string | null;
	collection?: string;
	item?: string;
	origin?: string | null;
	revisions?: DirectusRevision[] | string[];
}

export interface DirectusCollection {
	/** @primaryKey */
	collection: string;
	icon?: string | null;
	note?: string | null;
	display_template?: string | null;
	hidden?: boolean;
	singleton?: boolean;
	translations?: Array<{ language: string; translation: string; singular: string; plural: string }> | null;
	archive_field?: string | null;
	archive_app_filter?: boolean;
	archive_value?: string | null;
	unarchive_value?: string | null;
	sort_field?: string | null;
	accountability?: 'all' | 'activity' | null | null;
	color?: string | null;
	item_duplication_fields?: 'json' | null;
	sort?: number | null;
	group?: DirectusCollection | string | null;
	collapse?: string;
	preview_url?: string | null;
	versioning?: boolean;
}

export interface DirectusComment {
	/** @primaryKey */
	id: string;
	collection?: DirectusCollection | string;
	item?: string;
	comment?: string;
	date_created?: string | null;
	date_updated?: string | null;
	user_created?: DirectusUser | string | null;
	user_updated?: DirectusUser | string | null;
}

export interface DirectusField {
	/** @primaryKey */
	id: number;
	collection?: DirectusCollection | string;
	field?: string;
	special?: string[] | null;
	interface?: string | null;
	options?: 'json' | null;
	display?: string | null;
	display_options?: 'json' | null;
	readonly?: boolean;
	hidden?: boolean;
	sort?: number | null;
	width?: string | null;
	translations?: 'json' | null;
	note?: string | null;
	conditions?: 'json' | null;
	required?: boolean | null;
	group?: DirectusField | string | null;
	validation?: 'json' | null;
	validation_message?: string | null;
	searchable?: boolean;
}

export interface DirectusFile {
	/** @primaryKey */
	id: string;
	storage?: string;
	filename_disk?: string | null;
	filename_download?: string;
	title?: string | null;
	type?: string | null;
	folder?: DirectusFolder | string | null;
	uploaded_by?: DirectusUser | string | null;
	created_on?: string;
	modified_by?: DirectusUser | string | null;
	modified_on?: string;
	charset?: string | null;
	filesize?: number | null;
	width?: number | null;
	height?: number | null;
	duration?: number | null;
	embed?: string | null;
	description?: string | null;
	location?: string | null;
	tags?: string[] | null;
	metadata?: 'json' | null;
	focal_point_x?: number | null;
	focal_point_y?: number | null;
	categories?: string[] | null;
	tus_id?: string | null;
	tus_data?: 'json' | null;
	uploaded_on?: string | null;
	portfolio_title?: string | null;
	status?: 'draft' | 'published' | null;
}

export interface DirectusFolder {
	/** @primaryKey */
	id: string;
	name?: string;
	parent?: DirectusFolder | string | null;
}

export interface DirectusMigration {
	/** @primaryKey */
	version: string;
	name?: string;
	timestamp?: string | null;
}

export interface DirectusPermission {
	/** @primaryKey */
	id: number;
	collection?: string;
	action?: string;
	permissions?: 'json' | null;
	validation?: 'json' | null;
	presets?: 'json' | null;
	fields?: string[] | null;
	policy?: DirectusPolicy | string;
}

export interface DirectusPolicy {
	/** @primaryKey */
	id: string;
	/** @required */
	name: string;
	icon?: string;
	description?: string | null;
	ip_access?: string[] | null;
	enforce_tfa?: boolean;
	admin_access?: boolean;
	app_access?: boolean;
	permissions?: DirectusPermission[] | string[];
	users?: DirectusAccess[] | string[];
	roles?: DirectusAccess[] | string[];
}

export interface DirectusPreset {
	/** @primaryKey */
	id: number;
	bookmark?: string | null;
	user?: DirectusUser | string | null;
	role?: DirectusRole | string | null;
	collection?: string | null;
	search?: string | null;
	layout?: string | null;
	layout_query?: 'json' | null;
	layout_options?: 'json' | null;
	refresh_interval?: number | null;
	filter?: 'json' | null;
	icon?: string | null;
	color?: string | null;
}

export interface DirectusRelation {
	/** @primaryKey */
	id: number;
	many_collection?: string;
	many_field?: string;
	one_collection?: string | null;
	one_field?: string | null;
	one_collection_field?: string | null;
	one_allowed_collections?: string[] | null;
	junction_field?: string | null;
	sort_field?: string | null;
	one_deselect_action?: string;
}

export interface DirectusRevision {
	/** @primaryKey */
	id: number;
	activity?: DirectusActivity | string;
	collection?: string;
	item?: string;
	data?: 'json' | null;
	delta?: 'json' | null;
	parent?: DirectusRevision | string | null;
	version?: DirectusVersion | string | null;
}

export interface DirectusRole {
	/** @primaryKey */
	id: string;
	/** @required */
	name: string;
	icon?: string;
	description?: string | null;
	parent?: DirectusRole | string | null;
	children?: DirectusRole[] | string[];
	policies?: DirectusAccess[] | string[];
	users?: DirectusUser[] | string[];
}

export interface DirectusSession {
	/** @primaryKey */
	token: string;
	user?: DirectusUser | string | null;
	expires?: string;
	ip?: string | null;
	user_agent?: string | null;
	share?: DirectusShare | string | null;
	origin?: string | null;
	next_token?: string | null;
}

export interface DirectusSettings {
	/** @primaryKey */
	id: number;
	project_name?: string;
	project_url?: string | null;
	project_color?: string;
	project_logo?: DirectusFile | string | null;
	public_foreground?: DirectusFile | string | null;
	public_background?: DirectusFile | string | null;
	public_note?: string | null;
	auth_login_attempts?: number | null;
	auth_password_policy?: null | `/^.{8,}$/` | `/(?=^.{8,}$)(?=.*\\d)(?=.*[a-z])(?=.*[A-Z])(?=.*[!@#$%^&*()_+}{';'?>.<,])(?!.*\\s).*$/` | null;
	storage_asset_transform?: 'all' | 'none' | 'presets' | null;
	storage_asset_presets?: Array<{ key: string; fit: 'contain' | 'cover' | 'inside' | 'outside'; width: number; height: number; quality: number; withoutEnlargement: boolean; format: 'auto' | 'jpeg' | 'png' | 'webp' | 'tiff' | 'avif'; transforms: 'json' }> | null;
	custom_css?: string | null;
	storage_default_folder?: DirectusFolder | string | null;
	basemaps?: Array<{ name: string; type: 'raster' | 'tile' | 'style'; url: string; tileSize: number; attribution: string }> | null;
	mapbox_key?: string | null;
	module_bar?: 'json' | null;
	project_descriptor?: string | null;
	default_language?: string;
	custom_aspect_ratios?: Array<{ text: string; value: number }> | null;
	public_favicon?: DirectusFile | string | null;
	default_appearance?: 'auto' | 'light' | 'dark';
	default_theme_light?: string | null;
	theme_light_overrides?: 'json' | null;
	default_theme_dark?: string | null;
	theme_dark_overrides?: 'json' | null;
	report_error_url?: string | null;
	report_bug_url?: string | null;
	report_feature_url?: string | null;
	public_registration?: boolean;
	public_registration_verify_email?: boolean;
	public_registration_role?: DirectusRole | string | null;
	public_registration_email_filter?: 'json' | null;
	visual_editor_urls?: Array<{ url: string }> | null;
	project_id?: string | null;
	collaborative_editing_settings?: Record<string, any> | null;
	mcp_enabled?: boolean;
	mcp_allow_deletes?: boolean;
	mcp_prompts_collection?: string | null;
	mcp_system_prompt_enabled?: boolean;
	mcp_system_prompt?: string | null;
	project_owner?: string | null;
	project_usage?: string | null;
	org_name?: string | null;
	product_updates?: boolean | null;
	project_status?: string | null;
	ai_openai_api_key?: string | null;
	ai_anthropic_api_key?: string | null;
	ai_system_prompt?: string | null;
	ai_google_api_key?: string | null;
	ai_openai_compatible_api_key?: string | null;
	ai_openai_compatible_base_url?: string | null;
	ai_openai_compatible_name?: string | null;
	ai_openai_compatible_models?: Array<{ id: string; name: string; context: number; output: number; attachment: boolean; reasoning: boolean; providerOptions: Record<string, any> }> | null;
	ai_openai_compatible_headers?: Array<{ header: string; value: string }> | null;
	ai_openai_allowed_models?: Array<`gpt-4o-mini` | `gpt-4.1-nano` | `gpt-4.1-mini` | `gpt-4.1` | `gpt-5-nano` | `gpt-5-mini` | `gpt-5` | `gpt-5.2` | `gpt-5.2-chat-latest` | `gpt-5.2-pro` | `gpt-5.4` | `gpt-5.4-pro`> | null;
	ai_anthropic_allowed_models?: Array<`claude-haiku-4-5` | `claude-sonnet-4-5` | `claude-opus-4-5` | `claude-sonnet-4-6` | `claude-opus-4-6`> | null;
	ai_google_allowed_models?: Array<`gemini-3-pro-preview` | `gemini-3-flash-preview` | `gemini-2.5-pro` | `gemini-2.5-flash` | `gemini-3.1-pro-preview` | `gemini-3.1-flash-lite-preview` | `gemini-2.5-flash-lite`> | null;
	collaborative_editing_enabled?: boolean;
}

export interface DirectusUser {
	/** @primaryKey */
	id: string;
	first_name?: string | null;
	last_name?: string | null;
	email?: string | null;
	password?: string | null;
	location?: string | null;
	title?: string | null;
	description?: string | null;
	tags?: string[] | null;
	avatar?: DirectusFile | string | null;
	language?: string | null;
	tfa_secret?: string | null;
	status?: 'draft' | 'invited' | 'unverified' | 'active' | 'suspended' | 'archived';
	role?: DirectusRole | string | null;
	token?: string | null;
	last_access?: string | null;
	last_page?: string | null;
	provider?: string;
	external_identifier?: string | null;
	auth_data?: 'json' | null;
	email_notifications?: boolean | null;
	appearance?: null | 'auto' | 'light' | 'dark' | null;
	theme_dark?: string | null;
	theme_light?: string | null;
	theme_light_overrides?: 'json' | null;
	theme_dark_overrides?: 'json' | null;
	phone?: string | null;
	cell_phone?: string | null;
	text_direction?: 'auto' | 'ltr' | 'rtl';
	industry?: string | null;
	networking_goal?: string | null;
	/** @description JSON preferences for nav visibility and order */
	nav_preferences?: Record<string, any> | null;
	/** @description Stripe Customer id (cus_…). Set on registration; primary lookup key for webhook → org sync. */
	stripe_customer_id?: string | null;
	/** @description Stripe Subscription id (sub_…). Set by checkout/subscription webhooks. */
	stripe_subscription_id?: string | null;
	/** @description Stripe subscription status mirror. */
	subscription_status?: 'active' | 'trialing' | 'past_due' | 'canceled' | 'unpaid' | 'incomplete' | 'incomplete_expired' | 'paused' | null;
	/** @description Stripe Price id of the active line item (price_…). */
	subscription_plan?: string | null;
	/** @description When the current billing period rolls over. */
	subscription_current_period_end?: string | null;
	/** @description When the user agreed to Terms of Service & Privacy Policy. Set on registration; updated on subscription checkout re-affirmation. */
	terms_accepted_at?: string | null;
	/** @description Personal navigation shell. Classic = sidebar + hats; Apps = department-store rail. */
	layout_mode?: 'classic' | 'apps';
	/** @description Apps mode rail placement. Ignored in classic. */
	app_rail_position?: 'left' | 'top' | 'right' | 'bottom' | 'floating';
	/** @description Per-user palette for the apps shell (default | oceanic | royal). */
	app_palette?: 'default' | 'oceanic' | 'royal' | null;
	/** @description Command Center lens preference — controls band emphasis on /. (me | org) */
	view_lens?: 'me' | 'org' | null;
	/** @description List of /apps/* intro cards the user has dismissed (Stage 3). Array of AppId strings. */
	dismissed_app_intros?: string[] | null;
	/** @description CardDesk install-promo dismissal. Null = show; within 30 days = snooze; far-future (9999) = never show again. */
	app_pref_carddesk_promo_dismissed_at?: string | null;
	/** @description Content Studio first-visit intro dismissal. Null = show; any timestamp = already dismissed. */
	app_pref_studio_intro_dismissed_at?: string | null;
	/** @description CardDesk: opt in to being found by name/email in the network directory search. */
	discoverable?: boolean | null;
	/** @description Preferred name / nickname (editable from /account). */
	nickname?: string | null;
	/** @description LinkedIn profile URL (editable from /account). */
	linkedin?: string | null;
	/** @description GitHub profile URL (editable from /account). */
	github?: string | null;
	/** @description IANA timezone (e.g. America/New_York). Set from /account profile. */
	timezone?: string | null;
	/** @description Earnest Score / arcade first-visit intro dismissal. Null = show; any timestamp = already dismissed. */
	app_pref_arcade_intro_dismissed_at?: string | null;
	/** @description Per-category notification opt-outs: { [category]: boolean }. Missing key = opt-in. `_all: false` mutes everything. */
	notification_preferences?: Record<string, any> | null;
	organizations?: OrganizationsDirectusUser[] | string[];
	teams?: JunctionDirectusUsersTeam[] | string[];
	/** @description Active portal-user rows for this Directus user. Read-only o2m. Used by Client policy row filters. */
	client_portal_users?: ClientPortalUser[] | string[];
	policies?: DirectusAccess[] | string[];
}

export interface DirectusDashboard {
	/** @primaryKey */
	id: string;
	name?: string;
	icon?: string;
	note?: string | null;
	date_created?: string | null;
	user_created?: DirectusUser | string | null;
	color?: string | null;
	panels?: DirectusPanel[] | string[];
}

export interface DirectusPanel {
	/** @primaryKey */
	id: string;
	dashboard?: DirectusDashboard | string;
	name?: string | null;
	icon?: string | null;
	color?: string | null;
	show_header?: boolean;
	note?: string | null;
	type?: string;
	position_x?: number;
	position_y?: number;
	width?: number;
	height?: number;
	options?: 'json' | null;
	date_created?: string | null;
	user_created?: DirectusUser | string | null;
}

export interface DirectusNotification {
	/** @primaryKey */
	id: number;
	timestamp?: string | null;
	status?: string | null;
	recipient?: DirectusUser | string;
	sender?: DirectusUser | string | null;
	subject?: string;
	message?: string | null;
	collection?: string | null;
	item?: string | null;
}

export interface DirectusShare {
	/** @primaryKey */
	id: string;
	name?: string | null;
	collection?: DirectusCollection | string;
	item?: string;
	role?: DirectusRole | string | null;
	password?: string | null;
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	date_start?: string | null;
	date_end?: string | null;
	times_used?: number | null;
	max_uses?: number | null;
}

export interface DirectusFlow {
	/** @primaryKey */
	id: string;
	name?: string;
	icon?: string | null;
	color?: string | null;
	description?: string | null;
	status?: string;
	trigger?: string | null;
	accountability?: string | null;
	options?: 'json' | null;
	operation?: DirectusOperation | string | null;
	date_created?: string | null;
	user_created?: DirectusUser | string | null;
	operations?: DirectusOperation[] | string[];
}

export interface DirectusOperation {
	/** @primaryKey */
	id: string;
	name?: string | null;
	key?: string;
	type?: string;
	position_x?: number;
	position_y?: number;
	options?: 'json' | null;
	resolve?: DirectusOperation | string | null;
	reject?: DirectusOperation | string | null;
	flow?: DirectusFlow | string;
	date_created?: string | null;
	user_created?: DirectusUser | string | null;
}

export interface DirectusTranslation {
	/** @primaryKey */
	id: string;
	/** @required */
	language: string;
	/** @required */
	key: string;
	/** @required */
	value: string;
}

export interface DirectusVersion {
	/** @primaryKey */
	id: string;
	key?: string;
	name?: string | null;
	collection?: DirectusCollection | string;
	item?: string;
	hash?: string | null;
	date_created?: string | null;
	date_updated?: string | null;
	user_created?: DirectusUser | string | null;
	user_updated?: DirectusUser | string | null;
	delta?: 'json' | null;
}

export interface DirectusExtension {
	enabled?: boolean;
	/** @primaryKey */
	id: string;
	folder?: string;
	source?: string;
	bundle?: string | null;
}

export interface DirectusDeployment {
	/** @primaryKey */
	id: string;
	provider?: string;
	credentials?: string | null;
	options?: 'json' | null;
	date_created?: string | null;
	user_created?: DirectusUser | string | null;
	webhook_ids?: 'json' | null;
	webhook_secret?: string | null;
	last_synced_at?: string | null;
	projects?: DirectusDeploymentProject[] | string[];
}

export interface DirectusDeploymentProject {
	/** @primaryKey */
	id: string;
	deployment?: DirectusDeployment | string;
	external_id?: string;
	name?: string;
	date_created?: string | null;
	user_created?: DirectusUser | string | null;
	url?: string | null;
	framework?: string | null;
	deployable?: boolean;
	runs?: DirectusDeploymentRun[] | string[];
}

export interface DirectusDeploymentRun {
	/** @primaryKey */
	id: string;
	project?: DirectusDeploymentProject | string;
	external_id?: string;
	target?: string;
	date_created?: string | null;
	user_created?: DirectusUser | string | null;
	status?: string | null;
	url?: string | null;
	started_at?: string | null;
	completed_at?: string | null;
}

export interface Schema {
	ai_actions: AiAction[];
	ai_chat_messages: AiChatMessage[];
	ai_chat_sessions: AiChatSession[];
	ai_context_snapshots: AiContextSnapshot[];
	ai_notes: AiNote[];
	ai_notes_ai_tags: AiNotesAiTag[];
	ai_notice_history: AiNoticeHistory[];
	ai_preferences: AiPreference[];
	ai_tags: AiTag[];
	ai_usage_logs: AiUsageLog[];
	animation_presets: AnimationPreset[];
	appointments: Appointment[];
	appointments_directus_users: AppointmentsDirectusUser[];
	ar_analytics: ArAnalytic[];
	ar_clients: ArClient[];
	ar_hotspots: ArHotspot[];
	augmented_reality: AugmentedReality[];
	availability: Availability[];
	before_and_afters: BeforeAndAfter[];
	block_callout: BlockCallout[];
	block_capabilities_showcase: BlockCapabilitiesShowcase[];
	block_capabilities_showcase_capabilities: BlockCapabilitiesShowcaseCapability[];
	block_cards: BlockCard[];
	block_client_success: BlockClientSuccess[];
	block_client_success_client_testimonials: BlockClientSuccessClientTestimonial[];
	block_cta: BlockCta[];
	block_hero: BlockHero[];
	block_item_slideshow: BlockItemSlideshow[];
	block_items_slideshow: BlockItemsSlideshow[];
	block_items_slideshow_portfolio: BlockItemsSlideshowPortfolio[];
	block_masonry: BlockMasonry[];
	block_masonry_portfolio: BlockMasonryPortfolio[];
	block_parallax_grid: BlockParallaxGrid[];
	block_parallax_grid_files: BlockParallaxGridFile[];
	block_portfolio_showcase: BlockPortfolioShowcase[];
	block_portfolio_showcase_portfolio: BlockPortfolioShowcasePortfolio[];
	block_process: BlockProcess[];
	block_reveal: BlockReveal[];
	block_reveal_reveal_blocks: BlockRevealRevealBlock[];
	block_sticky_text: BlockStickyText[];
	block_text: BlockText[];
	blog: Blog[];
	blog_blog_categories: BlogBlogCategory[];
	blog_categories: BlogCategory[];
	blog_files: BlogFile[];
	blog_industries: BlogIndustry[];
	blog_services: BlogService[];
	business_hours: BusinessHour[];
	call_logs: CallLog[];
	call_routes: CallRoute[];
	capabilities: Capability[];
	case_studies: CaseStudy[];
	case_studies_files: CaseStudiesFile[];
	case_studies_industries: CaseStudiesIndustry[];
	case_studies_portfolio: CaseStudiesPortfolio[];
	case_studies_services: CaseStudiesService[];
	cd_activities: CdActivity[];
	cd_ai_usage_logs: CdAiUsageLog[];
	cd_cards: CdCard[];
	cd_connections: CdConnection[];
	cd_contacts: CdContact[];
	cd_credit_accounts: CdCreditAccount[];
	cd_credit_purchases: CdCreditPurchase[];
	cd_feedback: CdFeedback[];
	cd_feed_events: CdFeedEvent[];
	cd_invites: CdInvite[];
	cd_plans: CdPlan[];
	cd_reactions: CdReaction[];
	cd_sessions: CdSession[];
	cd_tasks: CdTask[];
	cd_xp_state: CdXpState[];
	channel_members: ChannelMember[];
	channel_moderation_log: ChannelModerationLog[];
	channels: Channel[];
	client_portal_users: ClientPortalUser[];
	clients: Client[];
	clients_directus_users: ClientsDirectusUser[];
	clients_teams: ClientsTeam[];
	client_testimonials: ClientTestimonial[];
	client_timeline: ClientTimeline[];
	comment_reports: CommentReport[];
	comments: Comment[];
	contact_connections: ContactConnection[];
	contacts: Contact[];
	contacts_organizations: ContactsOrganization[];
	content_plans: ContentPlan[];
	contracts: Contract[];
	courses: Course[];
	current_work: CurrentWork[];
	director_briefings: DirectorBriefing[];
	director_minutes: DirectorMinute[];
	director_participants: DirectorParticipant[];
	director_qa: DirectorQa[];
	director_sessions: DirectorSession[];
	document_blocks: DocumentBlock[];
	early_access: EarlyAccess[];
	earnest_history: EarnestHistory[];
	earnest_reviews: EarnestReview[];
	earnest_scan_credits: EarnestScanCredit[];
	earnest_scores: EarnestScore[];
	earnest_showcase_brands: EarnestShowcaseBrand[];
	earnest_token_pools: EarnestTokenPool[];
	email_events: EmailEvent[];
	email_partials: EmailPartial[];
	emails: Email[];
	email_templates: EmailTemplate[];
	event_types: EventType[];
	expenses: Expense[];
	gbp_posts: GbpPost[];
	goals: Goal[];
	goal_snapshots: GoalSnapshot[];
	held_emails: HeldEmail[];
	heros: Hero[];
	home: Home;
	home_files: HomeFile[];
	home_slides: HomeSlide[];
	industries: Industry[];
	industries_content_blocks: IndustriesContentBlock[];
	invoices: Invoice[];
	invoices_products: InvoicesProduct[];
	invoices_projects: InvoicesProject[];
	junction_directus_users_teams: JunctionDirectusUsersTeam[];
	lead_activities: LeadActivity[];
	lead_activities_files: LeadActivitiesFile[];
	leads: Lead[];
	lead_stage_list_rules: LeadStageListRule[];
	line_items: LineItem[];
	mailing_list_contacts: MailingListContact[];
	mailing_lists: MailingList[];
	marketing_campaigns: MarketingCampaign[];
	marketing_recommendations: MarketingRecommendation[];
	marketing_touches: MarketingTouche[];
	marketing_touch_targets: MarketingTouchTarget[];
	marketing_touch_variants: MarketingTouchVariant[];
	meeting_chat_messages: MeetingChatMessage[];
	meeting_notes: MeetingNote[];
	meeting_requests: MeetingRequest[];
	meeting_snapshots: MeetingSnapshot[];
	menus: Menu[];
	messages: Message[];
	newsletter_blocks: NewsletterBlock[];
	options: Option[];
	organizations: Organization[];
	organizations_directus_users: OrganizationsDirectusUser[];
	org_memberships: OrgMembership[];
	org_roles: OrgRole[];
	page_agency: PageAgency;
	page_agency_content_blocks: PageAgencyContentBlock[];
	page_home: PageHome;
	page_home_content_blocks: PageHomeContentBlock[];
	page_industries: PageIndustries;
	page_industries_content_blocks: PageIndustriesContentBlock[];
	page_portfolio: PagePortfolio;
	page_portfolio_content_blocks: PagePortfolioContentBlock[];
	pages_content_blocks: PagesContentBlock[];
	page_services: PageServices;
	page_services_content_blocks: PageServicesContentBlock[];
	partner_logos: PartnerLogo[];
	password_reset_tokens: PasswordResetToken[];
	payments_received: PaymentsReceived[];
	people: People[];
	people_organizations: PeopleOrganization[];
	phone_settings: PhoneSetting[];
	portfolio: Portfolio[];
	portfolio_before_and_afters: PortfolioBeforeAndAfter[];
	portfolio_capabilities: PortfolioCapability[];
	portfolio_files: PortfolioFile[];
	portfolio_industries: PortfolioIndustry[];
	portfolio_services: PortfolioService[];
	products: Product[];
	project_categories: ProjectCategory[];
	project_digests: ProjectDigest[];
	project_event_categories: ProjectEventCategory[];
	project_event_files: ProjectEventFile[];
	project_events: ProjectEvent[];
	project_events_comments: ProjectEventsComment[];
	project_events_invoices: ProjectEventsInvoice[];
	projects: Project[];
	projects_contacts: ProjectsContact[];
	projects_directus_users: ProjectsDirectusUser[];
	projects_files: ProjectsFile[];
	project_status_updates: ProjectStatusUpdate[];
	prompts: Prompt[];
	proposals: Proposal[];
	proposals_files: ProposalsFile[];
	push_subscriptions: PushSubscription[];
	reactions: Reaction[];
	requests: Request[];
	restaurants: Restaurant[];
	reveal_blocks: RevealBlock[];
	scheduler_settings: SchedulerSetting[];
	services: Service[];
	services_capabilities: ServicesCapability[];
	services_content_blocks: ServicesContentBlock[];
	service_templates: ServiceTemplate[];
	shop_categories: ShopCategory[];
	shop_order_items: ShopOrderItem[];
	shop_orders: ShopOrder[];
	shop_products: ShopProduct[];
	shop_products_files: ShopProductsFile[];
	shop_settings: ShopSettings;
	shop_shipping_options: ShopShippingOption[];
	shop_variants: ShopVariant[];
	slides: Slide[];
	social_accounts: SocialAccount[];
	social_activity: SocialActivity[];
	social_activity_log: SocialActivityLog[];
	social_analytics_snapshots: SocialAnalyticsSnapshot[];
	social_comments: SocialComment[];
	social_messages: SocialMessage[];
	social_posts: SocialPost[];
	social_threads: SocialThread[];
	tasks: Task[];
	tasks_directus_users: TasksDirectusUser[];
	teams: Team[];
	template_blocks: TemplateBlock[];
	testimonials: Testimonial[];
	tickets: Ticket[];
	tickets_comments: TicketsComment[];
	tickets_directus_users: TicketsDirectusUser[];
	tickets_files: TicketsFile[];
	tickets_services: TicketsService[];
	time_entries: TimeEntry[];
	token_purchases: TokenPurchase[];
	upsell_events: UpsellEvent[];
	user_presence: UserPresence[];
	video_meeting_attendees: VideoMeetingAttendee[];
	video_meetings: VideoMeeting[];
	videos: Video[];
	visitor_questions: VisitorQuestion[];
	directus_access: DirectusAccess[];
	directus_activity: DirectusActivity[];
	directus_collections: DirectusCollection[];
	directus_comments: DirectusComment[];
	directus_fields: DirectusField[];
	directus_files: DirectusFile[];
	directus_folders: DirectusFolder[];
	directus_migrations: DirectusMigration[];
	directus_permissions: DirectusPermission[];
	directus_policies: DirectusPolicy[];
	directus_presets: DirectusPreset[];
	directus_relations: DirectusRelation[];
	directus_revisions: DirectusRevision[];
	directus_roles: DirectusRole[];
	directus_sessions: DirectusSession[];
	directus_settings: DirectusSettings;
	directus_users: DirectusUser[];
	directus_dashboards: DirectusDashboard[];
	directus_panels: DirectusPanel[];
	directus_notifications: DirectusNotification[];
	directus_shares: DirectusShare[];
	directus_flows: DirectusFlow[];
	directus_operations: DirectusOperation[];
	directus_translations: DirectusTranslation[];
	directus_versions: DirectusVersion[];
	directus_extensions: DirectusExtension[];
	directus_deployments: DirectusDeployment[];
	directus_deployment_projects: DirectusDeploymentProject[];
	directus_deployment_runs: DirectusDeploymentRun[];
}

export enum CollectionNames {
	ai_actions = 'ai_actions',
	ai_chat_messages = 'ai_chat_messages',
	ai_chat_sessions = 'ai_chat_sessions',
	ai_context_snapshots = 'ai_context_snapshots',
	ai_notes = 'ai_notes',
	ai_notes_ai_tags = 'ai_notes_ai_tags',
	ai_notice_history = 'ai_notice_history',
	ai_preferences = 'ai_preferences',
	ai_tags = 'ai_tags',
	ai_usage_logs = 'ai_usage_logs',
	animation_presets = 'animation_presets',
	appointments = 'appointments',
	appointments_directus_users = 'appointments_directus_users',
	ar_analytics = 'ar_analytics',
	ar_clients = 'ar_clients',
	ar_hotspots = 'ar_hotspots',
	augmented_reality = 'augmented_reality',
	availability = 'availability',
	before_and_afters = 'before_and_afters',
	block_callout = 'block_callout',
	block_capabilities_showcase = 'block_capabilities_showcase',
	block_capabilities_showcase_capabilities = 'block_capabilities_showcase_capabilities',
	block_cards = 'block_cards',
	block_client_success = 'block_client_success',
	block_client_success_client_testimonials = 'block_client_success_client_testimonials',
	block_cta = 'block_cta',
	block_hero = 'block_hero',
	block_item_slideshow = 'block_item_slideshow',
	block_items_slideshow = 'block_items_slideshow',
	block_items_slideshow_portfolio = 'block_items_slideshow_portfolio',
	block_masonry = 'block_masonry',
	block_masonry_portfolio = 'block_masonry_portfolio',
	block_parallax_grid = 'block_parallax_grid',
	block_parallax_grid_files = 'block_parallax_grid_files',
	block_portfolio_showcase = 'block_portfolio_showcase',
	block_portfolio_showcase_portfolio = 'block_portfolio_showcase_portfolio',
	block_process = 'block_process',
	block_reveal = 'block_reveal',
	block_reveal_reveal_blocks = 'block_reveal_reveal_blocks',
	block_sticky_text = 'block_sticky_text',
	block_text = 'block_text',
	blog = 'blog',
	blog_blog_categories = 'blog_blog_categories',
	blog_categories = 'blog_categories',
	blog_files = 'blog_files',
	blog_industries = 'blog_industries',
	blog_services = 'blog_services',
	business_hours = 'business_hours',
	call_logs = 'call_logs',
	call_routes = 'call_routes',
	capabilities = 'capabilities',
	case_studies = 'case_studies',
	case_studies_files = 'case_studies_files',
	case_studies_industries = 'case_studies_industries',
	case_studies_portfolio = 'case_studies_portfolio',
	case_studies_services = 'case_studies_services',
	cd_activities = 'cd_activities',
	cd_ai_usage_logs = 'cd_ai_usage_logs',
	cd_cards = 'cd_cards',
	cd_connections = 'cd_connections',
	cd_contacts = 'cd_contacts',
	cd_credit_accounts = 'cd_credit_accounts',
	cd_credit_purchases = 'cd_credit_purchases',
	cd_feedback = 'cd_feedback',
	cd_feed_events = 'cd_feed_events',
	cd_invites = 'cd_invites',
	cd_plans = 'cd_plans',
	cd_reactions = 'cd_reactions',
	cd_sessions = 'cd_sessions',
	cd_tasks = 'cd_tasks',
	cd_xp_state = 'cd_xp_state',
	channel_members = 'channel_members',
	channel_moderation_log = 'channel_moderation_log',
	channels = 'channels',
	client_portal_users = 'client_portal_users',
	clients = 'clients',
	clients_directus_users = 'clients_directus_users',
	clients_teams = 'clients_teams',
	client_testimonials = 'client_testimonials',
	client_timeline = 'client_timeline',
	comment_reports = 'comment_reports',
	comments = 'comments',
	contact_connections = 'contact_connections',
	contacts = 'contacts',
	contacts_organizations = 'contacts_organizations',
	content_plans = 'content_plans',
	contracts = 'contracts',
	courses = 'courses',
	current_work = 'current_work',
	director_briefings = 'director_briefings',
	director_minutes = 'director_minutes',
	director_participants = 'director_participants',
	director_qa = 'director_qa',
	director_sessions = 'director_sessions',
	document_blocks = 'document_blocks',
	early_access = 'early_access',
	earnest_history = 'earnest_history',
	earnest_reviews = 'earnest_reviews',
	earnest_scan_credits = 'earnest_scan_credits',
	earnest_scores = 'earnest_scores',
	earnest_showcase_brands = 'earnest_showcase_brands',
	earnest_token_pools = 'earnest_token_pools',
	email_events = 'email_events',
	email_partials = 'email_partials',
	emails = 'emails',
	email_templates = 'email_templates',
	event_types = 'event_types',
	expenses = 'expenses',
	gbp_posts = 'gbp_posts',
	goals = 'goals',
	goal_snapshots = 'goal_snapshots',
	held_emails = 'held_emails',
	heros = 'heros',
	home = 'home',
	home_files = 'home_files',
	home_slides = 'home_slides',
	industries = 'industries',
	industries_content_blocks = 'industries_content_blocks',
	invoices = 'invoices',
	invoices_products = 'invoices_products',
	invoices_projects = 'invoices_projects',
	junction_directus_users_teams = 'junction_directus_users_teams',
	lead_activities = 'lead_activities',
	lead_activities_files = 'lead_activities_files',
	leads = 'leads',
	lead_stage_list_rules = 'lead_stage_list_rules',
	line_items = 'line_items',
	mailing_list_contacts = 'mailing_list_contacts',
	mailing_lists = 'mailing_lists',
	marketing_campaigns = 'marketing_campaigns',
	marketing_recommendations = 'marketing_recommendations',
	marketing_touches = 'marketing_touches',
	marketing_touch_targets = 'marketing_touch_targets',
	marketing_touch_variants = 'marketing_touch_variants',
	meeting_chat_messages = 'meeting_chat_messages',
	meeting_notes = 'meeting_notes',
	meeting_requests = 'meeting_requests',
	meeting_snapshots = 'meeting_snapshots',
	menus = 'menus',
	messages = 'messages',
	newsletter_blocks = 'newsletter_blocks',
	options = 'options',
	organizations = 'organizations',
	organizations_directus_users = 'organizations_directus_users',
	org_memberships = 'org_memberships',
	org_roles = 'org_roles',
	page_agency = 'page_agency',
	page_agency_content_blocks = 'page_agency_content_blocks',
	page_home = 'page_home',
	page_home_content_blocks = 'page_home_content_blocks',
	page_industries = 'page_industries',
	page_industries_content_blocks = 'page_industries_content_blocks',
	page_portfolio = 'page_portfolio',
	page_portfolio_content_blocks = 'page_portfolio_content_blocks',
	pages_content_blocks = 'pages_content_blocks',
	page_services = 'page_services',
	page_services_content_blocks = 'page_services_content_blocks',
	partner_logos = 'partner_logos',
	password_reset_tokens = 'password_reset_tokens',
	payments_received = 'payments_received',
	people = 'people',
	people_organizations = 'people_organizations',
	phone_settings = 'phone_settings',
	portfolio = 'portfolio',
	portfolio_before_and_afters = 'portfolio_before_and_afters',
	portfolio_capabilities = 'portfolio_capabilities',
	portfolio_files = 'portfolio_files',
	portfolio_industries = 'portfolio_industries',
	portfolio_services = 'portfolio_services',
	products = 'products',
	project_categories = 'project_categories',
	project_digests = 'project_digests',
	project_event_categories = 'project_event_categories',
	project_event_files = 'project_event_files',
	project_events = 'project_events',
	project_events_comments = 'project_events_comments',
	project_events_invoices = 'project_events_invoices',
	projects = 'projects',
	projects_contacts = 'projects_contacts',
	projects_directus_users = 'projects_directus_users',
	projects_files = 'projects_files',
	project_status_updates = 'project_status_updates',
	prompts = 'prompts',
	proposals = 'proposals',
	proposals_files = 'proposals_files',
	push_subscriptions = 'push_subscriptions',
	reactions = 'reactions',
	requests = 'requests',
	restaurants = 'restaurants',
	reveal_blocks = 'reveal_blocks',
	scheduler_settings = 'scheduler_settings',
	services = 'services',
	services_capabilities = 'services_capabilities',
	services_content_blocks = 'services_content_blocks',
	service_templates = 'service_templates',
	shop_categories = 'shop_categories',
	shop_order_items = 'shop_order_items',
	shop_orders = 'shop_orders',
	shop_products = 'shop_products',
	shop_products_files = 'shop_products_files',
	shop_settings = 'shop_settings',
	shop_shipping_options = 'shop_shipping_options',
	shop_variants = 'shop_variants',
	slides = 'slides',
	social_accounts = 'social_accounts',
	social_activity = 'social_activity',
	social_activity_log = 'social_activity_log',
	social_analytics_snapshots = 'social_analytics_snapshots',
	social_comments = 'social_comments',
	social_messages = 'social_messages',
	social_posts = 'social_posts',
	social_threads = 'social_threads',
	tasks = 'tasks',
	tasks_directus_users = 'tasks_directus_users',
	teams = 'teams',
	template_blocks = 'template_blocks',
	testimonials = 'testimonials',
	tickets = 'tickets',
	tickets_comments = 'tickets_comments',
	tickets_directus_users = 'tickets_directus_users',
	tickets_files = 'tickets_files',
	tickets_services = 'tickets_services',
	time_entries = 'time_entries',
	token_purchases = 'token_purchases',
	upsell_events = 'upsell_events',
	user_presence = 'user_presence',
	video_meeting_attendees = 'video_meeting_attendees',
	video_meetings = 'video_meetings',
	videos = 'videos',
	visitor_questions = 'visitor_questions',
	directus_access = 'directus_access',
	directus_activity = 'directus_activity',
	directus_collections = 'directus_collections',
	directus_comments = 'directus_comments',
	directus_fields = 'directus_fields',
	directus_files = 'directus_files',
	directus_folders = 'directus_folders',
	directus_migrations = 'directus_migrations',
	directus_permissions = 'directus_permissions',
	directus_policies = 'directus_policies',
	directus_presets = 'directus_presets',
	directus_relations = 'directus_relations',
	directus_revisions = 'directus_revisions',
	directus_roles = 'directus_roles',
	directus_sessions = 'directus_sessions',
	directus_settings = 'directus_settings',
	directus_users = 'directus_users',
	directus_dashboards = 'directus_dashboards',
	directus_panels = 'directus_panels',
	directus_notifications = 'directus_notifications',
	directus_shares = 'directus_shares',
	directus_flows = 'directus_flows',
	directus_operations = 'directus_operations',
	directus_translations = 'directus_translations',
	directus_versions = 'directus_versions',
	directus_extensions = 'directus_extensions',
	directus_deployments = 'directus_deployments',
	directus_deployment_projects = 'directus_deployment_projects',
	directus_deployment_runs = 'directus_deployment_runs'
}