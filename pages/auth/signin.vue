<script setup lang="ts">
const panel = ref('login');

function movePanel(val: string) {
	console.log(val);
	panel.value = val;
}
</script>

<template>
	<div class="flex items-center justify-center flex-col px-12 login">
		<transition-group name="list" tag="div" class="login-panels">
			<div v-if="panel === 'register'" key="1" class="flex items-center justify-center flex-col login-panel">
				<!-- <AccountRegister /> -->
				<a class="cursor-pointer login-panel__nav-button" @click.prevent="movePanel('login')">Login</a>
			</div>
			<div v-if="panel === 'login'" class="flex items-center justify-center flex-col login-panel" key="2">
				<p class="text-xs uppercase tracking-wide">This platform is accessible by invitation only.</p>
				<AccountLoginForm />

				<!-- <a @click.prevent="movePanel('register')" class="cursor-pointer login-panel__nav-button">New? <span
						class="purple-txt">Register Here</span></a> -->
				<a class="cursor-pointer login-panel__nav-button reset purple-txt mt-4" @click.prevent="movePanel('request')">
					Reset Password
				</a>
				<div v-if="error" class="text-red-500 uppercase tracking-wide font-bold" style="font-size: 10px">
					{{ error }}
				</div>
			</div>
			<div v-if="panel === 'request'" key="3" class="flex items-center justify-center flex-col login-panel">
				<AccountPasswordRequest />
				<a @click.prevent="movePanel('login')" class="cursor-pointer login-panel__nav-button">Login</a>
			</div>
		</transition-group>
	</div>
</template>

<style>
.login {
	/* height: 90vh; */
}

.login-panel {
	width: 325px;
	height: 450px;

	&__nav-button {
		font-size: 14px;
		@apply uppercase tracking-wider;
	}

	&__nav-button.reset {
		font-size: 10px;
	}
}
</style>
