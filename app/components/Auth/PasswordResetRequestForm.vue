<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { ref } from "vue";
import { useForm, Field as VeeField } from "vee-validate";
import { toTypedSchema } from "@vee-validate/zod";
import { z } from "zod";
import { cn } from "@/lib/utils";
import { Loader2, CheckCircle2, ArrowLeft } from "lucide-vue-next";

const props = defineProps<{
  class?: HTMLAttributes["class"];
}>();

const emit = defineEmits<{
  (e: "submit", values: { email: string }): void;
  (e: "back"): void;
}>();

const formSchema = toTypedSchema(
  z.object({
    email: z.string().email("Please enter a valid email address"),
  })
);

const { handleSubmit, isSubmitting } = useForm({
  validationSchema: formSchema,
  initialValues: {
    email: "",
  },
});

const isSuccess = ref(false);

const onSubmit = handleSubmit(async (values) => {
  emit("submit", { email: values.email! });
  isSuccess.value = true;
});
</script>

<template>
  <div :class="cn('flex flex-col gap-6 w-full max-w-sm', props.class)">
    <div class="glass rounded-2xl border border-white/40 shadow-lg backdrop-blur-xl p-8">
      <!-- Header -->
      <div class="text-center mb-6">
        <h3 class="text-xl font-semibold">Reset password</h3>
        <p class="text-sm text-muted-foreground mt-1">
          Enter your email and we'll send you a reset link
        </p>
      </div>

      <!-- Success state -->
      <template v-if="isSuccess">
        <div class="flex flex-col items-center justify-center py-6 text-center">
          <div class="w-12 h-12 rounded-full bg-green-50 flex items-center justify-center mb-4">
            <CheckCircle2 class="h-6 w-6 text-green-500" />
          </div>
          <h4 class="text-base font-semibold mb-1">Check your email</h4>
          <p class="text-sm text-muted-foreground mb-6">
            If an account exists with that email, we've sent a password reset link.
          </p>
          <button
            type="button"
            class="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
            @click="emit('back')"
          >
            <ArrowLeft class="h-4 w-4" />
            Back to login
          </button>
        </div>
      </template>

      <!-- Form -->
      <template v-else>
        <form @submit="onSubmit" class="space-y-4">
          <VeeField v-slot="{ field, errors }" name="email">
            <div class="space-y-1.5">
              <label for="reset-email" class="text-sm font-medium">Email</label>
              <input
                id="reset-email"
                type="email"
                placeholder="you@example.com"
                v-bind="field"
                class="w-full rounded-lg border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--cyan)] focus:border-transparent transition-shadow"
                :class="errors.length ? 'border-red-300' : 'border-border'"
              />
              <p v-if="errors.length" class="text-xs text-red-500">{{ errors[0] }}</p>
            </div>
          </VeeField>

          <div class="flex flex-col gap-3 pt-2">
            <button
              type="submit"
              :disabled="isSubmitting"
              class="w-full rounded-lg bg-foreground text-background px-4 py-2.5 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40 flex items-center justify-center"
            >
              <Loader2 v-if="isSubmitting" class="mr-2 h-4 w-4 animate-spin" />
              {{ isSubmitting ? "Sending..." : "Send reset link" }}
            </button>

            <button
              type="button"
              class="flex items-center justify-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
              @click="emit('back')"
            >
              <ArrowLeft class="h-4 w-4" />
              Back to login
            </button>
          </div>
        </form>
      </template>
    </div>
  </div>
</template>
