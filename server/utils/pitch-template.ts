/**
 * pitch-template.ts — deterministic, org-themed HTML renderer for AI-generated
 * pitch pages. Pure (no I/O): takes the LLM's structured content + a small
 * settings object + the org theme, and returns ONE self-contained standalone
 * HTML document (inline CSS, a Google-Fonts <link> that the publish ingest
 * self-hosts). The design quality lives here, not in the model — the model only
 * supplies copy, so every generated pitch reads as the same editorial system.
 *
 * Image-optional by design: sections use a typographic / accent-gradient
 * treatment, so a pitch with zero images never looks unfinished.
 */

// ── Public types ─────────────────────────────────────────────────────────────
export type PitchMode = 'dark' | 'light';
export type PitchFont = 'serif' | 'sans';
export type PitchTitleStyle = 'editorial' | 'bold' | 'minimal';

export interface PitchSettings {
  mode: PitchMode;
  accent: string; // hex; validated
  font: PitchFont;
  titleStyle: PitchTitleStyle;
}

export interface PitchThemeSource {
  document_theme?: string | null;
  document_accent?: string | null;
  document_theme_config?: Record<string, any> | null;
}

export interface PitchOrg {
  name: string;
  website?: string | null;
  whitelabel?: boolean | null;
}

interface Item { title?: string; body?: string }
interface Qa { q?: string; a?: string }
export interface PitchSection {
  kind: string;
  eyebrow?: string | null;
  headline?: string;
  subhead?: string | null;
  cta_label?: string | null;
  heading?: string;
  items?: Item[];
  points?: Item[];
  steps?: Item[];
  body?: string;
  bullets?: string[];
  qa?: Qa[];
  button_label?: string | null;
}
export interface PitchContent {
  title?: string;
  client_name?: string | null;
  sections?: PitchSection[];
  facts_used?: string[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const HEX = /^#[0-9a-fA-F]{6}$/;

/** Resolve the effective settings: per-pitch overrides win over org defaults. */
export function resolvePitchSettings(partial: Partial<PitchSettings> | null | undefined, theme: PitchThemeSource): PitchSettings {
  const orgAccent = theme?.document_accent && HEX.test(theme.document_accent) ? theme.document_accent : '#c8963e';
  const p = partial || {};
  return {
    mode: p.mode === 'light' ? 'light' : 'dark',
    accent: p.accent && HEX.test(p.accent) ? p.accent : orgAccent,
    font: p.font === 'sans' ? 'sans' : 'serif',
    titleStyle: p.titleStyle === 'bold' || p.titleStyle === 'minimal' ? p.titleStyle : 'editorial',
  };
}

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Minimal, safe markdown: **bold**, *italic*, and paragraph breaks. Input is
 *  escaped FIRST, so no raw HTML from the model can survive. */
function mdLite(s: unknown): string {
  const escaped = esc(s);
  return escaped
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, '$1<em>$2</em>')
    .split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');
}

/** Readable text color (black/white) for text placed on the accent fill. */
function onAccent(hex: string): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? '#111111' : '#ffffff';
}

const sectionByKind = (sections: PitchSection[], kind: string) =>
  sections.find((s) => (s.kind || '').toLowerCase() === kind);

// ── Section renderers ────────────────────────────────────────────────────────
function renderHero(s: PitchSection): string {
  const eyebrow = s.eyebrow ? `<div class="eyebrow">${esc(s.eyebrow)}</div>` : '';
  const sub = s.subhead ? `<p class="hero-sub">${esc(s.subhead)}</p>` : '';
  const cta = s.cta_label ? `<a class="btn" href="#inquire">${esc(s.cta_label)}</a>` : '';
  return `<header class="hero"><div class="wrap">
    ${eyebrow}
    <h1 class="hero-title">${esc(s.headline || '')}</h1>
    ${sub}
    ${cta ? `<div class="hero-cta">${cta}</div>` : ''}
  </div></header>`;
}

function renderCards(s: PitchSection, cls: string): string {
  const list = (s.items || s.points || []).filter((i) => i && (i.title || i.body));
  if (!list.length) return '';
  const cards = list.map((i) => `<div class="card">
    ${i.title ? `<h3>${esc(i.title)}</h3>` : ''}
    ${i.body ? `<div class="card-body">${mdLite(i.body)}</div>` : ''}
  </div>`).join('');
  return `<section class="band"><div class="wrap">
    ${s.heading ? `<h2 class="band-title">${esc(s.heading)}</h2>` : ''}
    <div class="${cls}">${cards}</div>
  </div></section>`;
}

function renderTailored(s: PitchSection): string {
  const bullets = (s.bullets || []).filter(Boolean);
  const body = s.body ? mdLite(s.body) : '';
  const list = bullets.length ? `<ul class="checks">${bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>` : '';
  if (!body && !list && !s.heading) return '';
  return `<section class="band accent-band"><div class="wrap narrow">
    ${s.heading ? `<h2 class="band-title">${esc(s.heading)}</h2>` : ''}
    ${body}
    ${list}
  </div></section>`;
}

function renderProcess(s: PitchSection): string {
  const steps = (s.steps || s.items || []).filter((i) => i && (i.title || i.body));
  if (!steps.length) return '';
  const rows = steps.map((st, i) => `<div class="step">
    <div class="step-n">${String(i + 1).padStart(2, '0')}</div>
    <div class="step-c">${st.title ? `<h3>${esc(st.title)}</h3>` : ''}${st.body ? `<div>${mdLite(st.body)}</div>` : ''}</div>
  </div>`).join('');
  return `<section class="band"><div class="wrap narrow">
    ${s.heading ? `<h2 class="band-title">${esc(s.heading)}</h2>` : ''}
    <div class="steps">${rows}</div>
  </div></section>`;
}

function renderFaq(s: PitchSection): string {
  const qa = (s.qa || []).filter((x) => x && (x.q || x.a));
  if (!qa.length) return '';
  const rows = qa.map((x) => `<div class="faq-row">
    <div class="faq-q">${esc(x.q || '')}</div>
    <div class="faq-a">${mdLite(x.a || '')}</div>
  </div>`).join('');
  return `<section class="band"><div class="wrap narrow">
    ${s.heading ? `<h2 class="band-title">${esc(s.heading)}</h2>` : ''}
    <div class="faq">${rows}</div>
  </div></section>`;
}

function renderCta(s: PitchSection, orgName: string): string {
  const btn = s.button_label ? esc(s.button_label) : 'Start the conversation';
  return `<section class="band cta-band" id="inquire"><div class="wrap narrow center">
    <h2 class="band-title">${esc(s.heading || "Let's talk")}</h2>
    ${s.body ? `<div class="cta-body">${mdLite(s.body)}</div>` : ''}
    <a class="btn big" href="#inquire">${btn}</a>
    <p class="cta-org">${esc(orgName)}</p>
  </div></section>`;
}

// ── Main ─────────────────────────────────────────────────────────────────────
export function renderPitchHtml(args: {
  content: PitchContent;
  settings: PitchSettings;
  org: PitchOrg;
  theme?: PitchThemeSource;
}): string {
  const { content, settings, org } = args;
  const sections = Array.isArray(content.sections) ? content.sections : [];

  // Palette
  const accent = settings.accent;
  const accentText = onAccent(accent);
  const dark = settings.mode === 'dark';
  const bg = dark ? '#0c0c0e' : '#faf9f7';
  const surface = dark ? '#131317' : '#ffffff';
  const fg = dark ? '#eceae6' : '#1a1a1e';
  const muted = dark ? '#9a978f' : '#6b6a66';
  const rule = dark ? 'rgba(255,255,255,.10)' : 'rgba(0,0,0,.10)';

  // Fonts (ingest self-hosts these). Serif setting = serif heading + sans body;
  // sans setting = Inter throughout.
  const headFont = settings.font === 'serif'
    ? "'Source Serif 4', Georgia, serif"
    : "'Inter', system-ui, sans-serif";
  const bodyFont = "'Inter', system-ui, -apple-system, sans-serif";
  const fontLink = 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&display=swap';

  // Title style
  const heroWeight = settings.titleStyle === 'bold' ? '700' : settings.titleStyle === 'minimal' ? '300' : '400';
  const heroTransform = settings.titleStyle === 'bold' ? 'uppercase' : 'none';
  const heroTracking = settings.titleStyle === 'bold' ? '.01em' : settings.titleStyle === 'minimal' ? '-.01em' : '-.02em';
  const heroSize = settings.titleStyle === 'minimal' ? 'clamp(30px,5.4vw,62px)' : 'clamp(34px,6.2vw,78px)';

  const footer = org.whitelabel ? '' : '<div class="made">Made with Earnest</div>';

  const body = [
    sectionByKind(sections, 'hero') && renderHero(sectionByKind(sections, 'hero')!),
    sectionByKind(sections, 'offerings') && renderCards(sectionByKind(sections, 'offerings')!, 'grid grid-3'),
    sectionByKind(sections, 'proof') && renderCards(sectionByKind(sections, 'proof')!, 'grid grid-2'),
    sectionByKind(sections, 'tailored') && renderTailored(sectionByKind(sections, 'tailored')!),
    sectionByKind(sections, 'process') && renderProcess(sectionByKind(sections, 'process')!),
    sectionByKind(sections, 'faq') && renderFaq(sectionByKind(sections, 'faq')!),
    sectionByKind(sections, 'cta') && renderCta(sectionByKind(sections, 'cta')!, org.name),
  ].filter(Boolean).join('\n');

  const title = esc(content.title || `${org.name} — Pitch`);

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta name="robots" content="noindex, nofollow">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="${fontLink}" rel="stylesheet">
<style>
:root{--bg:${bg};--surface:${surface};--fg:${fg};--muted:${muted};--rule:${rule};--accent:${accent};--accent-text:${accentText};--fh:${headFont};--fb:${bodyFont};}
*{box-sizing:border-box;}
html{scroll-behavior:smooth;}
body{margin:0;background:var(--bg);color:var(--fg);font-family:var(--fb);font-weight:400;line-height:1.65;-webkit-font-smoothing:antialiased;}
.wrap{max-width:1080px;margin:0 auto;padding:0 32px;}
.narrow{max-width:760px;}
.center{text-align:center;}
h1,h2,h3{font-family:var(--fh);margin:0;font-weight:400;line-height:1.1;}
p{margin:0 0 1em;}
a{color:inherit;}
.eyebrow{font-size:11px;letter-spacing:.24em;text-transform:uppercase;color:var(--accent);font-weight:600;margin-bottom:22px;}
/* hero */
.hero{position:relative;padding:118px 0 96px;overflow:hidden;border-bottom:1px solid var(--rule);}
.hero::before{content:"";position:absolute;inset:0;pointer-events:none;background:radial-gradient(60% 70% at 78% 8%, color-mix(in srgb, var(--accent) 20%, transparent), transparent 70%);}
.hero .wrap{position:relative;}
.hero-title{font-size:${heroSize};font-weight:${heroWeight};letter-spacing:${heroTracking};text-transform:${heroTransform};max-width:16ch;}
.hero-sub{margin-top:28px;font-size:19px;color:var(--muted);max-width:56ch;}
.hero-cta{margin-top:40px;}
/* buttons */
.btn{display:inline-block;background:var(--accent);color:var(--accent-text);text-decoration:none;font-weight:600;font-size:13px;letter-spacing:.04em;padding:15px 30px;border-radius:999px;transition:transform .2s ease,opacity .2s ease;}
.btn:hover{transform:translateY(-1px);opacity:.92;}
.btn.big{font-size:14px;padding:17px 38px;margin-top:14px;}
/* bands */
.band{padding:88px 0;border-bottom:1px solid var(--rule);}
.band-title{font-size:clamp(24px,3.4vw,38px);letter-spacing:-.015em;margin-bottom:44px;}
.accent-band{background:color-mix(in srgb, var(--accent) 7%, var(--bg));}
/* grids */
.grid{display:grid;gap:1px;background:var(--rule);border:1px solid var(--rule);border-radius:16px;overflow:hidden;}
.grid-3{grid-template-columns:repeat(3,1fr);} .grid-2{grid-template-columns:repeat(2,1fr);}
.card{background:var(--surface);padding:30px 28px;}
.card h3{font-size:19px;margin-bottom:12px;}
.card-body,.card-body p{color:var(--muted);font-size:15px;margin:0;}
/* tailored */
.checks{list-style:none;margin:22px 0 0;padding:0;}
.checks li{position:relative;padding:11px 0 11px 30px;border-top:1px solid var(--rule);font-size:15.5px;}
.checks li::before{content:"";position:absolute;left:2px;top:17px;width:9px;height:9px;border-radius:50%;background:var(--accent);}
/* process */
.steps{display:grid;gap:2px;}
.step{display:grid;grid-template-columns:64px 1fr;gap:22px;padding:24px 0;border-top:1px solid var(--rule);align-items:start;}
.step-n{font-family:var(--fh);font-size:26px;color:var(--accent);}
.step-c h3{font-size:18px;margin-bottom:8px;} .step-c div,.step-c p{color:var(--muted);font-size:15px;margin:0;}
/* faq */
.faq-row{padding:22px 0;border-top:1px solid var(--rule);}
.faq-q{font-family:var(--fh);font-size:18px;margin-bottom:8px;}
.faq-a,.faq-a p{color:var(--muted);font-size:15px;margin:0;}
/* cta */
.cta-band{background:var(--accent);color:var(--accent-text);border:0;}
.cta-band .band-title,.cta-band .cta-body,.cta-band .cta-body p{color:var(--accent-text);}
.cta-body{max-width:52ch;margin:0 auto 8px;opacity:.92;}
.cta-band .btn{background:var(--accent-text);color:var(--accent);}
.cta-org{margin-top:30px;font-size:12px;letter-spacing:.2em;text-transform:uppercase;opacity:.7;}
/* footer */
.made{padding:40px 0;text-align:center;font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:var(--muted);}
@media(max-width:720px){
  .grid-3,.grid-2{grid-template-columns:1fr;}
  .hero{padding:88px 0 68px;} .band{padding:60px 0;} .band-title{margin-bottom:32px;}
  .wrap{padding:0 22px;} .step{grid-template-columns:44px 1fr;gap:14px;}
}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto;} .btn{transition:none;}}
</style>
</head>
<body>
${body}
${footer}
</body></html>`;
}
