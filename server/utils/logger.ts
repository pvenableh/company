// server/utils/logger.js
import { defineEventHandler } from 'h3';

class Logger {
	private isProd = process.env.NODE_ENV === 'production';

	private formatLogMessage(message: string, data?: any): string {
		const timestamp = new Date().toISOString();
		const logData = data ? `\nData: ${JSON.stringify(data, null, 2)}` : '';
		return `[${timestamp}] ${message}${logData}`;
	}

	private formatConsoleMessage(type: 'error' | 'event', message: string, data?: any): string {
		const timestamp = new Date().toLocaleTimeString();
		return `[${timestamp}] ${type.toUpperCase()}: ${message}${data ? '\n' + JSON.stringify(data, null, 2) : ''}`;
	}

	public async logError(error: Error, context?: any) {
		const formattedMessage = this.formatConsoleMessage('error', error.message, {
			context,
			stack: error.stack,
		});

		if (this.isProd) {
			// In production, use console.error
			// You might want to add integration with external logging services here
			console.error('\x1b[31m%s\x1b[0m', formattedMessage);
		} else {
			// In development, use colored console output
			console.error('\x1b[31m%s\x1b[0m', formattedMessage);
		}
	}

	public async logEvent(event: string, data?: any) {
		const formattedMessage = this.formatConsoleMessage('event', event, data);

		if (this.isProd) {
			// In production, use console.log
			// You might want to add integration with external logging services here
			console.log(formattedMessage);
		} else {
			// In development, use colored console output
			console.log('\x1b[36m%s\x1b[0m', formattedMessage);
		}
	}
}

// Create a singleton instance
const logger = new Logger();

// Middleware to catch and log errors
export const errorHandler = defineEventHandler((event) => {
	event.node.res.on('finish', () => {
		const statusCode = event.node.res.statusCode;
		if (statusCode >= 400) {
			logger.logError(new Error(`HTTP ${statusCode}`), {
				url: event.node.req.url,
				method: event.node.req.method,
				headers: event.node.req.headers,
			});
		}
	});
});

export default logger;
