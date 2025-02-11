import { errorHandler } from '../utils/logger';

export default defineEventHandler((event) => {
	// Apply the error handler middleware
	errorHandler(event);
});
