# A/B Testing Playbook

## Infrastructure (already built)

| Component | File | What it does |
|-----------|------|-------------|
| Server middleware | `server/middleware/ab-variant.ts` | Assigns `a` or `b` via sticky 30-day cookie on every request |
| Composable | `composables/useABTest.ts` | `isVariantA`, `isVariantB`, `trackEvent()`, `trackPageView()` |
| Cookie | `earnest_ab` | Readable client-side, set server-side, 30-day TTL |
| Analytics | Google Analytics via `nuxt-gtag` | Events include `ab_variant` custom parameter |

## How to preview variants locally

```javascript
// Browser console
document.cookie = "earnest_ab=a; path=/; max-age=2592000"  // Force variant A
document.cookie = "earnest_ab=b; path=/; max-age=2592000"  // Force variant B
document.cookie.match(/earnest_ab=(\w)/)?.[1]              // Check current
```
Refresh after setting.

## How to wire a variant

```vue
<script setup>
const { isVariantA, isVariantB, trackEvent } = useABTest()
</script>

<template>
  <!-- Option 1: Swap entire sections -->
  <HeroA v-if="isVariantA" />
  <HeroB v-else />

  <!-- Option 2: Swap text/props inline -->
  <button @click="trackEvent('cta_click')">
    {{ isVariantA ? 'Start for free' : 'Try 14 days free' }}
  </button>
</template>
```

## How to read results

In Google Analytics:
1. Go to **Explore** → create a new exploration
2. Add dimension: `ab_variant` (custom parameter)
3. Add metrics: event count for `cta_click`, `signup_started`, `signup_completed`
4. Compare variant A vs B conversion rates

Minimum sample: ~200 visitors per variant before drawing conclusions.

---

## Test 1 — Hero Copy + CTA (recommended first test)

### Variant A (current)
```
Kicker:   "The AI-powered business operating system"
Headline: "Earnest."
Tagline:  "Do [good] work."
Subtext:  "Radically simple. One platform. AI that sees everything."
CTA:      "Start for free" / "See how it works"
```

### Variant B (challenger)
```
Kicker:   "One source of truth for your business"
Headline: "Earnest."
Tagline:  "Run your business in [one place]."
Subtext:  "Projects. Invoices. CRM. Marketing. AI. One login. Connected intelligence."
CTA:      "Try 14 days free" / "Watch the demo"
```

### Implementation
In `SellSheet.vue`, wrap the hero section:
```vue
<p class="hero-kicker opacity-0">
  {{ isVariantA ? 'The AI-powered business operating system' : 'One source of truth for your business' }}
</p>
<!-- ... wordmark stays the same ... -->
<p class="hero-tagline opacity-0">
  Do
  <span class="hero-cycle-wrap">
    <span ref="heroCycleRef" class="hero-cycle">
      {{ isVariantA ? 'good' : 'one place' }}
    </span>
  </span>
  {{ isVariantA ? 'work' : '' }}
  <span class="bp">.</span>
</p>
<p class="hero-sub opacity-0">
  <template v-if="isVariantA">
    Radically simple<span class="bp">.</span>
    One platform<span class="bp">.</span>
    AI that sees everything<span class="bp">.</span>
  </template>
  <template v-else>
    Projects<span class="bp">.</span> Invoices<span class="bp">.</span>
    CRM<span class="bp">.</span> Marketing<span class="bp">.</span>
    AI<span class="bp">.</span> One login<span class="bp">.</span>
    Connected intelligence<span class="bp">.</span>
  </template>
</p>
<div class="hero-actions opacity-0">
  <nuxt-link to="/register" class="btn-ink" @click="trackEvent('cta_click', { location: 'hero' })">
    {{ isVariantA ? 'Start for free' : 'Try 14 days free' }}
  </nuxt-link>
  <nuxt-link :to="isVariantA ? '#features' : '#demo'" class="btn-ghost">
    {{ isVariantA ? 'See how it works' : 'Watch the demo' }}
  </nuxt-link>
</div>
```

### Cycle words
- Variant A: `['good', 'great', 'impossible', 'possible', 'simple', 'good']`
- Variant B: `['one place', 'one truth', 'one source', 'one system', 'one place']`

### What to measure
- `sellsheet_view` — page impression (both variants)
- `cta_click` with `location: 'hero'` — primary CTA engagement
- `signup_started` — clicked through to `/register`
- `signup_completed` — finished registration

---

## Test 2 — Social Proof Placement

### Variant A (current)
Testimonials and logos appear **below** the features section, before pricing.

### Variant B (challenger)
Move testimonials **into the hero area** — a single rotating quote immediately below
the hero subtext, before the "See how it works" CTA. Logos move to directly above
pricing as a trust bar.

### Implementation
1. Create a `TestimonialRotator.vue` — auto-cycles through 3 featured testimonials
2. In SellSheet, conditionally render placement:
```vue
<!-- In hero, after subtext -->
<TestimonialRotator v-if="isVariantB" class="hero-testimonial" />

<!-- Before pricing -->
<section v-if="isVariantB" class="logos-section logos-section-above-pricing">
  <!-- logo carousel -->
</section>

<!-- Original position (below features) -->
<section v-if="isVariantA" ref="testimonialsRef" class="testimonials-section">
  <!-- testimonials grid -->
</section>
<section v-if="isVariantA" class="logos-section">
  <!-- logo carousel -->
</section>
```

### What to measure
- `pricing_viewed` — scroll depth reaching the pricing section
- `cta_click` with `location: 'pricing'` — clicked a plan CTA
- Hypothesis: social proof closer to the hero increases trust faster and reduces
  bounce rate before reaching pricing

---

## Test 3 — Pricing Layout

### Variant A (current)
Three vertical plan cards in a row. Studio is "featured" (dark background).

### Variant B (challenger)
Horizontal comparison table with checkmarks. All features listed with a
"✓ All plans" column, then differentiated rows for seats/tokens/scans.
Studio highlighted with a "Most popular" badge.

### Implementation
Create `PricingTable.vue` as an alternative to the current plan cards:
```vue
<template>
  <div class="pricing-table">
    <table>
      <thead>
        <tr>
          <th>Feature</th>
          <th>Solo</th>
          <th class="popular">Studio <span>Most popular</span></th>
          <th>Agency</th>
        </tr>
      </thead>
      <tbody>
        <tr><td>All platform features</td><td>✓</td><td>✓</td><td>✓</td></tr>
        <tr><td>Team seats</td><td>1</td><td>8</td><td>15</td></tr>
        <tr><td>AI tokens/mo</td><td>100K</td><td>400K</td><td>1M</td></tr>
        <!-- ... -->
      </tbody>
    </table>
  </div>
</template>
```

Then in SellSheet:
```vue
<div v-if="isVariantA" class="plans-grid"><!-- current cards --></div>
<PricingTable v-else />
```

### What to measure
- `pricing_viewed` — reached pricing section
- `cta_click` with `plan: 'solo|studio|agency'` — which plan CTA was clicked
- Hypothesis: comparison table reduces decision paralysis for multi-tool
  evaluators who want to see "do I get everything?"

---

## Test 4 — CTA Color

### Variant A (current)
Primary CTA: dark ink background (`var(--ink)`) → accent on hover.

### Variant B (challenger)
Primary CTA: accent background (`var(--accent)`) → darker on hover.
More visually aggressive — tests whether the editorial restraint of the
current design is helping or hurting conversions.

### Implementation
```vue
<nuxt-link
  to="/register"
  :class="isVariantA ? 'btn-ink' : 'btn-accent'"
>
```

Add CSS:
```css
.btn-accent {
  background: var(--accent);
  color: white;
  /* same padding/font as btn-ink */
}
.btn-accent:hover {
  filter: brightness(1.15);
}
```

### What to measure
- `cta_click` across all CTA locations (hero, pricing, footer)
- Hypothesis: accent color draws more attention but may feel less premium

---

## Execution Order

1. **Hero Copy + CTA** — highest leverage, easiest to implement, tests the
   fundamental value proposition framing
2. **Social Proof Placement** — tests whether trust signals earlier in the
   page reduce bounce rate
3. **Pricing Layout** — tests decision-making UX for the conversion moment
4. **CTA Color** — micro-optimization, run after the bigger tests settle

Run each test for **2–4 weeks** with at least 400 total visitors (200 per
variant) before declaring a winner. Don't run multiple tests simultaneously
on the same page — results will be confounded.

## Adding new variants beyond A/B

To run A/B/C tests, update:
1. `server/middleware/ab-variant.ts` — change random assignment to support 3+ variants
2. `composables/useABTest.ts` — add `isVariantC` computed
3. Cookie format stays the same: `earnest_ab=c`

Keep it simple. Two variants is almost always enough.
