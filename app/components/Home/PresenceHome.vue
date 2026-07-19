<script setup lang="ts">
/**
 * <HomePresenceHome> — the calm, conversational landing (opt-in via home_mode).
 *
 * Calm first, density on demand: login lands here — Earnest's soft presence, one
 * honest read of the day, the single next move, and a conversation to start from.
 * The full command center lives one gesture below (the host renders it, revealed
 * on scroll or the "Everything" affordance) — never hidden, never forced.
 *
 * Light-theme, app-native. The read is deterministic + instant (passed in); the
 * conversation is the embedded LLM (emits `ask` → the host opens Earnest with it).
 */
const props = defineProps<{
	greeting: string;
	subtitle?: string;
	/** The honest one-line read of the day (feedSynthesis). */
	read?: string;
	/** The single most important thing right now. */
	topAction?: {
		title: string;
		description?: string;
		actionLabel?: string;
	} | null;
}>();

const emit = defineEmits<{
	ask: [prompt: string];
	openTop: [];
	reveal: [];
}>();

const input = ref('');
const openers = [
	'What should I start with?',
	"What needs me today?",
	'Draft my morning',
];

function send(text?: string) {
	const t = (text ?? input.value).trim();
	if (!t) return;
	input.value = '';
	emit('ask', t);
}
function onKeydown(e: KeyboardEvent) {
	if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
}
</script>

<template>
	<section class="ph">
		<!-- soft living presence behind everything -->
		<div class="ph__glow" aria-hidden="true" />

		<div class="ph__inner">
			<div class="ph__mark">
				<EarnestPresenceMark :height="26" class="text-foreground/85" />
			</div>

			<h1 class="ph__greeting">{{ greeting }}</h1>
			<p v-if="read" class="ph__read">{{ read }}</p>
			<p v-else-if="subtitle" class="ph__read ph__read--soft">{{ subtitle }}</p>

			<!-- the single next move -->
			<button v-if="topAction" type="button" class="ph__top" @click="emit('openTop')">
				<span class="ph__top-eyebrow">The one thing</span>
				<span class="ph__top-title">{{ topAction.title }}</span>
				<span v-if="topAction.description" class="ph__top-desc">{{ topAction.description }}</span>
				<Icon name="lucide:arrow-right" class="ph__top-arrow w-4 h-4" />
			</button>

			<!-- the conversation -->
			<div class="ph__composer">
				<textarea
					v-model="input"
					rows="1"
					class="ph__input"
					placeholder="Tell Earnest what's on your mind, or just start…"
					@keydown="onKeydown"
				/>
				<button
					type="button"
					class="ph__send"
					:disabled="!input.trim()"
					aria-label="Ask Earnest"
					@click="send()"
				>
					<Icon name="lucide:arrow-up" class="w-4 h-4" />
				</button>
			</div>
			<div class="ph__openers">
				<button v-for="o in openers" :key="o" type="button" class="ph__opener" @click="send(o)">{{ o }}</button>
			</div>

			<!-- reach for everything -->
			<button type="button" class="ph__reveal" @click="emit('reveal')">
				Everything
				<Icon name="lucide:chevron-down" class="w-3.5 h-3.5" />
			</button>
		</div>
	</section>
</template>

<style scoped>
.ph {
	position: relative;
	display: flex; justify-content: center;
	padding: clamp(28px, 7vh, 84px) 20px clamp(20px, 4vh, 40px);
	overflow: hidden;
}
.ph__glow {
	position: absolute; left: 50%; top: -10%;
	width: min(760px, 120%); height: 520px;
	transform: translateX(-50%);
	background: radial-gradient(circle at 50% 40%, hsl(var(--primary) / 0.16), transparent 62%);
	filter: blur(20px);
	animation: ph-breathe 7s ease-in-out infinite;
	pointer-events: none;
}
@keyframes ph-breathe {
	0%, 100% { opacity: 0.75; transform: translateX(-50%) scale(1); }
	50% { opacity: 1; transform: translateX(-50%) scale(1.06); }
}

.ph__inner {
	position: relative; z-index: 1;
	width: 100%; max-width: 620px;
	display: flex; flex-direction: column; align-items: center; text-align: center;
	gap: 14px;
}
.ph__mark { opacity: 0.9; margin-bottom: 2px; }

.ph__greeting {
	margin: 0;
	font-family: 'Iowan Old Style', Palatino, Georgia, serif;
	font-size: clamp(26px, 4.4vw, 40px); font-weight: 600; line-height: 1.1;
	color: hsl(var(--foreground)); text-wrap: balance;
}
.ph__read {
	margin: 0; max-width: 30ch;
	font-family: 'Iowan Old Style', Palatino, Georgia, serif;
	font-size: clamp(15px, 2.2vw, 18px); line-height: 1.5;
	color: hsl(var(--muted-foreground)); text-wrap: balance;
}
.ph__read--soft { font-style: italic; }

.ph__top {
	position: relative; width: 100%; max-width: 460px; margin-top: 6px;
	display: grid; gap: 3px; text-align: left;
	padding: 15px 44px 15px 18px; border-radius: 18px;
	border: 1px solid hsl(var(--border)); background: hsl(var(--card));
	box-shadow: 0 8px 30px -18px hsl(var(--foreground) / 0.25);
	cursor: pointer; transition: transform 0.15s ease, box-shadow 0.2s ease;
}
.ph__top:hover { transform: translateY(-1px); box-shadow: 0 12px 34px -16px hsl(var(--foreground) / 0.3); }
.ph__top-eyebrow { font-size: 10px; letter-spacing: 0.16em; text-transform: uppercase; color: hsl(var(--primary)); }
.ph__top-title { font-size: 15px; font-weight: 600; color: hsl(var(--foreground)); }
.ph__top-desc { font-size: 13px; color: hsl(var(--muted-foreground)); }
.ph__top-arrow { position: absolute; right: 16px; top: 50%; transform: translateY(-50%); color: hsl(var(--muted-foreground)); }

.ph__composer {
	width: 100%; max-width: 520px; margin-top: 10px;
	display: flex; align-items: flex-end; gap: 8px;
	padding: 8px 8px 8px 16px; border-radius: 999px;
	border: 1px solid hsl(var(--border)); background: hsl(var(--background));
	box-shadow: 0 10px 34px -20px hsl(var(--foreground) / 0.3);
}
.ph__input {
	flex: 1; resize: none; border: 0; background: transparent; outline: none;
	font: inherit; font-size: 15px; line-height: 1.5; padding: 8px 0; max-height: 120px;
	color: hsl(var(--foreground));
}
.ph__input::placeholder { color: hsl(var(--muted-foreground) / 0.7); }
.ph__send {
	flex: none; width: 38px; height: 38px; border-radius: 50%; border: 0; cursor: pointer;
	display: grid; place-items: center; color: hsl(var(--primary-foreground)); background: hsl(var(--primary));
	transition: transform 0.15s ease, opacity 0.2s ease;
}
.ph__send:hover:not(:disabled) { transform: scale(1.06); }
.ph__send:disabled { opacity: 0.4; cursor: default; }

.ph__openers { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; }
.ph__opener {
	padding: 7px 14px; border-radius: 999px; border: 1px solid hsl(var(--border));
	background: hsl(var(--card)); color: hsl(var(--muted-foreground));
	font: inherit; font-size: 13px; cursor: pointer;
	transition: background 0.2s ease, color 0.2s ease, border-color 0.2s ease;
}
.ph__opener:hover { background: hsl(var(--primary) / 0.06); border-color: hsl(var(--primary) / 0.35); color: hsl(var(--foreground)); }

.ph__reveal {
	margin-top: 16px; display: inline-flex; align-items: center; gap: 4px;
	padding: 6px 14px; border-radius: 999px; border: 0; background: transparent;
	color: hsl(var(--muted-foreground)); font: inherit; font-size: 12px;
	letter-spacing: 0.05em; text-transform: uppercase; cursor: pointer;
	transition: color 0.2s ease;
}
.ph__reveal:hover { color: hsl(var(--foreground)); }

@media (prefers-reduced-motion: reduce) {
	.ph__glow { animation: none; }
}
</style>
