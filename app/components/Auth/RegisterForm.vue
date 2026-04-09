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
const hasSso = computed(() => false); // SSO hidden for now
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

async function registerWithGoogle() {
  const email = values.email;
  const firstName = values.firstName;
  const lastName = values.lastName;
  const orgName = values.organizationName;

  if (!email || !firstName || !lastName) {
    googleRegError.value = 'Please fill in your name and email first.';
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
    googleRegError.value = err?.data?.message || 'Google registration failed.';
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
        .regex(/[A-Z]/, "Must contain an uppercase letter")
        .regex(/[a-z]/, "Must contain a lowercase letter")
        .regex(/[0-9]/, "Must contain a number"),
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

const inputClass = "w-full rounded-lg border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--cyan)] focus:border-transparent transition-shadow";
</script>

<template>
  <div :class="cn('flex flex-col gap-6 w-full max-w-md', props.class)">
    <div class="glass rounded-2xl border border-white/40 shadow-lg backdrop-blur-xl p-8">
      <!-- Header -->
      <div class="text-center mb-6">
        <h3 class="text-xl font-semibold">Create an account</h3>
        <p class="text-sm text-muted-foreground mt-1">Enter your information to get started</p>
      </div>

      <form @submit="onSubmit" class="space-y-4">
        <!-- Name fields -->
        <div class="grid grid-cols-2 gap-3">
          <VeeField v-slot="{ field, errors }" name="firstName">
            <div class="space-y-1.5">
              <label for="firstName" class="text-sm font-medium">First name</label>
              <input
                id="firstName"
                type="text"
                v-bind="field"
                :class="[inputClass, errors.length ? 'border-red-300' : 'border-border']"
              />
              <p v-if="errors.length" class="text-xs text-red-500">{{ errors[0] }}</p>
            </div>
          </VeeField>

          <VeeField v-slot="{ field, errors }" name="lastName">
            <div class="space-y-1.5">
              <label for="lastName" class="text-sm font-medium">Last name</label>
              <input
                id="lastName"
                type="text"
                v-bind="field"
                :class="[inputClass, errors.length ? 'border-red-300' : 'border-border']"
              />
              <p v-if="errors.length" class="text-xs text-red-500">{{ errors[0] }}</p>
            </div>
          </VeeField>
        </div>

        <VeeField v-slot="{ field, errors }" name="email">
          <div class="space-y-1.5">
            <label for="reg-email" class="text-sm font-medium">Email</label>
            <input
              id="reg-email"
              type="email"
              placeholder="you@example.com"
              v-bind="field"
              :class="[inputClass, errors.length ? 'border-red-300' : 'border-border']"
            />
            <p v-if="errors.length" class="text-xs text-red-500">{{ errors[0] }}</p>
          </div>
        </VeeField>

        <VeeField v-slot="{ field }" name="organizationName">
          <div class="space-y-1.5">
            <label for="organizationName" class="text-sm font-medium">
              Organization Name <span class="text-muted-foreground font-normal text-xs">(optional)</span>
            </label>
            <input
              id="organizationName"
              type="text"
              placeholder="Your company or team name"
              v-bind="field"
              :class="[inputClass, 'border-border']"
            />
            <p class="text-[11px] text-muted-foreground">You'll be set as owner. Invite team members later.</p>
          </div>
        </VeeField>

        <VeeField v-slot="{ field, errors }" name="password">
          <div class="space-y-1.5">
            <label for="reg-password" class="text-sm font-medium">Password</label>
            <input
              id="reg-password"
              type="password"
              v-bind="field"
              :class="[inputClass, errors.length ? 'border-red-300' : 'border-border']"
            />
            <p v-if="errors.length" class="text-xs text-red-500">{{ errors[0] }}</p>

            <template v-if="showPasswordRequirements">
              <div class="mt-1.5 space-y-0.5">
                <div
                  v-for="req in passwordRequirements"
                  :key="req.label"
                  class="flex items-center gap-1.5 text-[11px]"
                  :class="req.met ? 'text-green-600' : 'text-muted-foreground'"
                >
                  <Check v-if="req.met" class="h-3 w-3" />
                  <X v-else class="h-3 w-3" />
                  <span>{{ req.label }}</span>
                </div>
              </div>
            </template>
          </div>
        </VeeField>

        <VeeField v-slot="{ field, errors }" name="confirmPassword">
          <div class="space-y-1.5">
            <label for="confirmPassword" class="text-sm font-medium">Confirm Password</label>
            <input
              id="confirmPassword"
              type="password"
              v-bind="field"
              :class="[inputClass, errors.length ? 'border-red-300' : 'border-border']"
            />
            <p v-if="errors.length" class="text-xs text-red-500">{{ errors[0] }}</p>
          </div>
        </VeeField>

        <div class="flex flex-col gap-3 pt-2">
          <button
            type="submit"
            :disabled="isSubmitting || isGoogleRegistering"
            class="w-full rounded-lg bg-foreground text-background px-4 py-2.5 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40 flex items-center justify-center"
          >
            <Loader2 v-if="isSubmitting" class="mr-2 h-4 w-4 animate-spin" />
            {{ isSubmitting ? "Creating account..." : "Create account" }}
          </button>

          <!-- Google SSO -->
          <template v-if="hasSso">
            <div class="relative my-1">
              <div class="absolute inset-0 flex items-center">
                <span class="w-full border-t border-border/50" />
              </div>
              <div class="relative flex justify-center text-xs">
                <span class="bg-white/80 px-3 text-muted-foreground rounded">or</span>
              </div>
            </div>

            <div
              v-if="googleRegError"
              class="flex items-center gap-2 p-3 text-sm text-red-700 bg-red-50 border border-red-200/50 rounded-lg"
            >
              <X class="h-4 w-4 flex-shrink-0" />
              <span>{{ googleRegError }}</span>
            </div>

            <button
              type="button"
              :disabled="isGoogleRegistering || isSubmitting"
              class="w-full flex items-center justify-center gap-2 rounded-lg border border-border bg-white px-4 py-2.5 text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-40"
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

            <p class="text-[11px] text-center text-muted-foreground">
              Fill in your name and email first, then sign up with Google.
            </p>
          </template>
        </div>
      </form>
    </div>

    <p class="text-center text-sm text-muted-foreground">
      Already have an account?
      <button
        type="button"
        class="text-foreground font-medium hover:underline underline-offset-4"
        @click="emit('login')"
      >
        Sign in
      </button>
    </p>
  </div>
</template>
