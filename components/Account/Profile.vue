<template>
	<div class="px-10 account__profile">
		<h2>Profile</h2>
		<form class="grid gap-4" @submit.prevent="updatePerson()">
			<UInput
				v-model="user.first_name"
				name="first_name"
				type="text"
				rules="required"
				label="First Name"
				class="my-6"
			/>

			<UInput v-model="user.last_name" name="last_name" type="text" rules="required" label="Last Name" class="my-6" />
			<UInput
				v-model="user.email"
				name="email"
				type="email"
				rules="email|required"
				label="Email"
				class="my-6"
				disabled="true"
			/>

			<UButton class="w-full mb-6" type="submit" size="lg" label="Update" block />
		</form>
	</div>
</template>
<script setup>
const { user, updateMe } = useDirectusUsers();
const toast = useToast();

watch(user.value, (currentValue, oldValue) => {
	return currentValue;
});

async function updatePerson() {
	try {
		await updateMe(
			{
				first_name: user.value.first_name,
				last_name: user.value.last_name,
			},
			{
				updateState: true,
			},
		);

		toast.add({ icon: 'i-heroicons-check-circle-solid', title: 'Success!', description: 'Profile updated.' });
	} catch (error) {
		console.error(error);
	}
}
</script>
<style></style>
