// server/api/auth/[...].ts
import { NuxtAuthHandler } from '#auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import type { JWT } from 'next-auth/jwt';
import type { User } from 'next-auth';

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

// Define the token refresh response type
interface TokenRefreshResponse {
	success?: boolean;
	data?: {
		access_token: string;
		refresh_token: string;
		expires?: number;
	};
}

// Response from direct Directus refresh
interface DirectusRefreshResponse {
	data: {
		access_token: string;
		refresh_token: string;
		expires?: number;
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
		organizations?: Array<OrganizationReference> | null;
	};
}

export default NuxtAuthHandler({
	secret: useRuntimeConfig().authSecret,
	pages: {
		signIn: '/auth/signin',
	},

	callbacks: {
		async jwt({ token, user }: { token: JWT; user?: User }) {
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

			// IMPROVED TOKEN REFRESH LOGIC
			const currentTime = Date.now();

			// Add a buffer period to refresh the token BEFORE it expires
			// Refresh when less than 30 minutes remain to prevent disruptions
			const refreshBuffer = 30 * 60 * 1000; // 30 minutes in milliseconds

			if (token.accessTokenExpires && currentTime + refreshBuffer < token.accessTokenExpires) {
				// Token still valid with buffer period, no refresh needed
				return token;
			}

			// Token needs refresh or will expire soon
			if (token.refreshToken) {
				try {
					// Try our own proxy endpoint first
					try {
						console.log('Attempting token refresh via proxy endpoint');
						const response = await $fetch<TokenRefreshResponse>('/api/auth/token-refresh', {
							method: 'POST',
							body: {
								refreshToken: token.refreshToken,
							},
							// Add timeout to prevent long-hanging requests
							timeout: 8000, // 8 seconds
						});

						if (response?.success && response?.data?.access_token) {
							console.log('Token refresh successful');
							token.directusToken = response.data.access_token;
							token.refreshToken = response.data.refresh_token;
							// Ensure expires is properly converted to timestamp
							const expiresInMs = response.data.expires ? response.data.expires * 1000 : 7 * 24 * 60 * 60 * 1000; // Default to 7 days to match Directus config
							token.accessTokenExpires = currentTime + expiresInMs;

							return token;
						}
					} catch (proxyError) {
						console.log('Proxy refresh failed, trying direct refresh', proxyError);
					}

					// If proxy refresh failed, try direct request to Directus
					console.log('Attempting direct token refresh with Directus');
					const directusUrl = useRuntimeConfig().public.directusUrl;
					const directResponse = await $fetch<DirectusRefreshResponse>(`${directusUrl}/auth/refresh`, {
						method: 'POST',
						body: {
							refresh_token: token.refreshToken,
							mode: 'json',
						},
						headers: {
							'Content-Type': 'application/json',
						},
						// Add timeout and retry for resilience
						timeout: 8000,
						retry: 1,
					});

					if (directResponse?.data?.access_token) {
						console.log('Direct token refresh successful');
						token.directusToken = directResponse.data.access_token;
						token.refreshToken = directResponse.data.refresh_token;
						const expiresInMs = directResponse.data.expires
							? directResponse.data.expires * 1000
							: 7 * 24 * 60 * 60 * 1000; // Default to 7 days to match Directus config
						token.accessTokenExpires = currentTime + expiresInMs;

						return token;
					}

					// If no valid response, throw error
					throw new Error('Invalid refresh response from Directus');
				} catch (error) {
					console.error('Error refreshing token:', error);

					// Enhanced error handling with better type checking
					const errorObj = error as any;

					// Check for explicit 401 status
					const is401 = errorObj.status === 401 || errorObj.response?.status === 401;

					// Check for error messages indicating token problems
					const hasTokenErrorMsg =
						typeof errorObj.message === 'string' &&
						(errorObj.message.includes('invalid') ||
							errorObj.message.includes('expired') ||
							errorObj.message.includes('Invalid refresh token'));

					// Check response data for Directus-specific errors
					const directusErrorMsg = errorObj.response?.data?.errors?.[0]?.message;
					const hasDirectusTokenError =
						typeof directusErrorMsg === 'string' &&
						(directusErrorMsg.includes('invalid') ||
							directusErrorMsg.includes('expired') ||
							directusErrorMsg.includes('refresh token'));

					// If it's a token validity issue, force reauth
					if (is401 || hasTokenErrorMsg || hasDirectusTokenError) {
						console.log('Refresh token expired or invalid, forcing reauth');
						return {
							...token,
							directusToken: undefined,
							refreshToken: undefined,
							accessTokenExpires: undefined,
							error: 'RefreshTokenExpired',
						} as JWT;
					}

					// For network errors, keep token but add a flag to retry sooner
					if (
						errorObj.name === 'FetchError' ||
						errorObj.code === 'ECONNREFUSED' ||
						errorObj.code === 'ETIMEDOUT' ||
						errorObj.message?.includes('network')
					) {
						console.log('Network error during refresh, will retry soon');
						return {
							...token,
							// Set a much shorter expiration to retry refresh sooner
							accessTokenExpires: currentTime + 2 * 60 * 1000, // Try again in 2 minutes
						};
					}

					// For other unexpected errors, keep existing token but log
					console.log('Unexpected error during token refresh, will try again later');
					return token;
				}
			}

			// If no refresh token is available, force re-authentication
			return {
				...token,
				error: 'NoRefreshTokenError',
			} as JWT;
		},

		async session({ session, token }) {
			// If there's an error in the token, force re-authentication
			if (token.error) {
				return {
					...session,
					error: token.error,
				};
			}

			// Make user and token info available in the session
			if (token.user) {
				session.user = token.user;
			}

			if (token.directusToken) {
				session.directusToken = token.directusToken;
			}

			if (token.refreshToken) {
				session.refreshToken = token.refreshToken;
			}

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
				try {
					if (!credentials?.email || !credentials?.password) {
						throw new Error('Missing credentials');
					}

					const directusUrl = useRuntimeConfig().public.directusUrl;

					// First, attempt the login
					let authResponse;
					try {
						authResponse = await $fetch<DirectusAuthResponse>(`${directusUrl}/auth/login`, {
							method: 'POST',
							body: {
								email: credentials.email,
								password: credentials.password,
								mode: 'json',
							},
							headers: {
								'Content-Type': 'application/json',
							},
							// Add timeout and retry for resilience
							timeout: 10000, // 10 seconds
							retry: 1,
						});
					} catch (loginError) {
						console.error('Login request failed:', loginError);
						throw new Error('Login failed');
					}

					if (!authResponse || !authResponse.data || !authResponse.data.access_token) {
						throw new Error('Authentication failed - invalid response');
					}

					// Then, fetch user data with the token
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
							// Add timeout for resilience
							timeout: 8000,
						});
					} catch (userError) {
						console.error('User data request failed:', userError);
						throw new Error('Failed to fetch user data');
					}

					if (!userResponse || !userResponse.data) {
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
						accessTokenExpires: Date.now() + authResponse.data.expires * 1000, // Convert to timestamp
					};

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
		maxAge: 7 * 24 * 60 * 60, // 7 days for the session
	},
	jwt: {
		maxAge: 7 * 24 * 60 * 60, // 7 days for JWT (same as session)
	},
});
