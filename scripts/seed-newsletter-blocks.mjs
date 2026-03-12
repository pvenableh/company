/**
 * Seed the newsletter_blocks collection with the standard block library.
 * Run with: node scripts/seed-newsletter-blocks.mjs
 *
 * Reads DIRECTUS_URL and DIRECTUS_STATIC_TOKEN from .env automatically.
 * You can also set them as environment variables to override.
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// Load .env file (same as dotenv-cli used by other scripts)
const __dirname = dirname(fileURLToPath(import.meta.url));
try {
  const envPath = resolve(__dirname, '..', '.env');
  const envFile = readFileSync(envPath, 'utf-8');
  for (const line of envFile.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    // Don't override existing env vars
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
} catch {
  // .env file not found — rely on environment variables
}

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
const STATIC_TOKEN = process.env.DIRECTUS_STATIC_TOKEN;

if (!STATIC_TOKEN) {
  console.error('Error: DIRECTUS_STATIC_TOKEN is not set.');
  console.error('Set it in your .env file or pass it as an environment variable.');
  process.exit(1);
}

console.log(`Using Directus at: ${DIRECTUS_URL}`);
console.log('');

const headers = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${STATIC_TOKEN}`,
};

const BLOCKS = [
  // ─── HEADERS ─────────────────────────────────────────────────────
  {
    name: 'Header — Logo Centered',
    slug: 'header-logo-center',
    category: 'header',
    is_system: true,
    description: 'Simple centered logo header',
    mjml_source: `<mj-section background-color="{{{bg_color}}}" padding="24px 30px">
  <mj-column>
    <mj-image src="{{{logo_url}}}" width="{{{logo_width}}}" alt="{{{org_name}}}" align="center" href="{{{site_url}}}" />
  </mj-column>
</mj-section>`,
    variables_schema: [
      { key: 'bg_color', label: 'Background Color', type: 'color', default: '#ffffff' },
      { key: 'logo_url', label: 'Logo Image URL', type: 'image', required: true },
      { key: 'logo_width', label: 'Logo Width', type: 'text', default: '160px' },
      { key: 'org_name', label: 'Organization Name', type: 'text', default: 'Your Organization' },
      { key: 'site_url', label: 'Site URL', type: 'url', default: 'https://yourdomain.com' },
    ],
  },
  {
    name: 'Header — Logo + Nav',
    slug: 'header-logo-nav',
    category: 'header',
    is_system: true,
    description: 'Logo on left, navigation links on right',
    mjml_source: `<mj-section background-color="{{{bg_color}}}" padding="16px 30px">
  <mj-column width="40%">
    <mj-image src="{{{logo_url}}}" width="{{{logo_width}}}" alt="{{{org_name}}}" align="left" href="{{{site_url}}}" />
  </mj-column>
  <mj-column width="60%">
    <mj-text align="right" font-size="13px" color="{{{nav_color}}}">
      <a href="{{{nav_link_1_url}}}" style="color:{{{nav_color}}};text-decoration:none;margin-left:16px;">{{{nav_link_1_label}}}</a>
      <a href="{{{nav_link_2_url}}}" style="color:{{{nav_color}}};text-decoration:none;margin-left:16px;">{{{nav_link_2_label}}}</a>
      <a href="{{{nav_link_3_url}}}" style="color:{{{nav_color}}};text-decoration:none;margin-left:16px;">{{{nav_link_3_label}}}</a>
    </mj-text>
  </mj-column>
</mj-section>`,
    variables_schema: [
      { key: 'bg_color', label: 'Background Color', type: 'color', default: '#ffffff' },
      { key: 'logo_url', label: 'Logo URL', type: 'image', required: true },
      { key: 'logo_width', label: 'Logo Width', type: 'text', default: '140px' },
      { key: 'org_name', label: 'Org Name', type: 'text', default: 'Your Org' },
      { key: 'site_url', label: 'Site URL', type: 'url', default: '#' },
      { key: 'nav_color', label: 'Nav Text Color', type: 'color', default: '#333333' },
      { key: 'nav_link_1_label', label: 'Nav Link 1 Label', type: 'text', default: 'About' },
      { key: 'nav_link_1_url', label: 'Nav Link 1 URL', type: 'url', default: '#' },
      { key: 'nav_link_2_label', label: 'Nav Link 2 Label', type: 'text', default: 'Blog' },
      { key: 'nav_link_2_url', label: 'Nav Link 2 URL', type: 'url', default: '#' },
      { key: 'nav_link_3_label', label: 'Nav Link 3 Label', type: 'text', default: 'Contact' },
      { key: 'nav_link_3_url', label: 'Nav Link 3 URL', type: 'url', default: '#' },
    ],
  },

  // ─── HEROES ──────────────────────────────────────────────────────
  {
    name: 'Hero — Image Overlay',
    slug: 'hero-image-overlay',
    category: 'hero',
    is_system: true,
    description: 'Full-width background image with text and CTA',
    mjml_source: `<mj-section background-url="{{{image_url}}}" background-size="cover" background-position="center" padding="80px 30px">
  <mj-column>
    <mj-text align="{{{text_align}}}" font-size="36px" font-weight="bold" color="{{{headline_color}}}" line-height="1.2" padding-bottom="12px">{{{headline}}}</mj-text>
    <mj-text align="{{{text_align}}}" font-size="17px" color="{{{subheadline_color}}}" padding-bottom="24px">{{{subheadline}}}</mj-text>
    <mj-button background-color="{{{button_bg}}}" color="{{{button_color}}}" border-radius="4px" font-size="15px" font-weight="600" padding="14px 32px" href="{{{button_url}}}" align="{{{text_align}}}">{{{button_label}}}</mj-button>
  </mj-column>
</mj-section>`,
    variables_schema: [
      { key: 'image_url', label: 'Background Image URL', type: 'image', required: true },
      { key: 'headline', label: 'Headline', type: 'text', required: true, default: 'Your Headline Here' },
      { key: 'subheadline', label: 'Subheadline', type: 'text', default: 'Supporting message goes here' },
      { key: 'headline_color', label: 'Headline Color', type: 'color', default: '#ffffff' },
      { key: 'subheadline_color', label: 'Subheadline Color', type: 'color', default: '#eeeeee' },
      { key: 'text_align', label: 'Text Alignment', type: 'text', default: 'center' },
      { key: 'button_label', label: 'Button Label', type: 'text', default: 'Learn More' },
      { key: 'button_url', label: 'Button URL', type: 'url', default: '#' },
      { key: 'button_bg', label: 'Button Color', type: 'color', default: '#ffffff' },
      { key: 'button_color', label: 'Button Text Color', type: 'color', default: '#000000' },
    ],
  },
  {
    name: 'Hero — Color Background',
    slug: 'hero-color-bg',
    category: 'hero',
    is_system: true,
    description: 'Solid color background with eyebrow, headline, body, and CTA',
    mjml_source: `<mj-section background-color="{{{bg_color}}}" padding="60px 40px">
  <mj-column>
    <mj-text align="center" font-size="13px" font-weight="600" color="{{{eyebrow_color}}}" letter-spacing="2px" text-transform="uppercase" padding-bottom="12px">{{{eyebrow}}}</mj-text>
    <mj-text align="center" font-size="38px" font-weight="bold" color="{{{headline_color}}}" line-height="1.2" padding-bottom="16px">{{{headline}}}</mj-text>
    <mj-text align="center" font-size="17px" color="{{{body_color}}}" line-height="1.7" padding-bottom="28px">{{{body}}}</mj-text>
    <mj-button background-color="{{{button_bg}}}" color="{{{button_color}}}" border-radius="4px" padding="14px 36px" font-size="15px" font-weight="600" href="{{{button_url}}}" align="center">{{{button_label}}}</mj-button>
  </mj-column>
</mj-section>`,
    variables_schema: [
      { key: 'bg_color', label: 'Background Color', type: 'color', default: '#1a1a1a' },
      { key: 'eyebrow', label: 'Eyebrow Label', type: 'text', default: 'Newsletter' },
      { key: 'eyebrow_color', label: 'Eyebrow Color', type: 'color', default: '#888888' },
      { key: 'headline', label: 'Headline', type: 'text', required: true, default: 'Your Big Headline' },
      { key: 'headline_color', label: 'Headline Color', type: 'color', default: '#ffffff' },
      { key: 'body', label: 'Body Text', type: 'text', default: 'Supporting paragraph text here.' },
      { key: 'body_color', label: 'Body Color', type: 'color', default: '#cccccc' },
      { key: 'button_label', label: 'Button Label', type: 'text', default: 'Get Started' },
      { key: 'button_url', label: 'Button URL', type: 'url', default: '#' },
      { key: 'button_bg', label: 'Button Color', type: 'color', default: '#ffffff' },
      { key: 'button_color', label: 'Button Text Color', type: 'color', default: '#000000' },
    ],
  },

  // ─── CONTENT ─────────────────────────────────────────────────────
  {
    name: 'Content — Text Block',
    slug: 'content-text',
    category: 'content',
    is_system: true,
    description: 'Simple heading + body text section',
    mjml_source: `<mj-section background-color="{{{bg_color}}}" padding="40px 30px">
  <mj-column>
    <mj-text font-size="22px" font-weight="700" color="{{{heading_color}}}" padding-bottom="12px">{{{heading}}}</mj-text>
    <mj-text font-size="15px" color="{{{body_color}}}" line-height="1.8">{{{body}}}</mj-text>
  </mj-column>
</mj-section>`,
    variables_schema: [
      { key: 'bg_color', label: 'Background Color', type: 'color', default: '#ffffff' },
      { key: 'heading', label: 'Section Heading', type: 'text', default: 'Section Heading' },
      { key: 'heading_color', label: 'Heading Color', type: 'color', default: '#111111' },
      {
        key: 'body',
        label: 'Body Text (HTML allowed)',
        type: 'html',
        required: true,
        default: '<p>Your content here.</p>',
      },
      { key: 'body_color', label: 'Body Color', type: 'color', default: '#444444' },
    ],
  },
  {
    name: 'Content — Personalized',
    slug: 'content-personalized',
    category: 'content',
    is_system: true,
    description: 'Greeting with first name + body text',
    mjml_source: `<mj-section background-color="{{{bg_color}}}" padding="40px 30px">
  <mj-column>
    <mj-text font-size="22px" font-weight="700" color="{{{heading_color}}}" padding-bottom="12px">{{{heading}}}</mj-text>
    <mj-text font-size="15px" color="{{{body_color}}}" line-height="1.8" padding-bottom="20px">Hi {{first_name}}, {{{intro}}}</mj-text>
    <mj-text font-size="15px" color="{{{body_color}}}" line-height="1.8">{{{body}}}</mj-text>
  </mj-column>
</mj-section>`,
    variables_schema: [
      { key: 'bg_color', label: 'Background Color', type: 'color', default: '#ffffff' },
      { key: 'heading', label: 'Heading', type: 'text', default: 'A personal note' },
      { key: 'heading_color', label: 'Heading Color', type: 'color', default: '#111111' },
      {
        key: 'intro',
        label: "Intro (after 'Hi [first_name],')",
        type: 'text',
        default: 'we wanted to share something with you.',
      },
      { key: 'body', label: 'Body', type: 'html', default: '<p>Your content here.</p>' },
      { key: 'body_color', label: 'Body Color', type: 'color', default: '#444444' },
    ],
  },

  // ─── TWO COLUMN ──────────────────────────────────────────────────
  {
    name: 'Two Column — Text + Image',
    slug: 'two-column-text-image',
    category: 'two-column',
    is_system: true,
    description: 'Text on left, image on right with CTA',
    mjml_source: `<mj-section background-color="{{{bg_color}}}" padding="40px 30px">
  <mj-column width="55%" vertical-align="middle">
    <mj-text font-size="22px" font-weight="700" color="{{{heading_color}}}" padding-bottom="12px">{{{heading}}}</mj-text>
    <mj-text font-size="15px" color="{{{body_color}}}" line-height="1.8" padding-bottom="20px">{{{body}}}</mj-text>
    <mj-button background-color="{{{button_bg}}}" color="{{{button_color}}}" href="{{{button_url}}}" border-radius="4px" padding="12px 28px" font-size="14px" align="left">{{{button_label}}}</mj-button>
  </mj-column>
  <mj-column width="45%" vertical-align="middle">
    <mj-image src="{{{image_url}}}" border-radius="{{{image_radius}}}" alt="{{{image_alt}}}" />
  </mj-column>
</mj-section>`,
    variables_schema: [
      { key: 'bg_color', label: 'Background Color', type: 'color', default: '#ffffff' },
      { key: 'heading', label: 'Heading', type: 'text', required: true },
      { key: 'heading_color', label: 'Heading Color', type: 'color', default: '#111111' },
      { key: 'body', label: 'Body', type: 'html', required: true },
      { key: 'body_color', label: 'Body Color', type: 'color', default: '#444444' },
      { key: 'button_label', label: 'Button Label', type: 'text', default: 'Learn More' },
      { key: 'button_url', label: 'Button URL', type: 'url', default: '#' },
      { key: 'button_bg', label: 'Button Color', type: 'color', default: '#000000' },
      { key: 'button_color', label: 'Button Text Color', type: 'color', default: '#ffffff' },
      { key: 'image_url', label: 'Image URL', type: 'image', required: true },
      { key: 'image_alt', label: 'Image Alt Text', type: 'text', default: '' },
      { key: 'image_radius', label: 'Image Border Radius', type: 'text', default: '0px' },
    ],
  },

  // ─── THREE COLUMN ────────────────────────────────────────────────
  {
    name: 'Three Column — Cards',
    slug: 'three-column-cards',
    category: 'three-column',
    is_system: true,
    description: 'Three image cards with titles, body text, and links',
    mjml_source: `<mj-section background-color="{{{bg_color}}}" padding="40px 20px">
  <mj-column padding="0 8px">
    <mj-image src="{{{card1_image}}}" alt="{{{card1_title}}}" border-radius="4px 4px 0 0" />
    <mj-text font-size="16px" font-weight="700" color="{{{card_heading_color}}}" padding="20px 0 8px 0">{{{card1_title}}}</mj-text>
    <mj-text font-size="14px" color="{{{card_body_color}}}" line-height="1.6" padding-bottom="16px">{{{card1_body}}}</mj-text>
    <mj-text font-size="13px" font-weight="600"><a href="{{{card1_url}}}" style="color:{{{link_color}}};text-decoration:none;">{{{card1_link_label}}} &rarr;</a></mj-text>
  </mj-column>
  <mj-column padding="0 8px">
    <mj-image src="{{{card2_image}}}" alt="{{{card2_title}}}" border-radius="4px 4px 0 0" />
    <mj-text font-size="16px" font-weight="700" color="{{{card_heading_color}}}" padding="20px 0 8px 0">{{{card2_title}}}</mj-text>
    <mj-text font-size="14px" color="{{{card_body_color}}}" line-height="1.6" padding-bottom="16px">{{{card2_body}}}</mj-text>
    <mj-text font-size="13px" font-weight="600"><a href="{{{card2_url}}}" style="color:{{{link_color}}};text-decoration:none;">{{{card2_link_label}}} &rarr;</a></mj-text>
  </mj-column>
  <mj-column padding="0 8px">
    <mj-image src="{{{card3_image}}}" alt="{{{card3_title}}}" border-radius="4px 4px 0 0" />
    <mj-text font-size="16px" font-weight="700" color="{{{card_heading_color}}}" padding="20px 0 8px 0">{{{card3_title}}}</mj-text>
    <mj-text font-size="14px" color="{{{card_body_color}}}" line-height="1.6" padding-bottom="16px">{{{card3_body}}}</mj-text>
    <mj-text font-size="13px" font-weight="600"><a href="{{{card3_url}}}" style="color:{{{link_color}}};text-decoration:none;">{{{card3_link_label}}} &rarr;</a></mj-text>
  </mj-column>
</mj-section>`,
    variables_schema: [
      { key: 'bg_color', label: 'Background Color', type: 'color', default: '#ffffff' },
      { key: 'card_heading_color', label: 'Card Heading Color', type: 'color', default: '#111111' },
      { key: 'card_body_color', label: 'Card Body Color', type: 'color', default: '#555555' },
      { key: 'link_color', label: 'Link Color', type: 'color', default: '#000000' },
      { key: 'card1_image', label: 'Card 1 Image', type: 'image', required: true },
      { key: 'card1_title', label: 'Card 1 Title', type: 'text', default: 'Card Title' },
      { key: 'card1_body', label: 'Card 1 Body', type: 'text', default: 'Card description text.' },
      { key: 'card1_url', label: 'Card 1 URL', type: 'url', default: '#' },
      { key: 'card1_link_label', label: 'Card 1 Link Label', type: 'text', default: 'Read more' },
      { key: 'card2_image', label: 'Card 2 Image', type: 'image', required: true },
      { key: 'card2_title', label: 'Card 2 Title', type: 'text', default: 'Card Title' },
      { key: 'card2_body', label: 'Card 2 Body', type: 'text', default: 'Card description text.' },
      { key: 'card2_url', label: 'Card 2 URL', type: 'url', default: '#' },
      { key: 'card2_link_label', label: 'Card 2 Link Label', type: 'text', default: 'Read more' },
      { key: 'card3_image', label: 'Card 3 Image', type: 'image', required: true },
      { key: 'card3_title', label: 'Card 3 Title', type: 'text', default: 'Card Title' },
      { key: 'card3_body', label: 'Card 3 Body', type: 'text', default: 'Card description text.' },
      { key: 'card3_url', label: 'Card 3 URL', type: 'url', default: '#' },
      { key: 'card3_link_label', label: 'Card 3 Link Label', type: 'text', default: 'Read more' },
    ],
  },

  // ─── CTA ─────────────────────────────────────────────────────────
  {
    name: 'CTA — Centered',
    slug: 'cta-centered',
    category: 'cta',
    is_system: true,
    description: 'Centered call-to-action with heading, body, button, and optional note',
    mjml_source: `<mj-section background-color="{{{bg_color}}}" padding="50px 40px">
  <mj-column>
    <mj-text align="center" font-size="28px" font-weight="700" color="{{{heading_color}}}" padding-bottom="12px">{{{heading}}}</mj-text>
    <mj-text align="center" font-size="16px" color="{{{body_color}}}" line-height="1.7" padding-bottom="28px">{{{body}}}</mj-text>
    <mj-button background-color="{{{button_bg}}}" color="{{{button_color}}}" border-radius="4px" padding="16px 40px" font-size="16px" font-weight="700" href="{{{button_url}}}" align="center" inner-padding="16px 40px">{{{button_label}}}</mj-button>
    <mj-text align="center" font-size="12px" color="{{{note_color}}}" padding-top="12px">{{{note}}}</mj-text>
  </mj-column>
</mj-section>`,
    variables_schema: [
      { key: 'bg_color', label: 'Background Color', type: 'color', default: '#f8f8f8' },
      { key: 'heading', label: 'Heading', type: 'text', required: true, default: 'Ready to get started?' },
      { key: 'heading_color', label: 'Heading Color', type: 'color', default: '#111111' },
      { key: 'body', label: 'Body', type: 'text', default: 'Join thousands of others who trust us.' },
      { key: 'body_color', label: 'Body Color', type: 'color', default: '#555555' },
      { key: 'button_label', label: 'Button Label', type: 'text', required: true, default: 'Get Started Free' },
      { key: 'button_url', label: 'Button URL', type: 'url', required: true, default: '#' },
      { key: 'button_bg', label: 'Button Color', type: 'color', default: '#000000' },
      { key: 'button_color', label: 'Button Text Color', type: 'color', default: '#ffffff' },
      { key: 'note', label: 'Fine Print / Note', type: 'text', default: '' },
      { key: 'note_color', label: 'Note Color', type: 'color', default: '#aaaaaa' },
    ],
  },

  // ─── IMAGE ───────────────────────────────────────────────────────
  {
    name: 'Image — Full Width',
    slug: 'image-full-width',
    category: 'image',
    is_system: true,
    description: 'Full-width image with optional caption and link',
    mjml_source: `<mj-section background-color="{{{bg_color}}}" padding="{{{padding}}}">
  <mj-column>
    <mj-image src="{{{image_url}}}" alt="{{{image_alt}}}" border-radius="{{{border_radius}}}" href="{{{link_url}}}" />
    <mj-text align="center" font-size="12px" color="{{{caption_color}}}" padding-top="8px">{{{caption}}}</mj-text>
  </mj-column>
</mj-section>`,
    variables_schema: [
      { key: 'bg_color', label: 'Background', type: 'color', default: '#ffffff' },
      { key: 'image_url', label: 'Image URL', type: 'image', required: true },
      { key: 'image_alt', label: 'Alt Text', type: 'text', default: '' },
      { key: 'link_url', label: 'Link URL (optional)', type: 'url', default: '' },
      { key: 'caption', label: 'Caption (optional)', type: 'text', default: '' },
      { key: 'caption_color', label: 'Caption Color', type: 'color', default: '#999999' },
      { key: 'border_radius', label: 'Border Radius', type: 'text', default: '0px' },
      { key: 'padding', label: 'Section Padding', type: 'text', default: '0px' },
    ],
  },

  // ─── STATS ───────────────────────────────────────────────────────
  {
    name: 'Stats — Three Numbers',
    slug: 'stats-row',
    category: 'stats',
    is_system: true,
    description: 'Three large numbers with labels in a row',
    mjml_source: `<mj-section background-color="{{{bg_color}}}" padding="40px 20px">
  <mj-column padding="0 10px">
    <mj-text align="center" font-size="40px" font-weight="800" color="{{{number_color}}}" padding-bottom="4px">{{{stat1_number}}}</mj-text>
    <mj-text align="center" font-size="14px" color="{{{label_color}}}" font-weight="600" text-transform="uppercase" letter-spacing="1px">{{{stat1_label}}}</mj-text>
  </mj-column>
  <mj-column padding="0 10px">
    <mj-text align="center" font-size="40px" font-weight="800" color="{{{number_color}}}" padding-bottom="4px">{{{stat2_number}}}</mj-text>
    <mj-text align="center" font-size="14px" color="{{{label_color}}}" font-weight="600" text-transform="uppercase" letter-spacing="1px">{{{stat2_label}}}</mj-text>
  </mj-column>
  <mj-column padding="0 10px">
    <mj-text align="center" font-size="40px" font-weight="800" color="{{{number_color}}}" padding-bottom="4px">{{{stat3_number}}}</mj-text>
    <mj-text align="center" font-size="14px" color="{{{label_color}}}" font-weight="600" text-transform="uppercase" letter-spacing="1px">{{{stat3_label}}}</mj-text>
  </mj-column>
</mj-section>`,
    variables_schema: [
      { key: 'bg_color', label: 'Background Color', type: 'color', default: '#ffffff' },
      { key: 'number_color', label: 'Number Color', type: 'color', default: '#111111' },
      { key: 'label_color', label: 'Label Color', type: 'color', default: '#888888' },
      { key: 'stat1_number', label: 'Stat 1 Number', type: 'text', default: '100+' },
      { key: 'stat1_label', label: 'Stat 1 Label', type: 'text', default: 'Customers' },
      { key: 'stat2_number', label: 'Stat 2 Number', type: 'text', default: '50K' },
      { key: 'stat2_label', label: 'Stat 2 Label', type: 'text', default: 'Emails Sent' },
      { key: 'stat3_number', label: 'Stat 3 Number', type: 'text', default: '99%' },
      { key: 'stat3_label', label: 'Stat 3 Label', type: 'text', default: 'Uptime' },
    ],
  },

  // ─── QUOTE ───────────────────────────────────────────────────────
  {
    name: 'Quote — Testimonial',
    slug: 'quote-testimonial',
    category: 'quote',
    is_system: true,
    description: 'Centered quote with author name, title, and optional avatar',
    mjml_source: `<mj-section background-color="{{{bg_color}}}" padding="50px 40px">
  <mj-column>
    <mj-text align="center" font-size="48px" color="{{{quote_mark_color}}}" line-height="1" padding-bottom="4px" font-weight="700">&ldquo;</mj-text>
    <mj-text align="center" font-size="20px" font-style="italic" color="{{{quote_color}}}" line-height="1.6" padding-bottom="20px">{{{quote_text}}}</mj-text>
    <mj-text align="center" font-size="15px" font-weight="700" color="{{{name_color}}}" padding-bottom="2px">{{{author_name}}}</mj-text>
    <mj-text align="center" font-size="13px" color="{{{title_color}}}">{{{author_title}}}</mj-text>
  </mj-column>
</mj-section>`,
    variables_schema: [
      { key: 'bg_color', label: 'Background Color', type: 'color', default: '#f9f9f9' },
      { key: 'quote_text', label: 'Quote Text', type: 'text', required: true },
      { key: 'quote_color', label: 'Quote Color', type: 'color', default: '#222222' },
      { key: 'quote_mark_color', label: 'Quote Mark Color', type: 'color', default: '#dddddd' },
      { key: 'author_name', label: 'Author Name', type: 'text', required: true },
      { key: 'name_color', label: 'Name Color', type: 'color', default: '#111111' },
      { key: 'author_title', label: 'Author Title / Company', type: 'text', default: '' },
      { key: 'title_color', label: 'Title Color', type: 'color', default: '#888888' },
    ],
  },

  // ─── LIST ────────────────────────────────────────────────────────
  {
    name: 'List — Checklist',
    slug: 'list-checklist',
    category: 'list',
    is_system: true,
    description: 'Heading + intro + 5-item checklist with checkmarks',
    mjml_source: `<mj-section background-color="{{{bg_color}}}" padding="40px 30px">
  <mj-column>
    <mj-text font-size="22px" font-weight="700" color="{{{heading_color}}}" padding-bottom="16px">{{{heading}}}</mj-text>
    <mj-text font-size="15px" color="{{{body_color}}}" line-height="1.8">{{{intro}}}</mj-text>
    <mj-table font-size="15px" color="{{{item_color}}}" line-height="1.8" padding-top="8px">
      <tr><td style="padding:6px 12px 6px 0;vertical-align:top;font-size:18px;color:{{{check_color}}};">&#10003;</td><td style="padding:6px 0;">{{{item1}}}</td></tr>
      <tr><td style="padding:6px 12px 6px 0;vertical-align:top;font-size:18px;color:{{{check_color}}};">&#10003;</td><td style="padding:6px 0;">{{{item2}}}</td></tr>
      <tr><td style="padding:6px 12px 6px 0;vertical-align:top;font-size:18px;color:{{{check_color}}};">&#10003;</td><td style="padding:6px 0;">{{{item3}}}</td></tr>
      <tr><td style="padding:6px 12px 6px 0;vertical-align:top;font-size:18px;color:{{{check_color}}};">&#10003;</td><td style="padding:6px 0;">{{{item4}}}</td></tr>
      <tr><td style="padding:6px 12px 6px 0;vertical-align:top;font-size:18px;color:{{{check_color}}};">&#10003;</td><td style="padding:6px 0;">{{{item5}}}</td></tr>
    </mj-table>
  </mj-column>
</mj-section>`,
    variables_schema: [
      { key: 'bg_color', label: 'Background Color', type: 'color', default: '#ffffff' },
      { key: 'heading', label: 'Heading', type: 'text', default: 'What you get' },
      { key: 'heading_color', label: 'Heading Color', type: 'color', default: '#111111' },
      { key: 'intro', label: 'Intro Text', type: 'text', default: '' },
      { key: 'body_color', label: 'Intro Color', type: 'color', default: '#444444' },
      { key: 'item_color', label: 'Item Color', type: 'color', default: '#333333' },
      { key: 'check_color', label: 'Checkmark Color', type: 'color', default: '#22c55e' },
      { key: 'item1', label: 'Item 1', type: 'text', default: 'First benefit' },
      { key: 'item2', label: 'Item 2', type: 'text', default: 'Second benefit' },
      { key: 'item3', label: 'Item 3', type: 'text', default: 'Third benefit' },
      { key: 'item4', label: 'Item 4', type: 'text', default: 'Fourth benefit' },
      { key: 'item5', label: 'Item 5', type: 'text', default: 'Fifth benefit' },
    ],
  },

  // ─── DIVIDERS ────────────────────────────────────────────────────
  {
    name: 'Divider — Line',
    slug: 'divider-line',
    category: 'divider',
    is_system: true,
    description: 'Horizontal line divider',
    mjml_source: `<mj-section background-color="{{{bg_color}}}" padding="{{{padding}}}">
  <mj-column>
    <mj-divider border-color="{{{line_color}}}" border-width="{{{line_width}}}" border-style="{{{line_style}}}" width="{{{line_width_pct}}}" />
  </mj-column>
</mj-section>`,
    variables_schema: [
      { key: 'bg_color', label: 'Background Color', type: 'color', default: '#ffffff' },
      { key: 'line_color', label: 'Line Color', type: 'color', default: '#eeeeee' },
      { key: 'line_width', label: 'Line Thickness', type: 'text', default: '1px' },
      { key: 'line_style', label: 'Line Style (solid/dashed/dotted)', type: 'text', default: 'solid' },
      { key: 'line_width_pct', label: 'Line Width %', type: 'text', default: '80%' },
      { key: 'padding', label: 'Section Padding', type: 'text', default: '8px 30px' },
    ],
  },
  {
    name: 'Divider — Spacer',
    slug: 'divider-spacer',
    category: 'divider',
    is_system: true,
    description: 'Empty space divider',
    mjml_source: `<mj-section background-color="{{{bg_color}}}" padding="{{{height}}} 0">
  <mj-column>
    <mj-text color="{{{bg_color}}}" font-size="1px"> </mj-text>
  </mj-column>
</mj-section>`,
    variables_schema: [
      { key: 'bg_color', label: 'Background Color', type: 'color', default: '#ffffff' },
      { key: 'height', label: 'Height', type: 'text', default: '20px' },
    ],
  },

  // ─── SOCIAL ──────────────────────────────────────────────────────
  {
    name: 'Social — Links Row',
    slug: 'social-links',
    category: 'social',
    is_system: true,
    description: 'Centered social media icon links',
    mjml_source: `<mj-section background-color="{{{bg_color}}}" padding="24px 30px">
  <mj-column>
    <mj-text align="center" font-size="13px" color="{{{label_color}}}" padding-bottom="12px" font-weight="600">{{{label}}}</mj-text>
    <mj-social align="center" icon-size="24px" mode="horizontal">
      <mj-social-element name="instagram" href="{{{instagram_url}}}" background-color="transparent" color="{{{icon_color}}}"></mj-social-element>
      <mj-social-element name="linkedin" href="{{{linkedin_url}}}" background-color="transparent" color="{{{icon_color}}}"></mj-social-element>
      <mj-social-element name="twitter" href="{{{twitter_url}}}" background-color="transparent" color="{{{icon_color}}}"></mj-social-element>
    </mj-social>
  </mj-column>
</mj-section>`,
    variables_schema: [
      { key: 'bg_color', label: 'Background Color', type: 'color', default: '#ffffff' },
      { key: 'label', label: 'Label', type: 'text', default: 'Follow Us' },
      { key: 'label_color', label: 'Label Color', type: 'color', default: '#333333' },
      { key: 'icon_color', label: 'Icon Color', type: 'color', default: '#333333' },
      { key: 'instagram_url', label: 'Instagram URL', type: 'url', default: '#' },
      { key: 'linkedin_url', label: 'LinkedIn URL', type: 'url', default: '#' },
      { key: 'twitter_url', label: 'Twitter/X URL', type: 'url', default: '#' },
    ],
  },

  // ─── FOOTERS ─────────────────────────────────────────────────────
  {
    name: 'Footer — Standard',
    slug: 'footer-standard',
    category: 'footer',
    is_system: true,
    description: 'Logo, address, copyright, unsubscribe, and privacy links',
    mjml_source: `<mj-section background-color="{{{bg_color}}}" padding="32px 30px">
  <mj-column>
    <mj-image src="{{{logo_url}}}" width="{{{logo_width}}}" align="center" padding-bottom="16px" href="{{{site_url}}}" />
    <mj-text align="center" font-size="13px" color="{{{text_color}}}" line-height="1.7" padding-bottom="12px">{{{address}}}</mj-text>
    <mj-divider border-color="{{{divider_color}}}" border-width="1px" width="60%" padding="8px 0" />
    <mj-text align="center" font-size="12px" color="{{{muted_color}}}" line-height="1.7" padding-top="8px">&copy; {{year}} {{{org_name}}}. All rights reserved.<br /><a href="{{{unsubscribe_url}}}" style="color:{{{muted_color}}};text-decoration:underline;">Unsubscribe</a>&nbsp;&middot;&nbsp;<a href="{{{privacy_url}}}" style="color:{{{muted_color}}};text-decoration:underline;">Privacy Policy</a></mj-text>
  </mj-column>
</mj-section>`,
    variables_schema: [
      { key: 'bg_color', label: 'Background Color', type: 'color', default: '#f4f4f4' },
      { key: 'logo_url', label: 'Logo URL', type: 'image', default: '' },
      { key: 'logo_width', label: 'Logo Width', type: 'text', default: '120px' },
      { key: 'site_url', label: 'Site URL', type: 'url', default: '#' },
      { key: 'address', label: 'Mailing Address', type: 'text', default: '123 Main St, City, State 00000' },
      { key: 'org_name', label: 'Organization Name', type: 'text', required: true },
      { key: 'text_color', label: 'Text Color', type: 'color', default: '#666666' },
      { key: 'muted_color', label: 'Muted Text Color', type: 'color', default: '#aaaaaa' },
      { key: 'divider_color', label: 'Divider Color', type: 'color', default: '#dddddd' },
      { key: 'unsubscribe_url', label: 'Unsubscribe URL', type: 'url', default: '#unsubscribe' },
      { key: 'privacy_url', label: 'Privacy Policy URL', type: 'url', default: '#privacy' },
    ],
  },
  {
    name: 'Footer — Minimal',
    slug: 'footer-minimal',
    category: 'footer',
    is_system: true,
    description: 'Simple one-line copyright + unsubscribe link',
    mjml_source: `<mj-section background-color="{{{bg_color}}}" padding="24px 30px">
  <mj-column>
    <mj-text align="center" font-size="12px" color="{{{text_color}}}" line-height="1.8">&copy; {{year}} {{{org_name}}} &middot; <a href="{{{unsubscribe_url}}}" style="color:{{{text_color}}};text-decoration:underline;">Unsubscribe</a></mj-text>
  </mj-column>
</mj-section>`,
    variables_schema: [
      { key: 'bg_color', label: 'Background Color', type: 'color', default: '#f4f4f4' },
      { key: 'org_name', label: 'Organization Name', type: 'text', required: true },
      { key: 'text_color', label: 'Text Color', type: 'color', default: '#aaaaaa' },
      { key: 'unsubscribe_url', label: 'Unsubscribe URL', type: 'url', default: '#unsubscribe' },
    ],
  },
];

// ─── DEFAULT EMAIL PARTIALS ──────────────────────────────────────────────────

const PARTIALS = [
  {
    name: 'Web Version Bar',
    slug: 'web-version-bar-default',
    type: 'web_version_bar',
    is_default: true,
    description: 'Small bar at the top of every email with a link to view in browser',
    mjml_source: `<mj-section background-color="#f4f4f4" padding="8px 30px">
  <mj-column>
    <mj-text align="center" font-size="11px" color="#999999" line-height="1.4">
      Having trouble viewing this email? <a href="{{web_view_url}}" style="color:#999999;text-decoration:underline;">View in your browser</a>
    </mj-text>
  </mj-column>
</mj-section>`,
    variables_schema: [],
    instance_variables: {},
  },
  {
    name: 'Default Header',
    slug: 'header-default',
    type: 'header',
    is_default: true,
    description: 'Default centered logo header attached to all newsletters',
    mjml_source: `<mj-section background-color="{{{bg_color}}}" padding="24px 30px">
  <mj-column>
    <mj-image src="{{{logo_url}}}" width="{{{logo_width}}}" alt="{{{org_name}}}" align="center" href="{{{site_url}}}" />
  </mj-column>
</mj-section>`,
    variables_schema: [
      { key: 'bg_color', label: 'Background Color', type: 'color', default: '#ffffff' },
      { key: 'logo_url', label: 'Logo Image URL', type: 'image', default: '' },
      { key: 'logo_width', label: 'Logo Width', type: 'text', default: '160px' },
      { key: 'org_name', label: 'Organization Name', type: 'text', default: 'Your Organization' },
      { key: 'site_url', label: 'Site URL', type: 'url', default: 'https://yourdomain.com' },
    ],
    instance_variables: {
      bg_color: '#ffffff',
      logo_url: '',
      logo_width: '160px',
      org_name: 'Your Organization',
      site_url: 'https://yourdomain.com',
    },
  },
  {
    name: 'Default Footer',
    slug: 'footer-default',
    type: 'footer',
    is_default: true,
    description: 'Default footer with copyright, unsubscribe, and privacy links',
    mjml_source: `<mj-section background-color="{{{bg_color}}}" padding="32px 30px">
  <mj-column>
    <mj-text align="center" font-size="13px" color="{{{text_color}}}" line-height="1.7" padding-bottom="12px">{{{address}}}</mj-text>
    <mj-divider border-color="{{{divider_color}}}" border-width="1px" width="60%" padding="8px 0" />
    <mj-text align="center" font-size="12px" color="{{{muted_color}}}" line-height="1.7" padding-top="8px">&copy; {{year}} {{{org_name}}}. All rights reserved.<br /><a href="{{unsubscribe_url}}" style="color:{{{muted_color}}};text-decoration:underline;">Unsubscribe</a>&nbsp;&middot;&nbsp;<a href="{{{privacy_url}}}" style="color:{{{muted_color}}};text-decoration:underline;">Privacy Policy</a></mj-text>
  </mj-column>
</mj-section>`,
    variables_schema: [
      { key: 'bg_color', label: 'Background Color', type: 'color', default: '#f4f4f4' },
      { key: 'address', label: 'Mailing Address', type: 'text', default: '123 Main St, City, State 00000' },
      { key: 'org_name', label: 'Organization Name', type: 'text', default: 'Your Organization' },
      { key: 'text_color', label: 'Text Color', type: 'color', default: '#666666' },
      { key: 'muted_color', label: 'Muted Text Color', type: 'color', default: '#aaaaaa' },
      { key: 'divider_color', label: 'Divider Color', type: 'color', default: '#dddddd' },
      { key: 'privacy_url', label: 'Privacy Policy URL', type: 'url', default: '#privacy' },
    ],
    instance_variables: {
      bg_color: '#f4f4f4',
      address: '123 Main St, City, State 00000',
      org_name: 'Your Organization',
      text_color: '#666666',
      muted_color: '#aaaaaa',
      divider_color: '#dddddd',
      privacy_url: '#privacy',
    },
  },
];

async function seedPartials() {
  console.log(`\nSeeding ${PARTIALS.length} email partials...`);
  console.log('');

  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const partial of PARTIALS) {
    try {
      const existingRes = await fetch(
        `${DIRECTUS_URL}/items/email_partials?filter[slug][_eq]=${encodeURIComponent(partial.slug)}&limit=1`,
        { headers },
      );
      const existing = await existingRes.json();

      if (existing?.data?.length > 0) {
        console.log(`  [skip] "${partial.name}" (already exists)`);
        skipped++;
        continue;
      }

      // Directus stores variables_schema and instance_variables as JSON text fields
      const payload = {
        ...partial,
        status: 'published',
        variables_schema: JSON.stringify(partial.variables_schema),
        instance_variables: JSON.stringify(partial.instance_variables),
      };

      const result = await fetch(`${DIRECTUS_URL}/items/email_partials`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      }).then((r) => r.json());

      if (result.data?.id) {
        console.log(`  [ok]   Created: ${partial.name} (id: ${result.data.id})`);
        created++;
      } else {
        console.error(`  [fail] ${partial.name}:`, JSON.stringify(result.errors || result));
        failed++;
      }
    } catch (err) {
      console.error(`  [fail] ${partial.name}:`, err.message);
      failed++;
    }
  }

  console.log('');
  console.log(`Partials — Created: ${created}, Skipped: ${skipped}, Failed: ${failed}`);
}

async function seedBlocks() {
  console.log(`Seeding ${BLOCKS.length} blocks to ${DIRECTUS_URL}...`);
  console.log('');

  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const block of BLOCKS) {
    try {
      // Check if slug already exists
      const existingRes = await fetch(
        `${DIRECTUS_URL}/items/newsletter_blocks?filter[slug][_eq]=${encodeURIComponent(block.slug)}&limit=1`,
        { headers },
      );
      const existing = await existingRes.json();

      if (existing?.data?.length > 0) {
        console.log(`  [skip] "${block.name}" (already exists)`);
        skipped++;
        continue;
      }

      // Directus stores variables_schema as a JSON text field — stringify before sending
      // Omit category from initial POST to avoid broken dropdown validation,
      // then set it via PATCH afterward.
      const { category, ...blockWithoutCategory } = block;
      const payload = {
        ...blockWithoutCategory,
        status: 'published',
        variables_schema: JSON.stringify(block.variables_schema),
      };

      const result = await fetch(`${DIRECTUS_URL}/items/newsletter_blocks`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      }).then((r) => r.json());

      if (result.data?.id) {
        // Set category via PATCH (bypasses dropdown POST validation)
        if (category) {
          await fetch(`${DIRECTUS_URL}/items/newsletter_blocks/${result.data.id}`, {
            method: 'PATCH',
            headers,
            body: JSON.stringify({ category }),
          });
        }
        console.log(`  [ok]   Created: ${block.name} (id: ${result.data.id})`);
        created++;
      } else {
        console.error(`  [fail] ${block.name}:`, JSON.stringify(result.errors || result));
        failed++;
      }
    } catch (err) {
      console.error(`  [fail] ${block.name}:`, err.message);
      failed++;
    }
  }

  console.log('');
  console.log(`Done. Created: ${created}, Skipped: ${skipped}, Failed: ${failed}`);
}

/**
 * Fix variables_schema field: change from varchar(255) to text so it can
 * hold the full JSON-stringified variable definitions.
 */
async function fixVariablesSchemaField() {
  console.log('Fixing variables_schema field (varchar(255) → text)...');

  try {
    // Delete the varchar(255) field
    const delRes = await fetch(`${DIRECTUS_URL}/fields/newsletter_blocks/variables_schema`, {
      method: 'DELETE',
      headers,
    });
    if (!delRes.ok) {
      console.error('  Could not delete field:', await delRes.text());
      return;
    }

    // Recreate as text (no max_length)
    const createRes = await fetch(`${DIRECTUS_URL}/fields/newsletter_blocks`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        field: 'variables_schema',
        type: 'text',
        schema: { is_nullable: true, default_value: null },
        meta: {
          interface: 'input-multiline',
          display: 'raw',
          validation: null,
          validation_message: null,
        },
      }),
    });
    const createData = await createRes.json();
    if (createRes.ok) {
      console.log('  Recreated variables_schema as text — OK');
    } else {
      console.error('  Failed to recreate:', JSON.stringify(createData.errors || createData));
    }
  } catch (err) {
    console.error('  Error:', err.message);
  }

  console.log('');
}

async function seedAll() {
  await fixVariablesSchemaField();
  await seedBlocks();
  await seedPartials();
}

seedAll().catch(console.error);
