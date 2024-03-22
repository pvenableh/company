<template>
	<div v-auto-animate>
		<UAlert
			v-if="error"
			type="error"
			class="mb-4"
			title="Oops! Something went wrong."
			:description="error"
			color="rose"
			variant="outline"
			icon="material-symbols:warning-rounded"
		>
			Error: {{ error }}
		</UAlert>

		<form class="grid gap-4" @submit.prevent="attemptLogin">
			<UFormGroup label="Email" required>
				<UInput
					v-model="credentials.email"
					type="email"
					:disabled="loading"
					size="lg"
					name="email"
					label="Work Email"
					placeholder="john@example.com"
				/>
				<UInput
					v-model="credentials.password"
					type="password"
					:disabled="loading"
					size="lg"
					name="password"
					label="Password"
					placeholder="********"
				/>
			</UFormGroup>
			<UButton
				type="submit"
				:loading="loading"
				:disabled="!credentials.email"
				size="lg"
				label="Sign In"
				trailing-icon="material-symbols:arrow-forward"
				block
			/>
		</form>
	</div>
</template>

<script setup>
const { login } = useDirectusAuth();
const route = useRoute();
const loading = ref(false);
const error = ref(null);

const credentials = reactive({
	email: 'peter@huestudios.com',
	password: 'p195pr',
});

async function attemptLogin() {
	const { email, password } = unref(credentials);
	loading.value = true;
	error.value = null;

	try {
		// Be careful when using the login function because you have to pass the email and password as arguments.
		await login(email, password);

		if (route.query.redirect) {
			const path = decodeURIComponent(route.query.redirect);

			await navigateTo(path);
		} else {
			await navigateTo('/');
		}
	} catch (err) {
		error.value = err.message;
	}

	loading.value = false;
}
</script>
