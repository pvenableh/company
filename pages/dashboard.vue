<script setup>
const { user } = useDirectusAuth();

definePageMeta({
	middleware: ['auth'],
});
</script>
<template>
	<div
		class="relative w-full bg-center bg-contain xl:bg-cover bg-no-repeat min-h-screen flex items-center justify-center flex-col home"
	>
		<p v-if="user.value"><{{ user.value }}/p></p>
	</div>
</template>

<style>
.home {
	/* background-color: rgba(0,0,0,0.35);
    background-blend-mode: darken; */
	.building {
		max-width: 350px;

		@media (min-width: theme('screens.sm')) {
			max-width: 575px;
		}

		@media (min-width: theme('screens.md')) {
			max-width: 575px;
		}

		@media (min-width: theme('screens.lg')) {
			max-width: 600px;
		}
	}

	.temp-heading {
		font-size: 12px;
		/* background: linear-gradient(-45deg, #cccccc, #666666);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent; */
		bottom: 0px;
		/* color: #cccccc; */
		@apply uppercase tracking-wide;
		max-width: 400px;

		@media (min-width: theme('screens.md')) {
			max-width: 400px;
		}

		@media (min-width: theme('screens.lg')) {
			max-width: 440px;
		}
	}

	.logo {
		max-width: 400px;
		@apply px-6 mt-8;

		/* filter: drop-shadow(0 0.2rem 0.25rem rgba(0, 0, 0, 0.5)); */
		@media (min-width: theme('screens.md')) {
			max-width: 400px;
		}

		@media (min-width: theme('screens.lg')) {
			max-width: 600px;
		}

		path {
			opacity: 0.4;
			animation-name: example;
			animation-duration: 5s;
			animation-timing-function: var(--curve);
			animation-iteration-count: infinite;
		}

		path:nth-of-type(1) {
			animation-delay: 0.1s;
		}

		path:nth-of-type(2) {
			animation-delay: 0.2s;
		}

		path:nth-of-type(3) {
			animation-delay: 0.3s;
		}

		path:nth-of-type(4) {
			animation-delay: 0.4s;
		}

		path:nth-of-type(5) {
			animation-delay: 0.5s;
		}

		path:nth-of-type(6) {
			animation-delay: 0.6s;
		}

		path:nth-of-type(7) {
			animation-delay: 0.7s;
		}

		path:nth-of-type(8) {
			animation-delay: 0.8s;
		}

		path:nth-of-type(9) {
			animation-delay: 0.9s;
		}

		path:nth-of-type(10) {
			animation-delay: 1s;
		}

		path:nth-of-type(11) {
			animation-delay: 1.1s;
		}

		path:nth-of-type(12) {
			animation-delay: 1.2s;
		}

		path:nth-of-type(13) {
			animation-delay: 1.3s;
		}

		path:nth-of-type(14) {
			animation-delay: 1.4s;
		}

		path:nth-of-type(15) {
			animation-delay: 1.5s;
		}

		path:nth-of-type(16) {
			animation-delay: 1.6s;
		}

		path:nth-of-type(17) {
			animation-delay: 1.7s;
		}

		path:nth-of-type(18) {
			animation-delay: 1.8s;
		}

		path:nth-of-type(19) {
			animation-delay: 1.9s;
		}

		path:nth-of-type(20) {
			animation-delay: 2s;
		}

		path:nth-of-type(21) {
			animation-delay: 2.1s;
		}

		path:nth-of-type(22) {
			animation-delay: 2.2s;
		}

		path:nth-of-type(23) {
			animation-delay: 2.3s;
		}

		path:nth-of-type(24) {
			animation-delay: 2.4s;
		}

		path:nth-of-type(25) {
			animation-delay: 2.5s;
		}

		path:nth-of-type(26) {
			animation-delay: 0.1s;
		}

		path:nth-of-type(27) {
			animation-delay: 0.2s;
		}

		path:nth-of-type(28) {
			animation-delay: 0.3s;
		}

		path:nth-of-type(29) {
			animation-delay: 0.4s;
		}

		path:nth-of-type(30) {
			animation-delay: 0.5s;
		}

		path:nth-of-type(31) {
			animation-delay: 0.6s;
		}

		path:nth-of-type(32) {
			animation-delay: 0.7s;
		}

		path:nth-of-type(33) {
			animation-delay: 0.8s;
		}

		path:nth-of-type(34) {
			animation-delay: 0.9s;
		}

		path:nth-of-type(35) {
			animation-delay: 1s;
		}

		path:nth-of-type(36) {
			animation-delay: 1.1s;
		}

		path:nth-of-type(37) {
			animation-delay: 1.2s;
		}

		path:nth-of-type(38) {
			animation-delay: 1.3s;
		}

		path:nth-of-type(39) {
			animation-delay: 1.4s;
		}

		path:nth-of-type(40) {
			animation-delay: 1.5s;
		}

		path:nth-of-type(41) {
			animation-delay: 1.6s;
		}

		path:nth-of-type(42) {
			animation-delay: 1.7s;
		}

		path:nth-of-type(43) {
			animation-delay: 1.8s;
		}

		path:nth-of-type(44) {
			animation-delay: 1.9s;
		}

		path:nth-of-type(45) {
			animation-delay: 2s;
		}

		path:nth-of-type(46) {
			animation-delay: 2.1s;
		}

		path:nth-of-type(47) {
			animation-delay: 2.2s;
		}

		path:nth-of-type(48) {
			animation-delay: 2.23s;
		}

		path:nth-of-type(49) {
			animation-delay: 2.26s;
		}

		path:nth-of-type(50) {
			animation-delay: 2.29s;
		}

		path:nth-of-type(51) {
			animation-delay: 2.32s;
		}

		path:nth-of-type(52) {
			animation-delay: 2.35s;
		}

		path:nth-of-type(53) {
			animation-delay: 2.38s;
		}

		path:nth-of-type(54) {
			animation-delay: 2.41s;
		}

		path:nth-of-type(55) {
			animation-delay: 2.44s;
		}

		path:nth-of-type(56) {
			animation-delay: 2.47s;
		}

		path:nth-of-type(57) {
			animation-delay: 2.5s;
		}
	}

	@keyframes example {
		0% {
			opacity: 0.4;
		}

		50% {
			opacity: 1;
		}

		100% {
			opacity: 0.4;
		}
	}
}
</style>
