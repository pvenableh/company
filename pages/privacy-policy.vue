<script setup lang="ts">
/**
 * Privacy Policy
 * /privacy-policy
 */

definePageMeta({
	layout: 'default',
});

useSeoMeta({
	title: 'Privacy Policy | Business Connect',
	description: 'Privacy policy for Business Connect social media management platform.',
});

const lastUpdated = 'February 6, 2026';
const contactEmail = 'contact@huestudios.com';
const businessName = 'Hue Studios LLC';
const businessAddress = '605 Lincoln Road Suite 200, Miami Beach, FL';
const websiteUrl = 'https://huestudios.com';
</script>

<template>
	<div class="max-w-4xl mx-auto px-6 py-12 lg:py-16">
		<header class="mb-12">
			<h1 class="text-3xl lg:text-4xl font-bold text-gray-900 dark:text-white mb-4">Privacy Policy</h1>
			<p class="text-gray-500 dark:text-gray-400">Last updated: {{ lastUpdated }}</p>
		</header>

		<div class="prose prose-gray dark:prose-invert max-w-none">
			<!-- Introduction -->
			<section class="mb-10">
				<p>
					{{ businessName }} ("we," "our," or "us") operates a social media management platform that enables users to
					connect, manage, and publish content to third-party social media services including Instagram and TikTok. This
					Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our
					platform.
				</p>
				<p>
					By accessing or using our services, you agree to this Privacy Policy. If you do not agree with the terms of
					this Privacy Policy, please do not access the platform.
				</p>
			</section>

			<!-- Information We Collect -->
			<section class="mb-10">
				<h2 class="text-2xl font-semibold text-gray-900 dark:text-white mb-4">1. Information We Collect</h2>

				<h3 class="text-lg font-medium text-gray-900 dark:text-white mt-6 mb-3">1.1 Information You Provide</h3>
				<ul class="list-disc pl-6 space-y-2">
					<li>
						<strong>Account Information:</strong>
						When you create an account, we collect your name, email address, and any other information you choose to
						provide.
					</li>
					<li>
						<strong>Content:</strong>
						Posts, captions, images, videos, and other content you create or upload through our platform.
					</li>
					<li>
						<strong>Communications:</strong>
						Information you provide when you contact us for support or other inquiries.
					</li>
				</ul>

				<h3 class="text-lg font-medium text-gray-900 dark:text-white mt-6 mb-3">
					1.2 Information from Third-Party Platforms
				</h3>
				<p>When you connect your Instagram or TikTok accounts to our platform, we receive:</p>
				<ul class="list-disc pl-6 space-y-2">
					<li>
						<strong>Profile Information:</strong>
						Your username, display name, profile picture, and account identifiers from connected social media accounts.
					</li>
					<li>
						<strong>OAuth Tokens:</strong>
						Authentication tokens that allow us to post content and retrieve analytics on your behalf. These tokens are
						encrypted using AES-256-GCM encryption before storage.
					</li>
					<li>
						<strong>Analytics Data:</strong>
						Follower counts, engagement metrics, reach, impressions, and other performance data from your connected
						accounts.
					</li>
					<li>
						<strong>Comments:</strong>
						Comments on your posts that you choose to manage through our platform.
					</li>
				</ul>

				<h3 class="text-lg font-medium text-gray-900 dark:text-white mt-6 mb-3">
					1.3 Automatically Collected Information
				</h3>
				<ul class="list-disc pl-6 space-y-2">
					<li>
						<strong>Log Data:</strong>
						IP address, browser type, operating system, referring URLs, pages viewed, and access times.
					</li>
					<li>
						<strong>Device Information:</strong>
						Device type, unique device identifiers, and mobile network information.
					</li>
					<li>
						<strong>Cookies:</strong>
						We use essential cookies for authentication and session management.
					</li>
				</ul>
			</section>

			<!-- How We Use Your Information -->
			<section class="mb-10">
				<h2 class="text-2xl font-semibold text-gray-900 dark:text-white mb-4">2. How We Use Your Information</h2>
				<p>We use the information we collect to:</p>
				<ul class="list-disc pl-6 space-y-2">
					<li>Provide, maintain, and improve our social media management services</li>
					<li>Schedule and publish content to your connected social media accounts</li>
					<li>Display analytics and performance metrics for your accounts</li>
					<li>Manage comments and engagement on your behalf</li>
					<li>Send you service-related notifications and updates</li>
					<li>Respond to your inquiries and provide customer support</li>
					<li>Detect, prevent, and address technical issues and security threats</li>
					<li>Comply with legal obligations</li>
				</ul>
			</section>

			<!-- Data Storage and Security -->
			<section class="mb-10">
				<h2 class="text-2xl font-semibold text-gray-900 dark:text-white mb-4">3. Data Storage and Security</h2>
				<p>We implement industry-standard security measures to protect your data:</p>
				<ul class="list-disc pl-6 space-y-2">
					<li>
						<strong>Encryption:</strong>
						OAuth tokens and sensitive credentials are encrypted using AES-256-GCM encryption at rest.
					</li>
					<li>
						<strong>Secure Transmission:</strong>
						All data is transmitted over HTTPS/TLS.
					</li>
					<li>
						<strong>Access Controls:</strong>
						Access to user data is restricted to authorized personnel only.
					</li>
					<li>
						<strong>Regular Audits:</strong>
						We regularly review our security practices and update them as needed.
					</li>
				</ul>
				<p class="mt-4">
					While we strive to protect your information, no method of transmission over the Internet or electronic storage
					is 100% secure. We cannot guarantee absolute security.
				</p>
			</section>

			<!-- Third-Party Services -->
			<section class="mb-10">
				<h2 class="text-2xl font-semibold text-gray-900 dark:text-white mb-4">4. Third-Party Services and APIs</h2>
				<p>Our platform integrates with the following third-party services:</p>

				<h3 class="text-lg font-medium text-gray-900 dark:text-white mt-6 mb-3">
					4.1 Instagram (Meta Platforms, Inc.)
				</h3>
				<p>
					We use the Instagram Graph API to publish content and retrieve analytics. Your use of Instagram through our
					platform is also subject to
					<a
						href="https://www.facebook.com/privacy/policy/"
						target="_blank"
						rel="noopener"
						class="text-primary-600 hover:underline"
					>
						Meta's Privacy Policy
					</a>
					and
					<a
						href="https://developers.facebook.com/terms/"
						target="_blank"
						rel="noopener"
						class="text-primary-600 hover:underline"
					>
						Meta Platform Terms
					</a>
					.
				</p>

				<h3 class="text-lg font-medium text-gray-900 dark:text-white mt-6 mb-3">4.2 TikTok (ByteDance Ltd.)</h3>
				<p>
					We use the TikTok Content Posting API to publish content. Your use of TikTok through our platform is also
					subject to
					<a
						href="https://www.tiktok.com/legal/privacy-policy"
						target="_blank"
						rel="noopener"
						class="text-primary-600 hover:underline"
					>
						TikTok's Privacy Policy
					</a>
					and
					<a
						href="https://www.tiktok.com/legal/terms-of-service"
						target="_blank"
						rel="noopener"
						class="text-primary-600 hover:underline"
					>
						Terms of Service
					</a>
					.
				</p>

				<p class="mt-4">
					We only request the minimum permissions necessary to provide our services. You can revoke access to your
					social media accounts at any time through our platform settings or directly through the respective social
					media platform.
				</p>
			</section>

			<!-- Data Sharing -->
			<section class="mb-10">
				<h2 class="text-2xl font-semibold text-gray-900 dark:text-white mb-4">5. How We Share Your Information</h2>
				<p>We do not sell your personal information. We may share your information in the following circumstances:</p>
				<ul class="list-disc pl-6 space-y-2">
					<li>
						<strong>With Your Consent:</strong>
						When you explicitly authorize us to share information with third parties.
					</li>
					<li>
						<strong>Service Providers:</strong>
						With trusted third-party service providers who assist us in operating our platform (e.g., hosting,
						analytics), subject to confidentiality obligations.
					</li>
					<li>
						<strong>Legal Requirements:</strong>
						When required by law, legal process, or government request.
					</li>
					<li>
						<strong>Protection of Rights:</strong>
						To protect the rights, property, or safety of our company, users, or others.
					</li>
					<li>
						<strong>Business Transfers:</strong>
						In connection with a merger, acquisition, or sale of assets, with notice to affected users.
					</li>
				</ul>
			</section>

			<!-- Data Retention -->
			<section class="mb-10">
				<h2 class="text-2xl font-semibold text-gray-900 dark:text-white mb-4">6. Data Retention</h2>
				<p>
					We retain your information for as long as your account is active or as needed to provide you services.
					Specifically:
				</p>
				<ul class="list-disc pl-6 space-y-2">
					<li>
						<strong>Account Data:</strong>
						Retained until you delete your account.
					</li>
					<li>
						<strong>OAuth Tokens:</strong>
						Retained until you disconnect your social media accounts or tokens expire/are revoked.
					</li>
					<li>
						<strong>Analytics Snapshots:</strong>
						Retained for up to 24 months to provide historical performance data.
					</li>
					<li>
						<strong>Activity Logs:</strong>
						Retained for up to 12 months for security and audit purposes.
					</li>
					<li>
						<strong>Published Content:</strong>
						Metadata about published posts is retained; the actual content resides on the respective social media
						platforms.
					</li>
				</ul>
				<p class="mt-4">
					Upon account deletion, we will delete or anonymize your personal information within 30 days, except where
					retention is required by law.
				</p>
			</section>

			<!-- Your Rights -->
			<section class="mb-10">
				<h2 class="text-2xl font-semibold text-gray-900 dark:text-white mb-4">7. Your Rights and Choices</h2>
				<p>Depending on your location, you may have the following rights:</p>
				<ul class="list-disc pl-6 space-y-2">
					<li>
						<strong>Access:</strong>
						Request a copy of the personal information we hold about you.
					</li>
					<li>
						<strong>Correction:</strong>
						Request correction of inaccurate personal information.
					</li>
					<li>
						<strong>Deletion:</strong>
						Request deletion of your personal information.
					</li>
					<li>
						<strong>Portability:</strong>
						Request a copy of your data in a portable format.
					</li>
					<li>
						<strong>Withdraw Consent:</strong>
						Disconnect social media accounts at any time.
					</li>
					<li>
						<strong>Opt-Out:</strong>
						Opt out of non-essential communications.
					</li>
				</ul>
				<p class="mt-4">
					To exercise these rights, please contact us at
					<a :href="`mailto:${contactEmail}`" class="text-primary-600 hover:underline">
						{{ contactEmail }}
					</a>
					.
				</p>
			</section>

			<!-- California Privacy Rights -->
			<section class="mb-10">
				<h2 class="text-2xl font-semibold text-gray-900 dark:text-white mb-4">8. California Privacy Rights (CCPA)</h2>
				<p>
					If you are a California resident, you have additional rights under the California Consumer Privacy Act (CCPA):
				</p>
				<ul class="list-disc pl-6 space-y-2">
					<li>The right to know what personal information we collect, use, and disclose</li>
					<li>The right to request deletion of your personal information</li>
					<li>The right to opt-out of the sale of personal information (we do not sell personal information)</li>
					<li>The right to non-discrimination for exercising your privacy rights</li>
				</ul>
				<p class="mt-4">
					To make a request, contact us at
					<a :href="`mailto:${contactEmail}`" class="text-primary-600 hover:underline">
						{{ contactEmail }}
					</a>
					. We will verify your identity before processing your request.
				</p>
			</section>

			<!-- International Transfers -->
			<section class="mb-10">
				<h2 class="text-2xl font-semibold text-gray-900 dark:text-white mb-4">9. International Data Transfers</h2>
				<p>
					Our servers are located in the United States. If you access our services from outside the United States, your
					information may be transferred to, stored, and processed in the United States where our servers are located.
					By using our services, you consent to this transfer.
				</p>
			</section>

			<!-- Children's Privacy -->
			<section class="mb-10">
				<h2 class="text-2xl font-semibold text-gray-900 dark:text-white mb-4">10. Children's Privacy</h2>
				<p>
					Our services are not intended for individuals under the age of 18. We do not knowingly collect personal
					information from children. If we learn that we have collected personal information from a child under 18, we
					will delete that information promptly.
				</p>
			</section>

			<!-- Changes to This Policy -->
			<section class="mb-10">
				<h2 class="text-2xl font-semibold text-gray-900 dark:text-white mb-4">11. Changes to This Privacy Policy</h2>
				<p>
					We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new
					Privacy Policy on this page and updating the "Last updated" date. For material changes, we will provide
					additional notice such as an email notification. Your continued use of the platform after changes constitutes
					acceptance of the updated policy.
				</p>
			</section>

			<!-- Contact Us -->
			<section class="mb-10">
				<h2 class="text-2xl font-semibold text-gray-900 dark:text-white mb-4">12. Contact Us</h2>
				<p>If you have any questions about this Privacy Policy or our data practices, please contact us:</p>
				<div class="mt-4 p-6 bg-gray-50 dark:bg-gray-800 rounded-lg">
					<p class="font-medium text-gray-900 dark:text-white">{{ businessName }}</p>
					<p class="text-gray-600 dark:text-gray-400">{{ businessAddress }}</p>
					<p class="mt-2">
						<a :href="`mailto:${contactEmail}`" class="text-primary-600 hover:underline">
							{{ contactEmail }}
						</a>
					</p>
					<p>
						<a :href="websiteUrl" target="_blank" class="text-primary-600 hover:underline">
							{{ websiteUrl }}
						</a>
					</p>
				</div>
			</section>

			<!-- Platform-Specific Disclosures -->
			<section class="mb-10">
				<h2 class="text-2xl font-semibold text-gray-900 dark:text-white mb-4">13. Platform-Specific Disclosures</h2>

				<h3 class="text-lg font-medium text-gray-900 dark:text-white mt-6 mb-3">Instagram/Meta Integration</h3>
				<p>Our integration with Instagram allows you to:</p>
				<ul class="list-disc pl-6 space-y-2">
					<li>Publish images, videos, carousels, reels, and stories to your Instagram account</li>
					<li>View analytics including followers, reach, impressions, and engagement</li>
					<li>Manage comments on your posts</li>
				</ul>
				<p class="mt-2">
					We access only the data necessary to provide these features and do not store your Instagram password.
				</p>

				<h3 class="text-lg font-medium text-gray-900 dark:text-white mt-6 mb-3">TikTok Integration</h3>
				<p>Our integration with TikTok allows you to:</p>
				<ul class="list-disc pl-6 space-y-2">
					<li>Publish videos and photo posts to your TikTok account</li>
					<li>View basic analytics including followers, likes, and video counts</li>
				</ul>
				<p class="mt-2">
					We use TikTok's "Upload by URL" method which does not require additional content review. We access only the
					data necessary to provide these features.
				</p>
			</section>
		</div>

		<!-- Back to Home -->
		<div class="mt-12 pt-8 border-t border-gray-200 dark:border-gray-700">
			<UButton to="/" variant="ghost" icon="i-lucide-arrow-left">Back to Home</UButton>
		</div>
	</div>
</template>

<style scoped>
.prose h2 {
	@apply border-b border-gray-200 dark:border-gray-700 pb-2;
}

.prose a {
	@apply text-primary-600 dark:text-primary-400;
}

.prose ul {
	@apply text-gray-600 dark:text-gray-400;
}

.prose p {
	@apply text-gray-600 dark:text-gray-400;
}
</style>
