// composables/useDesktopNotifications.ts
/**
 * Desktop/browser notification composable.
 *
 * Requests Notification permission and shows browser notifications
 * for high-priority items when the tab is not focused.
 * Respects user preference toggle.
 */

export function useDesktopNotifications() {
  const isSupported = computed(() => {
    if (!import.meta.client) return false;
    return 'Notification' in window;
  });

  const permission = computed(() => {
    if (!isSupported.value) return 'denied';
    return Notification.permission;
  });

  const isGranted = computed(() => permission.value === 'granted');

  /**
   * Request notification permission from the user.
   * Returns the permission state after the request.
   */
  async function requestPermission(): Promise<NotificationPermission> {
    if (!isSupported.value) return 'denied';
    if (Notification.permission === 'granted') return 'granted';

    try {
      const result = await Notification.requestPermission();
      return result;
    } catch {
      return 'denied';
    }
  }

  /**
   * Show a desktop notification if:
   * - The API is supported
   * - Permission is granted
   * - The tab is not focused (document.hidden)
   *
   * @param title - Notification title
   * @param options - Standard Notification options (body, icon, tag, etc.)
   * @param onClick - Optional callback when the notification is clicked
   */
  function show(
    title: string,
    options?: {
      body?: string;
      icon?: string;
      tag?: string;
      data?: any;
    },
    onClick?: () => void,
  ): Notification | null {
    if (!import.meta.client) return null;
    if (!isSupported.value || !isGranted.value) return null;

    // Only show when tab is not focused
    if (!document.hidden) return null;

    try {
      const notification = new Notification(title, {
        body: options?.body,
        icon: options?.icon || '/icon-192x192.png',
        tag: options?.tag, // Prevents duplicate notifications with same tag
        data: options?.data,
        silent: false,
      });

      if (onClick) {
        notification.onclick = () => {
          window.focus();
          onClick();
          notification.close();
        };
      }

      // Auto-close after 8 seconds
      setTimeout(() => notification.close(), 8000);

      return notification;
    } catch (err) {
      console.error('Failed to show desktop notification:', err);
      return null;
    }
  }

  return {
    isSupported,
    permission,
    isGranted,
    requestPermission,
    show,
  };
}
