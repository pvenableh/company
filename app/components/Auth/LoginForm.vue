<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { ref, onMounted, computed } from "vue";
import { useForm, Field as VeeField } from "vee-validate";
import { toTypedSchema } from "@vee-validate/zod";
import { z } from "zod";
import { cn } from "@/lib/utils";
import { toast } from "vue-sonner";
import { Loader2, AlertCircle } from "lucide-vue-next";

const config = useRuntimeConfig();

// SSO — only shown when Directus URL is configured
const directusUrl = config.public.directusUrl || '';
const hasSso = computed(() => false); // SSO hidden for now

// SSO provider availability — Apple requires env vars that may not be set yet
const hasAppleSso = computed(() => !!config.public.appleClientId);

const ssoProviders = computed(() => {
  if (!directusUrl) return null;
  const appUrl = config.public.siteUrl || (import.meta.client ? window.location.origin : '');
  const redirect = encodeURIComponent(`${appUrl}/auth/sso-callback`);

  return {
    google: `${directusUrl}/auth/login/google?redirect=${redirect}`,
    apple: hasAppleSso.value ? `${directusUrl}/auth/login/apple?redirect=${redirect}` : null,
  };
});

const props = defineProps<{
  class?: HTMLAttributes["class"];
  isLoading?: boolean;
}>();

const emit = defineEmits<{
  (e: "submit", values: { email: string; password: string }): void;
  (e: "forgot-password"): void;
  (e: "register"): void;
}>();

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

const formSchema = toTypedSchema(loginSchema);

const { handleSubmit, isSubmitting, resetForm, setFieldError } =
  useForm<LoginFormValues>({
    validationSchema: formSchema,
    initialValues: {
      email: "",
      password: "",
    },
  });

// Track form-level error
const formError = ref<string | null>(null);

// Expose method to set errors from parent
const setFormError = (
  message: string | null,
  fieldErrors?: { email?: string; password?: string }
) => {
  formError.value = message;
  if (fieldErrors) {
    if (fieldErrors.email) setFieldError("email", fieldErrors.email);
    if (fieldErrors.password) setFieldError("password", fieldErrors.password);
  }
};

const clearFormError = () => {
  formError.value = null;
};

defineExpose({ setFormError, resetForm });

const isProcessing = computed(() => isSubmitting.value || props.isLoading);

const onSubmit = handleSubmit(async (values) => {
  clearFormError();
  emit("submit", { email: values.email!, password: values.password! });
});
</script>

<template>
  <div :class="cn('flex flex-col gap-6 w-full max-w-sm', props.class)">
    <div class="glass rounded-2xl border border-white/40 shadow-lg backdrop-blur-xl p-8">
      <!-- Header -->
      <div class="text-center mb-6">
        <h3 class="text-xl font-semibold">Welcome back</h3>
        <p class="text-sm text-muted-foreground mt-1">Sign in to your account</p>
      </div>

      <form @submit="onSubmit" class="space-y-4">
        <!-- Form-level error alert -->
        <Transition
          enter-active-class="transition-all duration-300 ease-out"
          leave-active-class="transition-all duration-200 ease-in"
          enter-from-class="opacity-0 -translate-y-2"
          enter-to-class="opacity-100 translate-y-0"
          leave-from-class="opacity-100 translate-y-0"
          leave-to-class="opacity-0 -translate-y-2"
        >
          <div
            v-if="formError"
            class="flex items-center gap-2 p-3 text-sm text-red-700 bg-red-50 border border-red-200/50 rounded-lg"
          >
            <AlertCircle class="h-4 w-4 flex-shrink-0" />
            <span>{{ formError }}</span>
          </div>
        </Transition>

        <VeeField v-slot="{ field, errors }" name="email">
          <div class="space-y-1.5">
            <label for="email" class="text-sm font-medium">Email</label>
            <input
              id="email"
              type="email"
              placeholder="you@example.com"
              v-bind="field"
              @input="clearFormError"
              class="w-full rounded-lg border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--cyan)] focus:border-transparent transition-shadow"
              :class="errors.length ? 'border-red-300' : 'border-border'"
            />
            <p v-if="errors.length" class="text-xs text-red-500">{{ errors[0] }}</p>
          </div>
        </VeeField>

        <VeeField v-slot="{ field, errors }" name="password">
          <div class="space-y-1.5">
            <div class="flex items-center justify-between">
              <label for="password" class="text-sm font-medium">Password</label>
              <button
                type="button"
                class="text-xs text-muted-foreground hover:text-foreground transition-colors"
                @click="emit('forgot-password')"
              >
                Forgot password?
              </button>
            </div>
            <input
              id="password"
              type="password"
              v-bind="field"
              @input="clearFormError"
              class="w-full rounded-lg border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--cyan)] focus:border-transparent transition-shadow"
              :class="errors.length ? 'border-red-300' : 'border-border'"
            />
            <p v-if="errors.length" class="text-xs text-red-500">{{ errors[0] }}</p>
          </div>
        </VeeField>

        <div class="flex flex-col gap-3 pt-2">
          <button
            type="submit"
            :disabled="isProcessing"
            class="w-full rounded-lg bg-foreground text-background px-4 py-2.5 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40 flex items-center justify-center"
          >
            <Loader2 v-if="isProcessing" class="mr-2 h-4 w-4 animate-spin" />
            {{ isProcessing ? "Signing in..." : "Sign in" }}
          </button>

          <!-- SSO Section -->
          <template v-if="hasSso && ssoProviders">
            <div class="relative my-1">
              <div class="absolute inset-0 flex items-center">
                <span class="w-full border-t border-border/50" />
              </div>
              <div class="relative flex justify-center text-xs">
                <span class="bg-white/80 px-3 text-muted-foreground rounded">or</span>
              </div>
            </div>

            <div :class="ssoProviders.apple ? 'grid grid-cols-2 gap-2' : ''">
              <a
                :href="ssoProviders.google"
                class="flex items-center justify-center gap-2 rounded-lg border border-border bg-white px-4 py-2.5 text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                <svg class="h-4 w-4" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                Google
              </a>
              <a
                v-if="ssoProviders.apple"
                :href="ssoProviders.apple"
                class="flex items-center justify-center gap-2 rounded-lg border border-border bg-white px-4 py-2.5 text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                <svg class="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
                </svg>
                Apple
              </a>
            </div>
          </template>
        </div>
      </form>
    </div>

    <p class="text-center text-sm text-muted-foreground">
      Don't have an account?
      <button
        type="button"
        class="text-foreground font-medium hover:underline underline-offset-4"
        @click="emit('register')"
      >
        Sign up
      </button>
    </p>
  </div>
</template>
