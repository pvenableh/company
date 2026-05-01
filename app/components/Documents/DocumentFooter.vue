<script setup lang="ts">
const props = withDefaults(defineProps<{ hidden?: boolean }>(), { hidden: false });
</script>

<template>
	<footer v-if="!hidden" class="doc__footer">
		<a
			href="https://earnest.guru"
			target="_blank"
			rel="noopener noreferrer"
			class="doc__powered-by"
		>
			Powered by Earnest.
		</a>
	</footer>
</template>

<style scoped>
.doc__footer {
	margin-top: 3rem;
	padding-top: 1rem;
	display: flex;
	justify-content: center;
	border-top: 1px solid rgba(0, 0, 0, 0.04);
}

.doc__powered-by {
	font-size: 9px;
	letter-spacing: 0.06em;
	text-transform: uppercase;
	color: rgba(0, 0, 0, 0.32);
	text-decoration: none;
	font-weight: 400;
	transition: color 0.15s ease;
}

.doc__powered-by:hover {
	color: rgba(0, 0, 0, 0.6);
}

:global(.dark) .doc__footer {
	border-top-color: rgba(255, 255, 255, 0.06);
}
:global(.dark) .doc__powered-by {
	color: rgba(255, 255, 255, 0.3);
}
:global(.dark) .doc__powered-by:hover {
	color: rgba(255, 255, 255, 0.6);
}

@media print {
	.doc__footer {
		page-break-inside: avoid;
		break-inside: avoid;
	}
}
</style>
