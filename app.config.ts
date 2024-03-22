import { theme } from '~/theme';

export default defineAppConfig({
	theme,
	ui: {
		strategy: 'override',
		primary: 'turquoise',
		gray: 'zinc',
		borderRadius: 'full',
		notifications: {
			position: 'top-0 right-0 bottom-auto left-auto',
		},
		card: {
			base: 'transition duration-200',
			shadow: 'shadow-none',
			body: {
				base: 'h-full flex flex-col',
			},
			rounded: `rounded-card`,
		},

		button: {
			base: 'hover:scale-105 active:hover:scale-95 transition duration-150 uppercase tracking-wide',
			font: 'font-bold',

			default: {
				size: 'lg',
				loadingIcon: 'material-symbols:sync-rounded',
			},
			color: {
				white: {
					solid: 'bg-white dark:bg-gray-900',
				},
			},
		},
		badge: {
			rounded: 'rounded-large',
		},
		formGroup: {
			label: {
				base: 'uppercase block font-medium text-gray-700 dark:text-gray-200 tracking-widest',
			},
		},
		input: {
			base: 'rounded-none relative block w-full disabled:cursor-not-allowed disabled:opacity-75 focus:ring-1 focus:ring-gray-300 border-0 ',
			default: {
				loadingIcon: 'material-symbols:sync-rounded',
			},
			// rounded: `rounded-${theme.borderRadius}`,
		},
		select: {
			base: 'rounded-large relative block w-full disabled:cursor-not-allowed disabled:opacity-75 focus:ring-1 focous:ring-gray-300 border-0',
			// rounded: `rounded-${theme.borderRadius}`,
			default: {
				loadingIcon: 'material-symbols:sync-rounded',
				trailingIcon: 'material-symbols:expand-more-rounded',
			},
		},
		textarea: {
			base: 'rounded-input relative block w-full disabled:cursor-not-allowed disabled:opacity-75 focus:ring-1 focus:ring-gray-300 border-0',
			rounded: 'rounded-lg',
		},
		selectMenu: {
			rounded:
				'rounded-large relative block w-full disabled:cursor-not-allowed disabled:opacity-75 focus:ring-1 ring-gray-300 border-0',
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
			default: {
				closeButton: {
					color: 'primary-300',
					icon: 'i-heroicons-x-circle',
				},
			},
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
