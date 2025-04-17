// server/api/auth/[...].ts
import { NuxtAuthHandler } from '#auth';
// Note the .default being used here - this is crucial
import CredentialsProvider from 'next-auth/providers/credentials';

interface DirectusCredentials {
	email: string;
	password: string;
	csrfToken?: string;
	callbackUrl?: string;
	redirect?: boolean;
	[key: string]: string | boolean | undefined;
}

// Define the auth response type
interface DirectusAuthResponse {
	data: {
		access_token: string;
		expires: number;
		refresh_token: string;
	};
}

// Define organization structure
interface OrganizationReference {
	organizations_id: {
		id: string;
	};
}

// Define the user response type
interface DirectusUserResponse {
	data: {
		id: string;
		email: string;
		first_name: string;
		last_name: string;
		avatar?: string;
		role: string;
		organizationIds?: Array<string> | null;
		organizations?: Array<OrganizationReference> | null; // Fixed: Define proper type
	};
}

export default NuxtAuthHandler({
	secret: useRuntimeConfig().authSecret,
	pages: {
		signIn: '/auth/signin',
	},

	callbacks: {
		async jwt({ token, user, account }) {
			// If we have user data from initial sign-in, store it in the token
			if (user) {
				const directusUser = user as any;
				token.user = {
					id: user.id,
					email: user.email,
					first_name: user.first_name,
					last_name: user.last_name,
					avatar: user.avatar,
					role: user.role,
					organizationIds: user.organizationIds,
				};
				token.directusToken = directusUser.accessToken;
				token.refreshToken = directusUser.refreshToken;
				token.accessTokenExpires = directusUser.accessTokenExpires;
			}

			// Return early if token doesn't need refreshing
			if (token.accessTokenExpires && Date.now() < token.accessTokenExpires) {
				return token;
			}

			// If we have a refresh token, try to refresh the token
			if (token.refreshToken) {
				try {
					const directusUrl = useRuntimeConfig().public.directusUrl;
					const response = await $fetch<DirectusAuthResponse>(`${directusUrl}/auth/refresh`, {
						method: 'POST',
						body: {
							refresh_token: token.refreshToken,
							mode: 'json',
						},
						headers: {
							'Content-Type': 'application/json',
						},
					});

					if (response.data && response.data.access_token) {
						// Update token with new values
						token.directusToken = response.data.access_token;
						token.refreshToken = response.data.refresh_token;
						token.accessTokenExpires = Date.now() + response.data.expires;
						return token;
					} else {
						console.error('Token refresh response missing data:', response);
						// If refresh fails but we still have user data, keep it
						if (token.user) {
							return token;
						}
						// Otherwise clear the token
						return {};
					}
				} catch (error) {
					console.error('Error refreshing token:', error);

					// Important: If token refresh fails but we still have user data,
					// return the token anyway to keep the user logged in
					if (token.user) {
						console.log('Keeping existing user session despite refresh error');
						// Set the token as expired to trigger another refresh attempt later
						token.accessTokenExpires = 0;
						return token;
					}

					// If no user data, treat as unauthenticated
					return {};
				}
			}

			// If we have user data but no refresh token, keep the session
			if (token.user) {
				return token;
			}

			return token;
		},

		async session({ session, token }) {
			// Make user and token info available in the session

			if (token.user) {
				console.log('Setting user data from token to session');
				session.user = token.user;
			} else {
				console.log('No user data in token!');
			}

			if (token.directusToken) {
				session.directusToken = token.directusToken;
			}

			if (token.refreshToken) {
				session.refreshToken = token.refreshToken;
			}

			console.log('Output session:', JSON.stringify(session, null, 2));
			return session;
		},
	},

	providers: [
		// @ts-expect-error You need to use .default here for it to work during SSR
		CredentialsProvider.default({
			name: 'Directus',
			credentials: {
				email: { label: 'Email', type: 'email' },
				password: { label: 'Password', type: 'password' },
			},
			async authorize(credentials: DirectusCredentials | undefined) {
				console.log(
					'Authorize function called with credentials:',
					credentials ? `email: ${credentials.email}` : 'no credentials',
				);

				try {
					if (!credentials?.email || !credentials?.password) {
						console.log('Missing credentials');
						throw new Error('Missing credentials');
					}

					const directusUrl = useRuntimeConfig().public.directusUrl;
					console.log('Directus URL:', directusUrl);

					// First, attempt the login
					console.log('Attempting directus login...');
					let authResponse;
					try {
						authResponse = await $fetch<DirectusAuthResponse>(`${directusUrl}/auth/login`, {
							method: 'POST',
							body: {
								email: credentials.email,
								password: credentials.password,
							},
							headers: {
								'Content-Type': 'application/json',
							},
						});

						console.log('Auth response received:', authResponse ? 'success' : 'failed');
					} catch (loginError) {
						console.error('Login request failed:', loginError);
						if (loginError instanceof Error) {
							throw new Error(`Login failed: ${loginError.message}`);
						} else {
							throw new Error('Login failed: An unknown error occurred');
						}
					}

					if (!authResponse || !authResponse.data || !authResponse.data.access_token) {
						console.log('Invalid auth response:', authResponse);
						throw new Error('Authentication failed - invalid response');
					}

					// Then, fetch user data with the token
					console.log('Fetching user data...');
					let userResponse;
					try {
						userResponse = await $fetch<DirectusUserResponse>(`${directusUrl}/users/me`, {
							method: 'GET',
							headers: {
								'Content-Type': 'application/json',
								Authorization: `Bearer ${authResponse.data.access_token}`,
							},
							query: {
								fields: 'id,first_name,last_name,email,avatar,role,organizations.organizations_id.id',
							},
						});

						console.log('User data received:', userResponse?.data?.id ? `id: ${userResponse.data.id}` : 'no data');
					} catch (userError) {
						console.error('User data request failed:', userError);
						if (userError instanceof Error) {
							throw new Error(`Failed to fetch user data: ${userError.message}`);
						} else {
							throw new Error('Failed to fetch user data: An unknown error occurred');
						}
					}

					if (!userResponse || !userResponse.data) {
						console.log('Invalid user response');
						throw new Error('Failed to fetch user data - invalid response');
					}

					// Process organizations properly
					const organizationIds: string[] = [];
					if (userResponse.data.organizations && Array.isArray(userResponse.data.organizations)) {
						userResponse.data.organizations.forEach((org: OrganizationReference) => {
							if (org && org.organizations_id && org.organizations_id.id) {
								organizationIds.push(org.organizations_id.id);
							}
						});
					}

					console.log('Found organization IDs:', organizationIds);

					// Create and return the user object for NextAuth
					const user = {
						id: userResponse.data.id,
						email: userResponse.data.email,
						first_name: userResponse.data.first_name,
						last_name: userResponse.data.last_name,
						avatar: userResponse.data.avatar,
						role: userResponse.data.role,
						organizationIds: organizationIds,
						accessToken: authResponse.data.access_token,
						refreshToken: authResponse.data.refresh_token,
						accessTokenExpires: Date.now() + authResponse.data.expires,
					};

					console.log('Returning user object with id:', user.id);
					return user;
				} catch (error) {
					console.error('Authorization failed:', error);
					return null;
				}
			},
		}),
	],
	session: {
		strategy: 'jwt',
		maxAge: 7 * 24 * 60 * 60, // 7 days in seconds for active session
	},
	jwt: {
		maxAge: 30 * 24 * 60 * 60, // 30 days for refresh capability
	},
});
