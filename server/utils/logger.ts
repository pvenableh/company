// server/utils/logger.ts
// import fs from 'fs';
// import path from 'path';

// export const logger = {
// 	logDir: path.join(process.cwd(), 'logs'),

// 	ensureLogDir() {
// 		if (!fs.existsSync(this.logDir)) {
// 			fs.mkdirSync(this.logDir);
// 		}
// 	},

// 	log(type: 'info' | 'error', message: string, data?: any) {
// 		this.ensureLogDir();

// 		const timestamp = new Date().toISOString();
// 		const logEntry = {
// 			timestamp,
// 			type,
// 			message,
// 			data,
// 		};

// 		const logFile = path.join(this.logDir, `${type}-${new Date().toISOString().split('T')[0]}.log`);
// 		fs.appendFileSync(logFile, JSON.stringify(logEntry) + '\n');

// 		// Also log to console in development
// 		if (process.dev) {
// 			console[type](timestamp, message, data || '');
// 		}
// 	},

// 	info(message: string, data?: any) {
// 		this.log('info', message, data);
// 	},

// 	error(message: string, error?: any) {
// 		this.log('error', message, error?.message || error);
// 	},
// };

export const logger = {
	log(type: 'info' | 'error', message: string, data?: any) {
		const timestamp = new Date().toISOString();
		const logEntry = {
			timestamp,
			type,
			message,
			data,
		};

		// In production (Vercel), this will show in Vercel logs
		if (type === 'error') {
			console.error(JSON.stringify(logEntry));
		} else {
			console.log(JSON.stringify(logEntry));
		}
	},

	info(message: string, data?: any) {
		this.log('info', message, data);
	},

	error(message: string, error?: any) {
		this.log('error', message, error?.message || error);
	},
};
