<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { ref, computed, watch } from "vue";
import { useForm, Field as VeeField } from "vee-validate";
import { toTypedSchema } from "@vee-validate/zod";
import { z } from "zod";
import { refDebounced } from "@vueuse/core";
import { cn } from "@/lib/utils";
import { toast } from "vue-sonner";
import { Loader2, Check, X } from "lucide-vue-next";

const config = useRuntimeConfig();
const directusUrl = config.public.directusUrl || '';
const hasSso = computed(() => !!directusUrl);
const hasAppleSso = computed(() => !!config.public.appleClientId);
const isGoogleRegistering = ref(false);
const googleRegError = ref<string | null>(null);

const props = defineProps<{
  class?: HTMLAttributes["class"];
}>();

const emit = defineEmits<{
  (
    e: "submit",
    values: {
      firstName: string;
      lastName: string;
      email: string;
      password: string;
      organizationName?: string;
    }
  ): void;
  (e: "login"): void;
}>();

/**
 * Google SSO Registration — hybrid flow
 * 1. Collect name + org name + email from the form
 * 2. POST to /api/auth/google-register → creates user + org in Directus
 * 3. Redirect to the Google SSO URL → user authenticates
 * 4. SSO callback creates the session as usual
 */
async function registerWithGoogle() {
  const email = values.email;
  const firstName = values.firstName;
  const lastName = values.lastName;
  const orgName = values.organizationName;

  if (!email || !firstName || !lastName) {
    googleRegError.value = 'Please fill in your name and email first, then click Sign up with Google.';
    return;
  }

  isGoogleRegistering.value = true;
  googleRegError.value = null;

  try {
    const result = await $fetch('/api/auth/google-register', {
      method: 'POST',
      body: {
        email,
        first_name: firstName,
        last_name: lastName,
        organization_name: orgName || `${firstName}'s Organization`,
      },
    });

    if (result.ssoUrl) {
      window.location.href = result.ssoUrl;
    }
  } catch (err: any) {
    isGoogleRegistering.value = false;
    googleRegError.value = err?.data?.message || 'Google registration failed. Please try again.';
  }
}

const formSchema = toTypedSchema(
  z
    .object({
      firstName: z.string().min(1, "First name is required"),
      lastName: z.string().min(1, "Last name is required"),
      email: z.string().email("Please enter a valid email address"),
      organizationName: z.string().optional(),
      password: z
        .string()
        .min(8, "Password must be at least 8 characters")
        .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
        .regex(/[a-z]/, "Password must contain at least one lowercase letter")
        .regex(/[0-9]/, "Password must contain at least one number"),
      confirmPassword: z.string(),
    })
    .refine((data) => data.password === data.confirmPassword, {
      message: "Passwords do not match",
      path: ["confirmPassword"],
    })
);

const { handleSubmit, isSubmitting, values } = useForm({
  validationSchema: formSchema,
  initialValues: {
    firstName: "",
    lastName: "",
    email: "",
    organizationName: "",
    password: "",
    confirmPassword: "",
  },
});

// Password validation state
const passwordValue = computed(() => values.password || "");
const debouncedPassword = refDebounced(passwordValue, 300);
const showPasswordRequirements = ref(false);

const passwordRequirements = computed(() => [
  { met: debouncedPassword.value.length >= 8, label: "At least 8 characters" },
  { met: /[A-Z]/.test(debouncedPassword.value), label: "One uppercase letter" },
  { met: /[a-z]/.test(debouncedPassword.value), label: "One lowercase letter" },
  { met: /[0-9]/.test(debouncedPassword.value), label: "One number" },
]);

watch(passwordValue, (val) => {
  showPasswordRequirements.value = val.length > 0;
});

const onSubmit = handleSubmit(async (values) => {
  emit("submit", {
    firstName: values.firstName!,
    lastName: values.lastName!,
    email: values.email!,
    password: values.password!,
    organizationName: values.organizationName || undefined,
  });
});
</script>

<template>
  <div :class="cn('flex flex-col gap-6', props.class)">
    <div class="bg-card text-card-foreground rounded-lg border shadow-sm">
      <div class="flex flex-col space-y-1.5 p-6">
        <h3 class="text-2xl font-semibold leading-none tracking-tight">
          Create an account
        </h3>
        <p class="text-sm text-muted-foreground">
          Enter your information to get started
        </p>
      </div>
      <div class="p-6 pt-0">
        <form @submit="onSubmit" class="space-y-4">
          <div class="grid grid-cols-2 gap-4">
            <VeeField v-slot="{ field, errors }" name="firstName">
              <div class="space-y-2">
                <label for="firstName" class="text-sm font-medium leading-none">
                  First name
                </label>
                <input
                  id="firstName"
                  type="text"
                  v-bind="field"
                  class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  :class="{ 'border-destructive': errors.length }"
                />
                <p v-if="errors.length" class="text-sm text-destructive">
                  {{ errors[0] }}
                </p>
              </div>
            </VeeField>

            <VeeField v-slot="{ field, errors }" name="lastName">
              <div class="space-y-2">
                <label for="lastName" class="text-sm font-medium leading-none">
                  Last name
                </label>
                <input
                  id="lastName"
                  type="text"
                  v-bind="field"
                  class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  :class="{ 'border-destructive': errors.length }"
                />
                <p v-if="errors.length" class="text-sm text-destructive">
                  {{ errors[0] }}
                </p>
              </div>
            </VeeField>
          </div>

          <VeeField v-slot="{ field, errors }" name="email">
            <div class="space-y-2">
              <label for="email" class="text-sm font-medium leading-none">
                Email
              </label>
              <input
                id="email"
                type="email"
                placeholder="m@example.com"
                v-bind="field"
                class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                :class="{ 'border-destructive': errors.length }"
              />
              <p v-if="errors.length" class="text-sm text-destructive">
                {{ errors[0] }}
              </p>
            </div>
          </VeeField>

          <VeeField v-slot="{ field, errors }" name="organizationName">
            <div class="space-y-2">
              <label for="organizationName" class="text-sm font-medium leading-none">
                Organization Name
                <span class="text-muted-foreground font-normal">(optional)</span>
              </label>
              <input
                id="organizationName"
                type="text"
                placeholder="Your company or team name"
                v-bind="field"
                class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              />
              <p class="text-xs text-muted-foreground">
                Creates an organization with you as the owner. You can add team members later.
              </p>
            </div>
          </VeeField>

          <VeeField v-slot="{ field, errors }" name="password">
            <div class="space-y-2">
              <label for="password" class="text-sm font-medium leading-none">
                Password
              </label>
              <input
                id="password"
                type="password"
                v-bind="field"
                class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                :class="{ 'border-destructive': errors.length }"
              />
              <p v-if="errors.length" class="text-sm text-destructive">
                {{ errors[0] }}
              </p>

              <!-- Password requirements -->
              <template v-if="showPasswordRequirements">
                <div class="mt-2 space-y-1 text-xs">
                  <TransitionGroup name="list">
                    <div
                      v-for="req in passwordRequirements"
                      :key="req.label"
                      class="flex items-center gap-1"
                      :class="req.met ? 'text-green-600' : 'text-muted-foreground'"
                    >
                      <Check v-if="req.met" class="h-3 w-3" />
                      <X v-else class="h-3 w-3" />
                      <span>{{ req.label }}</span>
                    </div>
                  </TransitionGroup>
                </div>
              </template>
            </div>
          </VeeField>

          <VeeField v-slot="{ field, errors }" name="confirmPassword">
            <div class="space-y-2">
              <label for="confirmPassword" class="text-sm font-medium leading-none">
                Confirm Password
              </label>
              <input
                id="confirmPassword"
                type="password"
                v-bind="field"
                class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                :class="{ 'border-destructive': errors.length }"
              />
              <p v-if="errors.length" class="text-sm text-destructive">
                {{ errors[0] }}
              </p>
            </div>
          </VeeField>

          <div class="flex flex-col gap-3 pt-2">
            <button
              type="submit"
              :disabled="isSubmitting || isGoogleRegistering"
              class="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground ring-offset-background transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
            >
              <Loader2 v-if="isSubmitting" class="mr-2 h-4 w-4 animate-spin" />
              {{ isSubmitting ? "Creating account..." : "Create account" }}
            </button>

            <!-- Google SSO Registration -->
            <template v-if="hasSso">
              <div class="relative my-1">
                <div class="absolute inset-0 flex items-center">
                  <span class="w-full border-t border-border" />
                </div>
                <div class="relative flex justify-center text-xs uppercase">
                  <span class="bg-card px-2 text-muted-foreground">or sign up with</span>
                </div>
              </div>

              <!-- Google reg error -->
              <div
                v-if="googleRegError"
                class="flex items-center gap-2 p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md"
              >
                <X class="h-4 w-4 flex-shrink-0" />
                <span>{{ googleRegError }}</span>
              </div>

              <button
                type="button"
                :disabled="isGoogleRegistering || isSubmitting"
                class="inline-flex items-center justify-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
                @click="registerWithGoogle"
              >
                <Loader2 v-if="isGoogleRegistering" class="h-4 w-4 animate-spin" />
                <svg v-else class="h-4 w-4" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                {{ isGoogleRegistering ? 'Setting up...' : 'Continue with Google' }}
              </button>

              <p v-if="hasSso" class="text-xs text-center text-muted-foreground">
                Fill in your name and email above first, then click to sign up with Google.
              </p>
            </template>

            <p class="text-center text-sm text-muted-foreground">
              Already have an account?
              <button
                type="button"
                class="text-foreground underline-offset-4 hover:underline font-medium"
                @click="emit('login')"
              >
                Sign in
              </button>
            </p>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>
