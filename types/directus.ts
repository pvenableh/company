
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
}

export interface BlogFile {
	/** @primaryKey */
	id: number;
	blog_id?: Blog | string | null;
	directus_files_id?: DirectusFile | string | null;
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
	/** @description Client name if different than organization */
	client?: string | null;
	project_duration?: string | null;
	project_year?: string | null;
	project_url?: string | null;
	/** @description Keywords and tags for categorization */
	tags?: string[] | null;
	featured?: boolean | null;
	gallery?: CaseStudiesFile[] | string[];
	services?: CaseStudiesService[] | string[];
}

export interface CaseStudiesFile {
	/** @primaryKey */
	id: number;
	case_studies_id?: CaseStudy | string | null;
	directus_files_id?: DirectusFile | string | null;
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
	type?: 'email' | 'text' | 'call' | 'meeting' | 'linkedin' | 'other' | null;
	label?: string | null;
	date?: string | null;
	note?: string | null;
	is_response?: boolean | null;
	response_note?: string | null;
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
	messages?: Message[] | string[];
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
	related_portfolio?: string | null;
	service_category?: 'brand_design' | 'web_design' | 'digital_marketing' | 'strategy' | null;
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
}

export interface Client {
	/** @primaryKey */
	id: string;
	status?: 'active' | 'prospect' | 'inactive' | 'churned';
	sort?: number | null;
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	date_updated?: string | null;
	/** @required */
	name: string;
	slug?: string | null;
	/** @description The organization that owns this client */
	organization?: Organization | string | null;
	logo?: DirectusFile | string | null;
	website?: string | null;
	industry?: string | null;
	primary_contact?: Contact | string | null;
	notes?: string | null;
	tags?: string[] | null;
	/** @description Contacts associated with this client */
	contacts?: Contact[] | string[];
	/** @description Projects for this client */
	projects?: Project[] | string[];
	/** @description Tickets for this client */
	tickets?: Ticket[] | string[];
	/** @description Invoices for this client */
	invoices?: Invoice[] | string[];
	/** @description Org memberships scoped to this client */
	memberships?: OrgMembership[] | string[];
}

export interface OrgRole {
	/** @primaryKey */
	id: string;
	sort?: number | null;
	date_created?: string | null;
	date_updated?: string | null;
	/** @required @description Display name of the role */
	name: string;
	/** @required @description Slug identifier (owner/admin/manager/member/client) */
	slug: 'owner' | 'admin' | 'manager' | 'member' | 'client';
	/** @description System roles cannot be deleted */
	is_system?: boolean;
	/** @description JSON permission matrix — feature × CRUD */
	permissions?: import('./permissions').PermissionMatrix | null;
	/** @description Organization this role belongs to */
	organization?: Organization | string | null;
	/** @description Users assigned this role */
	memberships?: OrgMembership[] | string[];
}

export interface OrgMembership {
	/** @primaryKey */
	id: string;
	/** @description Membership status */
	status: 'active' | 'pending' | 'suspended';
	/** @description When the invitation was sent */
	invited_at?: string | null;
	/** @description When the user accepted the invitation */
	accepted_at?: string | null;
	date_created?: string | null;
	date_updated?: string | null;
	/** @required @description Organization this membership belongs to */
	organization: Organization | string;
	/** @required @description User who holds this membership */
	user: DirectusUser | string;
	/** @required @description The org role assigned to this user */
	role: OrgRole | string;
	/** @description Client scope — only set for client-role users */
	client?: Client | string | null;
	/** @description User who sent the invitation */
	invited_by?: DirectusUser | string | null;
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
	organizations?: ContactsOrganization[] | string[];
	lists?: MailingListContact[] | string[];
}

export interface ContactsOrganization {
	/** @primaryKey */
	id: number;
	contacts_id?: Contact | string | null;
	organizations_id?: Organization | string | null;
	sort?: number | null;
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
	blocks?: TemplateBlock[] | string[];
	organization?: Organization | string | null;
}

export interface FinancialGoal {
	/** @primaryKey */
	id: number;
	/** @required */
	year: number;
	/** @description Q1 revenue target */
	q1_goal?: number | null;
	/** @description Q2 revenue target */
	q2_goal?: number | null;
	/** @description Q3 revenue target */
	q3_goal?: number | null;
	/** @description Q4 revenue target */
	q4_goal?: number | null;
	date_created?: string | null;
	date_updated?: string | null;
	organization?: Organization | string | null;
	user_created?: DirectusUser | string | null;
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
	portfolio?: PortfolioIndustry[] | string[];
	content_blocks?: IndustriesContentBlock[] | string[];
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
	/** @required */
	bill_to: Organization | string;
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
	project?: Project | string | null;
	melio?: string | null;
	/** @required */
	line_items: LineItem[] | string[];
	/** @description The client this invoice is for */
	client?: Client | string | null;
	payments?: PaymentsReceived[] | string[];
}

export interface InvoicesProduct {
	/** @primaryKey */
	id: number;
	invoices_id?: Invoice | string | null;
	products_id?: Product | string | null;
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
	contacts?: MailingListContact[] | string[];
	organization?: Organization | string | null;
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
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	user_updated?: DirectusUser | string | null;
	date_updated?: string | null;
	name?: string | null;
	/** @required */
	slug: string;
	category?: 'header' | 'hero' | `two-column` | `three-column` | 'cta' | 'image' | 'stats' | 'quote' | 'list' | 'divider' | 'social' | 'footer' | 'content' | null;
	description?: string | null;
	mjml_source?: string | null;
	variables_schema?: string | null;
	thumbnail?: DirectusFile | string | null;
	is_system?: boolean | null;
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
	users?: OrganizationsDirectusUser[] | string[];
	projects?: Project[] | string[];
	tickets?: Ticket[] | string[];
	teams?: Team[] | string[];
	clients?: Client[] | string[];
	/** @description Subscription plan tier */
	plan?: 'free' | 'starter' | 'pro' | 'enterprise' | null;
	/** @description Per-org role definitions */
	org_roles?: OrgRole[] | string[];
	/** @description User memberships in this org */
	memberships?: OrgMembership[] | string[];
}

export interface OrganizationsDirectusUser {
	/** @primaryKey */
	id: number;
	organizations_id?: Organization | string | null;
	directus_users_id?: DirectusUser | string | null;
	sort?: number | null;
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
	client?: Organization | string | null;
	caption?: string | null;
	slug?: string | null;
	/** @description Image featured on details page.  If blank, will use first image in images. */
	featured_image?: DirectusFile | string | null;
	parent_id?: Portfolio | string | null;
	hero?: Hero | string | null;
	/** @required */
	url: string;
	images?: PortfolioFile[] | string[];
	projects?: Portfolio[] | string[];
	videos?: Video[] | string[];
	industries?: PortfolioIndustry[] | string[];
	before_and_afters?: PortfolioBeforeAndAfter[] | string[];
	capabilities?: PortfolioCapability[] | string[];
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
	comments?: ProjectEventsComment[] | string[];
	spawned_projects?: Project[] | string[];
	tasks?: ProjectTask[] | string[];
	files?: ProjectEventFile[] | string[];
}

export interface ProjectEventsComment {
	/** @primaryKey */
	id: number;
	project_events_id?: ProjectEvent | string | null;
	comments_id?: Comment | string | null;
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
	events?: ProjectEvent[] | string[];
	assigned_to?: ProjectsDirectusUser[] | string[];
	tickets?: Ticket[] | string[];
	/** @description The client this project is for */
	client?: Client | string | null;
	children?: Project[] | string[];
}

export interface ProjectsDirectusUser {
	/** @primaryKey */
	id: number;
	projects_id?: Project | string | null;
	directus_users_id?: DirectusUser | string | null;
	sort?: number | null;
}

export interface ProjectTask {
	/** @primaryKey */
	id: string;
	status?: 'published' | 'draft' | 'archived';
	sort?: number | null;
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	/** @required */
	event_id: ProjectEvent | string;
	title?: string | null;
	description?: string | null;
	assignee_id?: DirectusUser | string | null;
	completed?: boolean | null;
	completed_at?: string | null;
	completed_by?: DirectusUser | string | null;
	due_date?: string | null;
	priority?: 'low' | 'medium' | 'high' | null;
	watchers?: ProjectTasksWatcher[] | string[];
}

export interface ProjectTasksWatcher {
	/** @primaryKey */
	id: number;
	date_created?: string | null;
	task_id?: ProjectTask | string | null;
	user_id?: DirectusUser | string | null;
	sort?: number | null;
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
}

export interface ProposalsFile {
	/** @primaryKey */
	id: number;
	proposals_id?: string | null;
	directus_files_id?: string | null;
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
	user_created?: string | null;
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
	/** @description Which agency client this account belongs to */
	client_id?: string | null;
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
	social_account: string;
	/** @description Linked post for post-level metrics (null for account-level) */
	social_post?: string | null;
	/** @required */
	snapshot_type: 'account' | 'post';
	/** @description When these metrics were captured @required */
	captured_at: string;
	/** @description Platform-specific metrics object (followers, likes, impressions, etc.) @required */
	metrics: Record<string, any>;
}

export interface SocialClient {
	/** @primaryKey */
	id: string;
	status?: 'published' | 'draft' | 'archived';
	sort?: number | null;
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	user_updated?: DirectusUser | string | null;
	date_updated?: string | null;
	/** @required */
	name: string;
	/** @description URL to client logo image */
	logo_url?: string | null;
	/** @description Primary contact email */
	contact_email?: string | null;
	brand_color?: string | null;
	notes?: string | null;
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
	social_post: string;
	/** @description The account this comment was made on @required */
	social_account: string;
	/** @description Comment ID from the platform @required */
	platform_comment_id: string;
	/** @description User ID of the commenter on the platform @required */
	platform_user_id: string;
	/** @description Commenter username @required */
	username: string;
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
	users?: JunctionDirectusUsersTeam[] | string[];
	projects?: Project[] | string[];
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

export interface Ticket {
	/** @primaryKey */
	id: string;
	status?: 'Pending' | 'Scheduled' | `In Progress` | 'Completed';
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
	files?: TicketsFile[] | string[];
	services?: TicketsService[] | string[];
	assigned_to?: TicketsDirectusUser[] | string[];
	/** @description The client this ticket is for */
	client?: Client | string | null;
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
}

export interface VideoMeeting {
	/** @primaryKey */
	id: string;
	status?: 'scheduled' | 'in_progress' | 'completed' | 'cancelled' | 'no_show' | 'archived' | null;
	sort?: number | null;
	user_created?: string | null;
	date_created?: string | null;
	user_updated?: string | null;
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
	attendees?: VideoMeetingAttendee[] | string[];
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
	ai_openai_allowed_models?: Array<`gpt-4o-mini` | `gpt-4.1-nano` | `gpt-4.1-mini` | `gpt-4.1` | `gpt-5-nano` | `gpt-5-mini` | `gpt-5` | `gpt-5.2` | `gpt-5.2-chat-latest` | `gpt-5.2-pro`> | null;
	ai_anthropic_allowed_models?: Array<`claude-haiku-4-5` | `claude-sonnet-4-5` | `claude-opus-4-5`> | null;
	ai_google_allowed_models?: Array<`gemini-3-pro-preview` | `gemini-3-flash-preview` | `gemini-2.5-pro` | `gemini-2.5-flash`> | null;
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
	organizations?: OrganizationsDirectusUser[] | string[];
	teams?: JunctionDirectusUsersTeam[] | string[];
	policies?: DirectusAccess[] | string[];
	/** @description Per-org memberships with role assignment */
	org_memberships?: OrgMembership[] | string[];
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
}

export interface Schema {
	ai_chat_messages: AiChatMessage[];
	ai_chat_sessions: AiChatSession[];
	ai_preferences: AiPreference[];
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
	blog_files: BlogFile[];
	business_hours: BusinessHour[];
	call_logs: CallLog[];
	call_routes: CallRoute[];
	capabilities: Capability[];
	case_studies: CaseStudy[];
	case_studies_files: CaseStudiesFile[];
	case_studies_services: CaseStudiesService[];
	cd_activities: CdActivity[];
	cd_contacts: CdContact[];
	cd_xp_state: CdXpState[];
	channels: Channel[];
	client_testimonials: ClientTestimonial[];
	comments: Comment[];
	contacts: Contact[];
	contacts_organizations: ContactsOrganization[];
	courses: Course[];
	email_partials: EmailPartial[];
	emails: Email[];
	email_templates: EmailTemplate[];
	financial_goals: FinancialGoal[];
	heros: Hero[];
	home: Home;
	home_files: HomeFile[];
	home_slides: HomeSlide[];
	industries: Industry[];
	industries_content_blocks: IndustriesContentBlock[];
	invoices: Invoice[];
	invoices_products: InvoicesProduct[];
	junction_directus_users_teams: JunctionDirectusUsersTeam[];
	lead_activities: LeadActivity[];
	lead_activities_files: LeadActivitiesFile[];
	leads: Lead[];
	line_items: LineItem[];
	mailing_list_contacts: MailingListContact[];
	mailing_lists: MailingList[];
	meeting_requests: MeetingRequest[];
	menus: Menu[];
	messages: Message[];
	newsletter_blocks: NewsletterBlock[];
	options: Option[];
	organizations: Organization[];
	organizations_directus_users: OrganizationsDirectusUser[];
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
	payments_received: PaymentsReceived[];
	people: People[];
	phone_settings: PhoneSetting[];
	portfolio: Portfolio[];
	portfolio_before_and_afters: PortfolioBeforeAndAfter[];
	portfolio_capabilities: PortfolioCapability[];
	portfolio_files: PortfolioFile[];
	portfolio_industries: PortfolioIndustry[];
	products: Product[];
	project_categories: ProjectCategory[];
	project_event_categories: ProjectEventCategory[];
	project_event_files: ProjectEventFile[];
	project_events: ProjectEvent[];
	project_events_comments: ProjectEventsComment[];
	projects: Project[];
	projects_directus_users: ProjectsDirectusUser[];
	project_tasks: ProjectTask[];
	project_tasks_watchers: ProjectTasksWatcher[];
	prompts: Prompt[];
	proposals: Proposal[];
	proposals_files: ProposalsFile[];
	reactions: Reaction[];
	requests: Request[];
	restaurants: Restaurant[];
	reveal_blocks: RevealBlock[];
	scheduler_settings: SchedulerSetting[];
	services: Service[];
	services_capabilities: ServicesCapability[];
	services_content_blocks: ServicesContentBlock[];
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
	social_activity_log: SocialActivityLog[];
	social_analytics_snapshots: SocialAnalyticsSnapshot[];
	social_clients: SocialClient[];
	social_comments: SocialComment[];
	social_posts: SocialPost[];
	tasks: Task[];
	tasks_directus_users: TasksDirectusUser[];
	teams: Team[];
	template_blocks: TemplateBlock[];
	tickets: Ticket[];
	tickets_comments: TicketsComment[];
	tickets_directus_users: TicketsDirectusUser[];
	tickets_files: TicketsFile[];
	tickets_services: TicketsService[];
	user_presence: UserPresence[];
	video_meeting_attendees: VideoMeetingAttendee[];
	video_meetings: VideoMeeting[];
	videos: Video[];
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
	ai_chat_messages = 'ai_chat_messages',
	ai_chat_sessions = 'ai_chat_sessions',
	ai_preferences = 'ai_preferences',
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
	blog_files = 'blog_files',
	business_hours = 'business_hours',
	call_logs = 'call_logs',
	call_routes = 'call_routes',
	capabilities = 'capabilities',
	case_studies = 'case_studies',
	case_studies_files = 'case_studies_files',
	case_studies_services = 'case_studies_services',
	cd_activities = 'cd_activities',
	cd_contacts = 'cd_contacts',
	cd_xp_state = 'cd_xp_state',
	channels = 'channels',
	client_testimonials = 'client_testimonials',
	comments = 'comments',
	contacts = 'contacts',
	contacts_organizations = 'contacts_organizations',
	courses = 'courses',
	email_partials = 'email_partials',
	emails = 'emails',
	email_templates = 'email_templates',
	financial_goals = 'financial_goals',
	heros = 'heros',
	home = 'home',
	home_files = 'home_files',
	home_slides = 'home_slides',
	industries = 'industries',
	industries_content_blocks = 'industries_content_blocks',
	invoices = 'invoices',
	invoices_products = 'invoices_products',
	junction_directus_users_teams = 'junction_directus_users_teams',
	lead_activities = 'lead_activities',
	lead_activities_files = 'lead_activities_files',
	leads = 'leads',
	line_items = 'line_items',
	mailing_list_contacts = 'mailing_list_contacts',
	mailing_lists = 'mailing_lists',
	meeting_requests = 'meeting_requests',
	menus = 'menus',
	messages = 'messages',
	newsletter_blocks = 'newsletter_blocks',
	options = 'options',
	organizations = 'organizations',
	organizations_directus_users = 'organizations_directus_users',
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
	payments_received = 'payments_received',
	people = 'people',
	phone_settings = 'phone_settings',
	portfolio = 'portfolio',
	portfolio_before_and_afters = 'portfolio_before_and_afters',
	portfolio_capabilities = 'portfolio_capabilities',
	portfolio_files = 'portfolio_files',
	portfolio_industries = 'portfolio_industries',
	products = 'products',
	project_categories = 'project_categories',
	project_event_categories = 'project_event_categories',
	project_event_files = 'project_event_files',
	project_events = 'project_events',
	project_events_comments = 'project_events_comments',
	projects = 'projects',
	projects_directus_users = 'projects_directus_users',
	project_tasks = 'project_tasks',
	project_tasks_watchers = 'project_tasks_watchers',
	prompts = 'prompts',
	proposals = 'proposals',
	proposals_files = 'proposals_files',
	reactions = 'reactions',
	requests = 'requests',
	restaurants = 'restaurants',
	reveal_blocks = 'reveal_blocks',
	scheduler_settings = 'scheduler_settings',
	services = 'services',
	services_capabilities = 'services_capabilities',
	services_content_blocks = 'services_content_blocks',
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
	social_activity_log = 'social_activity_log',
	social_analytics_snapshots = 'social_analytics_snapshots',
	social_clients = 'social_clients',
	social_comments = 'social_comments',
	social_posts = 'social_posts',
	tasks = 'tasks',
	tasks_directus_users = 'tasks_directus_users',
	teams = 'teams',
	template_blocks = 'template_blocks',
	tickets = 'tickets',
	tickets_comments = 'tickets_comments',
	tickets_directus_users = 'tickets_directus_users',
	tickets_files = 'tickets_files',
	tickets_services = 'tickets_services',
	user_presence = 'user_presence',
	video_meeting_attendees = 'video_meeting_attendees',
	video_meetings = 'video_meetings',
	videos = 'videos',
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