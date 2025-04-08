import { useDirectusAuth } from '#imports';

export default defineNuxtPlugin(() => {
	const { data: authData } = useAuth();
	const { setTokens } = useDirectusAuth();

	const directusToken = authData.value?.directusToken;
	console.log('Auth Data:', authData);

	if (directusToken) {
		setTokens({
			access_token: directusToken,
			refresh_token: null, // optional — only if you have it
		});
	}
});
