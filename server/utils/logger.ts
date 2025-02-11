// server/utils/logger.ts
import { defineEventHandler } from 'h3';
import fs from 'fs';
import path from 'path';

class Logger {
	private logDir: string;
	private errorLogPath: string;
	private eventLogPath: string;
	private isDev: boolean;

	constructor() {
		// Check if we're in development mode
		this.isDev = process.env.NODE_ENV === 'development';

		this.logDir = path.join(process.cwd(), 'logs');
		this.errorLogPath = path.join(this.logDir, 'error.log');
		this.eventLogPath = path.join(this.logDir, 'event.log');

		// Only create log directory if we're not in dev mode
		if (!this.isDev) {
			this.initializeLogDirectory();
		}
	}

	private initializeLogDirectory() {
		if (!fs.existsSync(this.logDir)) {
			fs.mkdirSync(this.logDir);
		}
	}

	private formatLogMessage(message: string, data?: any): string {
		const timestamp = new Date().toISOString();
		const logData = data ? `\nData: ${JSON.stringify(data, null, 2)}` : '';
		return `[${timestamp}] ${message}${logData}\n${'='.repeat(80)}\n`;
	}

	private formatConsoleMessage(type: 'error' | 'event', message: string, data?: any): string {
		const timestamp = new Date().toLocaleTimeString();
		return `[${timestamp}] ${type.toUpperCase()}: ${message}${data ? '\n' + JSON.stringify(data, null, 2) : ''}`;
	}

	public async logError(error: Error, context?: any) {
		// In dev mode, log to console with color
		if (this.isDev) {
			console.error(
				'\x1b[31m%s\x1b[0m',
				this.formatConsoleMessage('error', error.message, {
					context,
					stack: error.stack,
				}),
			);
			return;
		}

		// In production, write to file
		const logMessage = this.formatLogMessage(`Error: ${error.message}\nStack: ${error.stack}`, context);
		await fs.promises.appendFile(this.errorLogPath, logMessage);
	}

	public async logEvent(event: string, data?: any) {
		// In dev mode, log to console with color
		if (this.isDev) {
			console.log('\x1b[36m%s\x1b[0m', this.formatConsoleMessage('event', event, data));
			return;
		}

		// In production, write to file
		const logMessage = this.formatLogMessage(event, data);
		await fs.promises.appendFile(this.eventLogPath, logMessage);
	}

	// Method to rotate logs (only used in production)
	public async rotateLogs() {
		if (this.isDev) return;

		const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

		if (fs.existsSync(this.errorLogPath)) {
			await fs.promises.rename(this.errorLogPath, path.join(this.logDir, `error-${timestamp}.log`));
		}

		if (fs.existsSync(this.eventLogPath)) {
			await fs.promises.rename(this.eventLogPath, path.join(this.logDir, `event-${timestamp}.log`));
		}
	}

	// Method to clean old logs (only used in production)
	public async cleanOldLogs(daysToKeep = 30) {
		if (this.isDev) return;

		const files = await fs.promises.readdir(this.logDir);
		const now = new Date().getTime();

		for (const file of files) {
			if (file === 'error.log' || file === 'event.log') continue;

			const filePath = path.join(this.logDir, file);
			const stats = await fs.promises.stat(filePath);
			const daysOld = (now - stats.mtime.getTime()) / (1000 * 60 * 60 * 24);

			if (daysOld > daysToKeep) {
				await fs.promises.unlink(filePath);
			}
		}
	}

	// Utility method to get current environment
	public getEnvironment() {
		return this.isDev ? 'development' : 'production';
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
