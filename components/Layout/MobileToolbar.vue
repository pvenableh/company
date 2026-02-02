<script setup>
const props = defineProps({
	links: {
		type: Array,
		default: () => [],
	},
});
</script>
<template>
	<div
		id="mobile-toolbar"
		class="mobile-toolbar flex flex-row items-center justify-center bg-gray-100 dark:bg-gradient-to-tr dark:from-gray-800 dark:to-gray-900"
	>
		<nuxt-link v-for="(link, index) in links" :key="index" :to="link.to">
			<UIcon :name="link.icon" />
			<h5 class="text-">{{ link.name }}</h5>
		</nuxt-link>

		<LayoutNavButton />
		<div class="indicator">
			<span></span>
		</div>
	</div>
</template>

<style scoped>
@reference "~/assets/css/tailwind.css";
.mobile-toolbar {
	position: fixed;
	bottom: 0px;
	left: 0px;
	width: 100%;
	height: 65px;

	border-top: solid 1px rgba(55, 55, 55, 0.05);
	padding-right: 20%;
	overflow: hidden;
	box-shadow: -1px 2px 10px rgba(0, 0, 0, 0.15);
	z-index: 10;

	/* @media (min-width: theme('screens.sm')) {
		padding-right: 33.333333%;
	} */

	a {
		width: 50%;
		height: 50px;
		/* border-right: thin solid var(--white); */
		@apply relative flex flex-col items-center justify-center border-r border-white dark:border-gray-700;

		svg {
			height: 20px;
			width: auto;
			margin-top: 2px;
			transition: 0.25s var(--curve);

			path {
				fill: var(--grey) !important;
				transition: 0.25s var(--curve);
			}
		}

		h5 {
			margin-top: 2px;
			@apply uppercase tracking-widest text-[5px] sm:text-[7px];
		}
	}

	a.router-link-exact-active {
		color: var(--blue);
		svg {
			path {
				fill: var(--blue) !important;
			}
		}
	}

	.indicator {
		z-index: 10;
		position: absolute;
		top: 0px;
		left: -0%;
		height: 2px;
		width: 20%;
		top: -2px;
		opacity: 0;
		transition: 0.25s var(--curve);
		@apply flex items-center justify-center;
		/* @media (min-width: theme('screens.sm')) {
			width: 33.333333%;
		} */

		span {
			display: block;
			width: 40px;
			height: 2px;
			background: var(--blue);

			@media (min-width: theme('screens.sm')) {
				width: 60px;
			}
		}
	}
}

.mobile-toolbar a:nth-of-type(1).router-link-exact-active ~ .indicator {
	left: 0%;
	top: 0px;
	opacity: 1;
}

.mobile-toolbar a:nth-of-type(2).router-link-exact-active ~ .indicator {
	left: 33.333333%;
	left: 20%;
	top: 0px;
	opacity: 1;
}

.mobile-toolbar a:nth-of-type(3).router-link-exact-active ~ .indicator {
	left: 53%;
	left: 40%;
	top: 0px;
	opacity: 1;
}

.mobile-toolbar a:nth-of-type(4).router-link-exact-active ~ .indicator {
	left: 60%;

	top: 0px;
	opacity: 1;
}
</style>
