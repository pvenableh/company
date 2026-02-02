// middleware/guest.ts
/**
 * Guest middleware - redirects authenticated users away from auth pages
 *
 * Usage in pages:
 * definePageMeta({
 *   middleware: 'guest'
 * })
 */

export default defineNuxtRouteMiddleware((to, from) => {
  const { loggedIn } = useUserSession();

  if (loggedIn.value) {
    // Redirect to dashboard or home
    return navigateTo("/dashboard");
  }
});
