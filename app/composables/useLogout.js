// composables/useLogout.js
export const useLogout = () => {
	const { signOut } = useDirectusAuth();
	const router = useRouter();
	const toast = useToast();

	const logout = async () => {
		try {
			await signOut();

			// Navigate to home page
			router.push('/');

			// Optional: show success notification
			toast?.add({
				title: 'Logged out',
				description: 'You have been successfully logged out',
				color: 'green',
			});

			// Fallback redirect if router doesn't work
			setTimeout(() => {
				if (window.location.pathname !== '/') {
					window.location.href = '/';
				}
			}, 500);
		} catch (error) {
			console.error('Logout error:', error);

			// Optional: show error notification
			toast?.add({
				title: 'Error',
				description: 'There was a problem logging out',
				color: 'red',
			});

			// Force redirect on error
			window.location.href = '/';
		}
	};

	return {
		logout,
	};
};
