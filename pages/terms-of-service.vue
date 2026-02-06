<script setup lang="ts">
/**
 * Terms of Service
 * /terms-of-service
 */

definePageMeta({
	layout: 'default',
});

useSeoMeta({
	title: 'Terms of Service | Business Connect',
	description: 'Terms of service for Business Connect social media management platform.',
});

const lastUpdated = 'February 6, 2026';
const contactEmail = 'contact@huestudios.com';
const businessName = 'Hue Studios LLC';
const businessAddress = '605 Lincoln Road Suite 200, Miami Beach, FL';
</script>

<template>
	<div class="max-w-4xl mx-auto px-6 py-12 lg:py-16">
		<header class="mb-12">
			<h1 class="text-3xl lg:text-4xl font-bold text-gray-900 dark:text-white mb-4">Terms of Service</h1>
			<p class="text-gray-500 dark:text-gray-400">Last updated: {{ lastUpdated }}</p>
		</header>

		<div class="prose prose-gray dark:prose-invert max-w-none">
			<!-- Introduction -->
			<section class="mb-10">
				<p>
					Welcome to the {{ businessName }} social media management platform. These Terms of Service ("Terms") govern
					your access to and use of our platform, including any associated services, features, and content
					(collectively, the "Service").
				</p>
				<p>
					By accessing or using the Service, you agree to be bound by these Terms. If you do not agree to these Terms,
					you may not access or use the Service.
				</p>
			</section>

			<!-- Eligibility -->
			<section class="mb-10">
				<h2 class="text-2xl font-semibold text-gray-900 dark:text-white mb-4">1. Eligibility</h2>
				<p>To use the Service, you must:</p>
				<ul class="list-disc pl-6 space-y-2">
					<li>Be at least 18 years old</li>
					<li>Have the legal capacity to enter into a binding agreement</li>
					<li>Not be prohibited from using the Service under applicable law</li>
					<li>Have valid accounts on the third-party platforms (Instagram, TikTok) you wish to connect</li>
				</ul>
				<p class="mt-4">
					By using the Service, you represent and warrant that you meet these eligibility requirements.
				</p>
			</section>

			<!-- Account Registration -->
			<section class="mb-10">
				<h2 class="text-2xl font-semibold text-gray-900 dark:text-white mb-4">2. Account Registration and Security</h2>
				<p>
					You are responsible for maintaining the confidentiality of your account credentials and for all activities
					that occur under your account. You agree to:
				</p>
				<ul class="list-disc pl-6 space-y-2">
					<li>Provide accurate, current, and complete information during registration</li>
					<li>Maintain and promptly update your account information</li>
					<li>Keep your password secure and confidential</li>
					<li>Notify us immediately of any unauthorized access to your account</li>
					<li>Accept responsibility for all activities that occur under your account</li>
				</ul>
				<p class="mt-4">
					We reserve the right to suspend or terminate accounts that violate these Terms or engage in fraudulent or
					abusive behavior.
				</p>
			</section>

			<!-- Third-Party Platform Connections -->
			<section class="mb-10">
				<h2 class="text-2xl font-semibold text-gray-900 dark:text-white mb-4">3. Third-Party Platform Connections</h2>
				<p>Our Service allows you to connect your Instagram and TikTok accounts. By connecting these accounts, you:</p>
				<ul class="list-disc pl-6 space-y-2">
					<li>
						Authorize us to access your accounts using OAuth tokens to perform actions on your behalf, including
						publishing content and retrieving analytics
					</li>
					<li>
						Represent that you have the authority to grant such access and that doing so does not violate any agreement
						with the third-party platform
					</li>
					<li>
						Acknowledge that your use of third-party platforms remains subject to their respective terms of service and
						policies
					</li>
					<li>
						Understand that we are not responsible for the availability, accuracy, or functionality of third-party
						platforms
					</li>
				</ul>
				<p class="mt-4">
					You may disconnect your third-party accounts at any time through our platform settings or directly through the
					respective social media platform.
				</p>
			</section>

			<!-- Acceptable Use -->
			<section class="mb-10">
				<h2 class="text-2xl font-semibold text-gray-900 dark:text-white mb-4">4. Acceptable Use</h2>
				<p>You agree not to use the Service to:</p>
				<ul class="list-disc pl-6 space-y-2">
					<li>Violate any applicable law, regulation, or third-party rights</li>
					<li>
						Post, upload, or distribute content that is illegal, harmful, threatening, abusive, harassing, defamatory,
						vulgar, obscene, or otherwise objectionable
					</li>
					<li>Infringe on any intellectual property rights of others</li>
					<li>Spread malware, viruses, or other malicious code</li>
					<li>Attempt to gain unauthorized access to our systems or other users' accounts</li>
					<li>Interfere with or disrupt the Service or servers connected to the Service</li>
					<li>Use automated means to access the Service without our permission</li>
					<li>Engage in spamming, phishing, or other deceptive practices</li>
					<li>Violate the terms of service of connected third-party platforms</li>
					<li>Use the Service for any illegal or unauthorized purpose</li>
				</ul>
				<p class="mt-4">
					We reserve the right to remove content and suspend or terminate accounts that violate these guidelines.
				</p>
			</section>

			<!-- Content Ownership -->
			<section class="mb-10">
				<h2 class="text-2xl font-semibold text-gray-900 dark:text-white mb-4">5. Content and Intellectual Property</h2>

				<h3 class="text-lg font-medium text-gray-900 dark:text-white mt-6 mb-3">5.1 Your Content</h3>
				<p>
					You retain ownership of all content you create, upload, or publish through the Service ("Your Content"). By
					using the Service, you grant us a limited, non-exclusive, royalty-free license to use, store, and process Your
					Content solely to provide and improve the Service.
				</p>
				<p class="mt-2">
					You represent and warrant that you have all necessary rights to Your Content and that Your Content does not
					infringe on the rights of any third party.
				</p>

				<h3 class="text-lg font-medium text-gray-900 dark:text-white mt-6 mb-3">5.2 Our Content</h3>
				<p>
					The Service, including its design, features, and underlying technology, is owned by
					{{ businessName }} and protected by intellectual property laws. You may not copy, modify, distribute, or
					reverse engineer any part of the Service without our prior written consent.
				</p>
			</section>

			<!-- Fees and Payment -->
			<section class="mb-10">
				<h2 class="text-2xl font-semibold text-gray-900 dark:text-white mb-4">6. Fees and Payment</h2>
				<p>Certain features of the Service may require payment. By subscribing to a paid plan, you agree to:</p>
				<ul class="list-disc pl-6 space-y-2">
					<li>Pay all applicable fees as described at the time of purchase</li>
					<li>Provide accurate billing information</li>
					<li>Authorize us to charge your payment method for recurring subscriptions</li>
				</ul>
				<p class="mt-4">
					Fees are non-refundable except as required by law or as expressly stated in these Terms. We reserve the right
					to change our pricing with reasonable notice.
				</p>
			</section>

			<!-- Disclaimers -->
			<section class="mb-10">
				<h2 class="text-2xl font-semibold text-gray-900 dark:text-white mb-4">7. Disclaimers</h2>
				<p class="uppercase font-medium">
					THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
					INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND
					NON-INFRINGEMENT.
				</p>
				<p class="mt-4">We do not warrant that:</p>
				<ul class="list-disc pl-6 space-y-2">
					<li>The Service will be uninterrupted, secure, or error-free</li>
					<li>The results obtained from the Service will be accurate or reliable</li>
					<li>Third-party platforms will remain available or compatible with our Service</li>
					<li>Any defects in the Service will be corrected</li>
				</ul>
			</section>

			<!-- Limitation of Liability -->
			<section class="mb-10">
				<h2 class="text-2xl font-semibold text-gray-900 dark:text-white mb-4">8. Limitation of Liability</h2>
				<p class="uppercase font-medium">
					TO THE MAXIMUM EXTENT PERMITTED BY LAW, {{ businessName.toUpperCase() }} SHALL NOT BE LIABLE FOR ANY INDIRECT,
					INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED TO LOSS OF PROFITS, DATA,
					USE, OR GOODWILL, ARISING OUT OF OR RELATED TO YOUR USE OF THE SERVICE.
				</p>
				<p class="mt-4">
					Our total liability for any claims arising from or related to these Terms or the Service shall not exceed the
					amount you paid us in the twelve (12) months preceding the claim, or one hundred dollars ($100), whichever is
					greater.
				</p>
				<p class="mt-4">
					Some jurisdictions do not allow the exclusion or limitation of certain damages, so some of the above
					limitations may not apply to you.
				</p>
			</section>

			<!-- Indemnification -->
			<section class="mb-10">
				<h2 class="text-2xl font-semibold text-gray-900 dark:text-white mb-4">9. Indemnification</h2>
				<p>
					You agree to indemnify, defend, and hold harmless {{ businessName }}, its officers, directors, employees, and
					agents from and against any claims, liabilities, damages, losses, and expenses (including reasonable
					attorneys' fees) arising out of or related to:
				</p>
				<ul class="list-disc pl-6 space-y-2">
					<li>Your use of the Service</li>
					<li>Your violation of these Terms</li>
					<li>Your violation of any third-party rights, including intellectual property rights</li>
					<li>Any content you submit, post, or transmit through the Service</li>
				</ul>
			</section>

			<!-- Termination -->
			<section class="mb-10">
				<h2 class="text-2xl font-semibold text-gray-900 dark:text-white mb-4">10. Termination</h2>
				<p>
					You may terminate your account at any time by contacting us or using the account deletion feature in the
					Service.
				</p>
				<p class="mt-4">
					We may suspend or terminate your access to the Service at any time, with or without cause, with or without
					notice, including if we believe you have violated these Terms.
				</p>
				<p class="mt-4">
					Upon termination, your right to use the Service will immediately cease. Provisions that by their nature should
					survive termination (including ownership, disclaimers, indemnification, and limitations of liability) shall
					survive.
				</p>
			</section>

			<!-- Dispute Resolution -->
			<section class="mb-10">
				<h2 class="text-2xl font-semibold text-gray-900 dark:text-white mb-4">11. Dispute Resolution</h2>
				<p>
					Any disputes arising from or relating to these Terms or the Service shall be resolved through binding
					arbitration in Miami-Dade County, Florida, in accordance with the rules of the American Arbitration
					Association. The arbitrator's decision shall be final and binding.
				</p>
				<p class="mt-4">
					You agree to waive any right to a jury trial or to participate in a class action. This arbitration agreement
					shall survive termination of these Terms.
				</p>
				<p class="mt-4">
					Notwithstanding the foregoing, either party may seek injunctive or other equitable relief in any court of
					competent jurisdiction.
				</p>
			</section>

			<!-- Governing Law -->
			<section class="mb-10">
				<h2 class="text-2xl font-semibold text-gray-900 dark:text-white mb-4">12. Governing Law</h2>
				<p>
					These Terms shall be governed by and construed in accordance with the laws of the State of Florida, without
					regard to its conflict of law provisions.
				</p>
			</section>

			<!-- Changes to Terms -->
			<section class="mb-10">
				<h2 class="text-2xl font-semibold text-gray-900 dark:text-white mb-4">13. Changes to These Terms</h2>
				<p>
					We reserve the right to modify these Terms at any time. We will notify you of material changes by posting the
					updated Terms on this page and updating the "Last updated" date. For significant changes, we may also provide
					additional notice such as an email notification.
				</p>
				<p class="mt-4">
					Your continued use of the Service after changes become effective constitutes your acceptance of the revised
					Terms. If you do not agree to the revised Terms, you must stop using the Service.
				</p>
			</section>

			<!-- Miscellaneous -->
			<section class="mb-10">
				<h2 class="text-2xl font-semibold text-gray-900 dark:text-white mb-4">14. Miscellaneous</h2>
				<ul class="list-disc pl-6 space-y-2">
					<li>
						<strong>Entire Agreement:</strong>
						These Terms constitute the entire agreement between you and {{ businessName }} regarding the Service.
					</li>
					<li>
						<strong>Severability:</strong>
						If any provision of these Terms is found to be unenforceable, the remaining provisions shall remain in full
						force and effect.
					</li>
					<li>
						<strong>Waiver:</strong>
						Our failure to enforce any provision of these Terms shall not constitute a waiver of that provision.
					</li>
					<li>
						<strong>Assignment:</strong>
						You may not assign or transfer these Terms without our prior written consent. We may assign our rights and
						obligations without restriction.
					</li>
					<li>
						<strong>Force Majeure:</strong>
						We shall not be liable for any failure or delay resulting from circumstances beyond our reasonable control.
					</li>
				</ul>
			</section>

			<!-- Contact -->
			<section class="mb-10">
				<h2 class="text-2xl font-semibold text-gray-900 dark:text-white mb-4">15. Contact Us</h2>
				<p>If you have any questions about these Terms, please contact us:</p>
				<div class="mt-4 p-6 bg-gray-50 dark:bg-gray-800 rounded-lg">
					<p class="font-medium text-gray-900 dark:text-white">{{ businessName }}</p>
					<p class="text-gray-600 dark:text-gray-400">{{ businessAddress }}</p>
					<p class="mt-2">
						<a :href="`mailto:${contactEmail}`" class="text-primary hover:underline">
							{{ contactEmail }}
						</a>
					</p>
				</div>
			</section>
		</div>

		<!-- Back to Home -->
		<div class="mt-12 pt-8 border-t border-gray-200 dark:border-gray-700">
			<UButton to="/" variant="ghost" icon="i-lucide-arrow-left">Back to Home</UButton>
		</div>
	</div>
</template>

<style scoped>
@reference "~/assets/css/tailwind.css";

.prose h2 {
	@apply border-b border-gray-200 dark:border-gray-700 pb-2;
}

.prose a {
	@apply text-primary;
}

.prose ul {
	@apply text-gray-600 dark:text-gray-400;
}

.prose p {
	@apply text-gray-600 dark:text-gray-400;
}
</style>
