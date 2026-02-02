// middleware/auth.ts
/**
 * Auth middleware - protects routes that require authentication
 *
 * Usage in pages:
 * definePageMeta({
 *   middleware: 'auth'
 * })
 */

export default defineNuxtRouteMiddleware((to, from) => {
  const { loggedIn } = useUserSession();

  if (!loggedIn.value) {
    // Redirect to login with return URL
    return navigateTo({
      path: "/login",
      query: { redirect: to.fullPath },
    });
  }
});
