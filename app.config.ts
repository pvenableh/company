import { theme } from '~/theme';

export default defineAppConfig({
	theme,
	ui: {
		strategy: 'override',
		primary: 'zinc',
		gray: 'zinc',
		borderRadius: 'full',
		card: {
			base: 'transition duration-200',
			shadow: 'shadow-none',
			body: {
				base: 'h-full flex flex-col',
			},
			rounded: `rounded-card`,
		},

		button: {
			base: 'transition duration-150 uppercase tracking-wide text-center focus:border-0 focus:outline-none focus:ring-1 focus:ring-gray-300 disabled:cursor-not-allowed disabled:opacity-75 active:border-0 active:outline-none active:ring-1 active:ring-gray-300 tracking-wider text-center items-center justify-center',
			rounded: `rounded-${theme.borderRadius}`,
			font: 'font-bold',

			default: {
				size: 'lg',
				loadingIcon: 'i-heroicons-arrow-path',
			},
			color: {
				white: {
					solid: 'bg-white dark:bg-gray-900',
				},
				ghost: {
					solid: 'bg-transparent text-turqoise-500 dark:text-turqoise-400',
				},
			},
		},
		badge: {
			rounded: 'rounded-large',
		},
		formGroup: {
			base: 'ring-0 focus:ring-0 outline-none focus:outline-none',
			label: {
				base: 'uppercase block font-medium text-gray-500 dark:text-gray-200 tracking-wider',
			},
		},
		input: {
			base: 'relative block w-full box-border disabled:cursor-not-allowed disabled:opacity-75 focus:outline-none border-0 border-solid border-b border-gray-300 focus:border-b-2 focus:border-cyan-200 !ring-0 focus:ring-0 outline-none !ring-offset-0 appearance-none !bg-transparent',
			default: {
				loadingIcon: 'i-heroicons-arrow-path',
			},
			rounded: `rounded-${theme.borderRadius}`,
		},
		select: {
			base: 'relative block w-full box-border disabled:cursor-not-allowed disabled:opacity-75 focus:outline-none focus:ring-0 border-0 border-solid border-b border-gray-300 focus:border-b focus:border-cyan-200 !ring-0 focus:ring-0 outline-none !ring-offset-0 appearance-none !bg-transparent uppercase overflow-y-scroll',
			rounded: `rounded-${theme.borderRadius}`,
			default: {
				loadingIcon: 'material-symbols:sync-rounded',
				trailingIcon: 'material-symbols:expand-more-rounded',
			},
		},
		textarea: {
			base: '',
			rounded: `rounded-${theme.borderRadius}`,
		},
		selectMenu: {
			rounded: `rounded-${theme.borderRadius}`,
			base: 'relative block w-full box-border disabled:cursor-not-allowed disabled:opacity-75 focus:outline-none focus:ring-0 border-0 border-solid border-b border-gray-300 focus:border-b focus:border-cyan-200 !ring-0 focus:ring-0 outline-none !ring-offset-0 appearance-none bg-transparent uppercase overflow-y-scroll',
			default: {
				selectedIcon: 'material-symbols:fitbit-check-small-rounded',
			},
		},
		notification: {
			title: 'text-sm font-bold text-white dark:text-gray-900',
			description: 'text-xs text-white dark:text-gray-900',
			icon: {
				color: 'text-primary-500 dark:text-gray-900',
			},
			background: 'bg-gray-800 dark:bg-primary-600 ',
			progress: {
				base: 'absolute bottom-0 end-0 start-0 h-1',
				background: 'bg-turquoise-500 dark:bg-turquoise-400',
			},
			default: {
				closeButton: {
					icon: 'i-heroicons-x-circle',
				},
			},
		},
		notifications: {
			position: 'top-auto right-0 bottom-0 left-auto',
		},
		commandPalette: {
			default: {
				icon: 'material-symbols:search-rounded',
				loadingIcon: 'material-symbols:sync-rounded',
				selectedIcon: 'material-symbols:fitbit-check-small-rounded',
				emptyState: {
					icon: 'material-symbols:search-rounded',
				},
			},
		},
		table: {
			default: {
				sortAscIcon: 'octicon:sort-asc-24',
				sortDescIcon: 'octicon:sort-desc-24',
				// sortButton: {
				// 	icon: 'octicon-arrow-switch-24',
				// },
				loadingState: {
					icon: 'material-symbols:sync-rounded',
				},
				emptyState: {
					icon: 'material-symbols:database-outline',
				},
			},
		},
		avatar: {
			// background: 'bg-gray-400 dark:bg-gray-800',
			rounded: 'rounded-full',
		},
		breadcrumb: {
			default: {
				divider: 'material-symbols:chevron-right',
			},
		},
		pagination: {
			rounded: 'first:rounded-l-button last:rounded-r-button',
			default: {
				prevButton: {
					icon: 'material-symbols:arrow-back-rounded',
				},
				nextButton: {
					icon: 'material-symbols:arrow-forward-rounded',
				},
			},
		},
	},
});
