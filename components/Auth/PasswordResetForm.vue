<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { ref, computed, watch } from "vue";
import { useForm, Field as VeeField } from "vee-validate";
import { toTypedSchema } from "@vee-validate/zod";
import { z } from "zod";
import { refDebounced } from "@vueuse/core";
import { cn } from "@/lib/utils";
import { Loader2, Check, X, CheckCircle2 } from "lucide-vue-next";

const props = defineProps<{
  class?: HTMLAttributes["class"];
  token?: string;
}>();

const emit = defineEmits<{
  (e: "submit", values: { password: string; token: string }): void;
  (e: "login"): void;
}>();

const formSchema = toTypedSchema(
  z
    .object({
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
    password: "",
    confirmPassword: "",
  },
});

const isSuccess = ref(false);

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
  if (!props.token) return;
  emit("submit", { password: values.password!, token: props.token });
  isSuccess.value = true;
});
</script>

<template>
  <div :class="cn('flex flex-col gap-6', props.class)">
    <div class="bg-card text-card-foreground rounded-lg border shadow-sm">
      <div class="flex flex-col space-y-1.5 p-6">
        <h3 class="text-2xl font-semibold leading-none tracking-tight">
          Set new password
        </h3>
        <p class="text-sm text-muted-foreground">
          Enter your new password below
        </p>
      </div>
      <div class="p-6 pt-0">
        <template v-if="isSuccess">
          <div class="flex flex-col items-center justify-center py-8 text-center">
            <CheckCircle2 class="h-12 w-12 text-green-500 mb-4" />
            <h4 class="text-lg font-medium mb-2">Password updated!</h4>
            <p class="text-sm text-muted-foreground mb-6">
              Your password has been successfully reset.
            </p>
            <button
              type="button"
              class="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              @click="emit('login')"
            >
              Continue to login
            </button>
          </div>
        </template>
        <template v-else>
          <form @submit="onSubmit" class="space-y-4">
            <VeeField v-slot="{ field, errors }" name="password">
              <div class="space-y-2">
                <label for="password" class="text-sm font-medium leading-none">
                  New Password
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
                :disabled="isSubmitting"
                class="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground ring-offset-background transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
              >
                <Loader2 v-if="isSubmitting" class="mr-2 h-4 w-4 animate-spin" />
                {{ isSubmitting ? "Updating..." : "Reset password" }}
              </button>
            </div>
          </form>
        </template>
      </div>
    </div>
  </div>
</template>
