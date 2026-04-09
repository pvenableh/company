// composables/useToast.ts
/**
 * useToast - Toast notifications composable
 *
 * Wraps vue-sonner to provide a NuxtUI-compatible toast API
 *
 * Usage:
 * const toast = useToast()
 * toast.add({ title: 'Success!', color: 'green' })
 * toast.success('Item saved!')
 * toast.error('Something went wrong')
 */

import { toast as sonnerToast } from "vue-sonner";
import type { FeedbackType } from "~/composables/useFeedback";

interface ToastOptions {
  title?: string;
  description?: string;
  color?: "green" | "red" | "yellow" | "blue" | "gray" | "primary" | "success" | "warning" | "error" | "info";
  icon?: string;
  duration?: number;
  /** Set to false to suppress haptic/sound feedback for this toast */
  feedback?: boolean;
  action?: {
    label: string;
    onClick: () => void;
  };
}

// Map sonner types to feedback types
const FEEDBACK_MAP: Record<string, FeedbackType> = {
  success: "success",
  error: "error",
  warning: "warning",
};

export function useToast() {
  const { feedback: triggerFeedback } = useFeedback();

  /**
   * Add a toast notification (NuxtUI-compatible API)
   * Automatically triggers haptic + sound feedback based on toast type.
   */
  const add = (options: ToastOptions) => {
    const { title, description, color, duration = 5000, action, feedback: wantFeedback = true } = options;

    // Map NuxtUI colors to sonner types
    const colorMap: Record<string, "success" | "error" | "warning" | "info" | "default"> = {
      green: "success",
      success: "success",
      red: "error",
      error: "error",
      yellow: "warning",
      warning: "warning",
      blue: "info",
      info: "info",
      primary: "default",
      gray: "default",
    };

    const type = color ? colorMap[color] || "default" : "default";
    const message = title || description || "";

    const toastOptions: any = {
      description: title ? description : undefined,
      duration,
    };

    if (action) {
      toastOptions.action = {
        label: action.label,
        onClick: action.onClick,
      };
    }

    // Trigger haptic + sound feedback
    if (wantFeedback) {
      const feedbackType = FEEDBACK_MAP[type];
      if (feedbackType) {
        triggerFeedback(feedbackType);
      }
    }

    switch (type) {
      case "success":
        sonnerToast.success(message, toastOptions);
        break;
      case "error":
        sonnerToast.error(message, toastOptions);
        break;
      case "warning":
        sonnerToast.warning(message, toastOptions);
        break;
      case "info":
        sonnerToast.info(message, toastOptions);
        break;
      default:
        sonnerToast(message, toastOptions);
    }
  };

  /**
   * Success toast shorthand
   */
  const success = (message: string, options?: Omit<ToastOptions, "title" | "color">) => {
    add({ title: message, color: "success", ...options });
  };

  /**
   * Error toast shorthand
   */
  const error = (message: string, options?: Omit<ToastOptions, "title" | "color">) => {
    add({ title: message, color: "error", ...options });
  };

  /**
   * Warning toast shorthand
   */
  const warning = (message: string, options?: Omit<ToastOptions, "title" | "color">) => {
    add({ title: message, color: "warning", ...options });
  };

  /**
   * Info toast shorthand
   */
  const info = (message: string, options?: Omit<ToastOptions, "title" | "color">) => {
    add({ title: message, color: "info", ...options });
  };

  /**
   * Loading toast with promise
   */
  const promise = <T>(
    promiseFn: Promise<T>,
    options: {
      loading: string;
      success: string | ((data: T) => string);
      error: string | ((error: any) => string);
    }
  ) => {
    return sonnerToast.promise(promiseFn, options);
  };

  /**
   * Dismiss all toasts
   */
  const clear = () => {
    sonnerToast.dismiss();
  };

  return {
    add,
    success,
    error,
    warning,
    info,
    promise,
    clear,
  };
}
