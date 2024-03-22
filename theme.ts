export interface Theme {
	primary: string;
	gray: string;
	borderRadius: 'none' | 'sm' | 'base' | 'md' | 'lg' | 'xl' | 'full';
	fonts: {
		display: string;
		sans: string;
		body: string;
		bold: string;
		code: string;
		signature: string;
	};
}

export const theme = {
	primary: 'turquoise',
	gray: 'zinc',
	borderRadius: 'full',
	fonts: {
		display: 'Bauer Bodoni W01 Roman',
		sans: 'Proxima Nova W01 Light',
		body: 'Proxima Nova W01 Light',
		bold: 'Proxima Nova W01 Regular',
		code: 'Fira Code',
		signature: 'Gaegu',
	},
} as Theme;

export const borderRadiusMap = {
	none: {
		card: '0px',
		button: '0px',
		input: '0px',
		panel: '0px',
	},
	sm: {
		card: '0.125rem',
		button: '0.125rem',
		input: '0.125rem',
		panel: '0.125rem',
	},
	base: {
		card: '0.25rem',
		button: '0.25rem',
		input: '0.25rem',
		panel: '0.25rem',
	},

	md: {
		card: '0.375rem',
		button: '0.375rem',
		input: '0.375rem',
		panel: '0.375rem',
	},
	lg: {
		card: '0.5rem',
		button: '0.5rem',
		input: '0.5rem',
		panel: '0.5rem',
	},
	xl: {
		card: '0.75rem',
		button: '0.75rem',
		input: '0.5rem',
		panel: '0.75rem',
	},
	full: {
		card: '0.75rem',
		button: '9999px',
		input: '9999px',
		panel: '0.75rem',
	},
};
