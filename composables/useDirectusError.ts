// composables/useDirectusError.ts
/**
 * Centralized Directus error handler
 *
 * Standardizes error parsing, toast messages, 401 handling, and console logging
 * for all Directus API interactions.
 *
 * Usage:
 * const { handleError } = useDirectusError()
 * try { ... } catch (error) { handleError(error, { context: 'tickets' }) }
 */

interface ErrorResult {
	statusCode: number | undefined
	message: string
	handled: boolean
}

interface HandleErrorOptions {
	/** Suppress toast notification */
	silent?: boolean
	/** Context label for console logging (e.g. 'tickets', 'comments') */
	context?: string
}

export function useDirectusError() {
	const toast = useToast()
	const { loggedIn, clear: clearSession } = useUserSession()

	/**
	 * Map HTTP status codes to user-friendly messages
	 */
	const mapErrorMessage = (statusCode: number | undefined, rawMessage: string): string => {
		switch (statusCode) {
			case 400:
				return 'Invalid request. Please check your input.'
			case 401:
				return 'Session expired. Please sign in again.'
			case 403:
				return 'You do not have permission to perform this action.'
			case 404:
				return 'The requested item was not found.'
			case 409:
				return 'This item conflicts with an existing record.'
			default:
				if (statusCode && statusCode >= 500) {
					return 'A server error occurred. Please try again later.'
				}
				return rawMessage || 'An unexpected error occurred.'
		}
	}

	/**
	 * Extract status code from various error shapes ($fetch, Directus SDK, etc.)
	 */
	const extractStatusCode = (error: any): number | undefined => {
		return (
			error?.statusCode ||
			error?.response?.status ||
			error?.data?.statusCode ||
			error?.status
		)
	}

	/**
	 * Extract raw message from various error shapes
	 */
	const extractMessage = (error: any): string => {
		return (
			error?.data?.errors?.[0]?.message ||
			error?.data?.message ||
			error?.message ||
			'An unexpected error occurred'
		)
	}

	/**
	 * Handle a Directus API error with standardized behavior
	 */
	const handleError = (error: any, options: HandleErrorOptions = {}): ErrorResult => {
		const { silent = false, context = '' } = options

		const statusCode = extractStatusCode(error)
		const rawMessage = extractMessage(error)
		const message = mapErrorMessage(statusCode, rawMessage)
		const logPrefix = `[Directus${context ? `:${context}` : ''}]`

		// Handle 401 - session expired
		if (statusCode === 401) {
			console.warn(logPrefix, 'Session expired')
			if (loggedIn.value) {
				clearSession()
				navigateTo('/auth/signin')
			}
			if (!silent) {
				toast.error(message)
			}
			return { statusCode, message, handled: true }
		}

		// Handle 403 - forbidden
		if (statusCode === 403) {
			console.warn(logPrefix, 'Permission denied:', rawMessage)
			if (!silent) {
				toast.error(message)
			}
			return { statusCode, message, handled: true }
		}

		// Log all other errors
		console.error(logPrefix, rawMessage)

		// Show toast for non-silent errors
		if (!silent) {
			toast.error(message)
		}

		return { statusCode, message, handled: false }
	}

	return {
		handleError,
		extractStatusCode,
		extractMessage,
		mapErrorMessage,
	}
}
