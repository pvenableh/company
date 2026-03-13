<template>
	<div class="md:px-6 mx-auto flex items-start justify-center flex-col md:flex-row relative px-4 pt-20 account">
		<div class="md:top-4 flex md:items-end md:justify-end flex-col w-full md:mr-6 lg:mr account__navigation">
			<Avatar size="md" />

			<h1 class="hidden md:inline-block mt-6">{{ user?.first_name }} {{ user?.last_name }}</h1>
			<a :class="{ active: panel === 1 }" @click.prevent="changePanel(1)">Profile</a>
			<a :class="{ active: panel === 2 }" @click.prevent="changePanel(2)">Reset Password</a>
			<a :class="{ active: panel === 3 }" @click.prevent="changePanel(3)">Earnest Score</a>
			<a :class="{ active: panel === 5 }" @click.prevent="changePanel(5)">Appearance</a>
			<AccountLogout v-if="user" class="logout-icon" />
		</div>
		<transition-group
			name="list"
			tag="div"
			class="w-full flex flex-col items-center justify-start relative account__panels"
		>
			<div v-if="panel === 1" key="1" class="account__panel profile">
				<AccountProfile />
			</div>
			<div v-if="panel === 2" key="2" class="account__panel">
				<AccountPasswordRequest />
			</div>
			<div v-if="panel === 3" key="3" class="account__panel">
				<div class="max-w-xl">
					<h2 class="text-lg font-semibold text-foreground mb-6">Earnest Score</h2>
					<EarnestProfilePanel />
				</div>
			</div>
			<div v-if="panel === 4" key="4" class="account__panel"></div>
			<div v-if="panel === 5" key="5" class="account__panel">
				<div class="max-w-md">
					<h2 class="text-lg font-semibold text-foreground mb-6">Appearance</h2>
					<ThemeSwitcher />
				</div>
			</div>
		</transition-group>
	</div>
</template>

<script setup lang="ts">
const { user } = useDirectusAuth();

definePageMeta({
	middleware: ['auth'],
});

// const avatar = computed(() => {
// 	if (user.value.avatar) {
// 		return 'https://admin.1033lenox.com/assets/' + user.value.avatar + '?key=medium';
// 	} else {
// 		return (
// 			'https://ui-avatars.com/api/?name=' +
// 			user.value?.first_name +
// 			' ' +
// 			user.value?.last_name +
// 			'&background=eeeeee&color=00bfff'
// 		);
// 	}
// });
const panel = ref(1);

function changePanel(val: string | number) {
	panel.value = Number(val);
}
</script>
<style>
@reference "~/assets/css/tailwind.css";
.account {
	max-width: 1600px;
}

.account__navigation {
	border-bottom: thin solid var(--lightGrey);

	@media (min-width: theme('screens.md')) {
		width: 220px;
		border-bottom: none;
	}
	h1 {
		font-size: 10px;
		@apply w-full text-center md:text-right uppercase tracking-wider pb-2 mb-0 md:mb-2;
	}

	a,
	.logout-btn {
		font-size: 10px;
		@apply w-full text-center md:text-right uppercase tracking-wider pb-2 mb-0 md:mb-2 cursor-pointer;
	}

	a.active {
		color: var(--purple);
		opacity: 0.25;
	}
}

.account__panels {
	width: 100%;

	@media (min-width: theme('screens.md')) {
		width: 800px;
	}
}

.account__panel {
	@apply w-full;

	h2 {
		@apply uppercase tracking-wider font-bold text-sm text-center w-full mt-6;
	}

	.addresses__nav {
		a {
			max-width: 200px;
		}
	}
}
</style>
