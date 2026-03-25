// server/utils/twilioMaster.ts
/**
 * Master Twilio account client — provisions sub-accounts and phone numbers.
 *
 * Individual org calls (outbound voice, SMS) should use twilioSubaccount()
 * to get a client scoped to the org's sub-account for billing isolation.
 *
 * Communications is a $49/mo add-on. The sub-account is provisioned when
 * the add-on is activated (Task 8 handles billing, this handles infra).
 */

import Twilio from 'twilio';
import { readItem, updateItem } from '@directus/sdk';

let _masterClient: Twilio.Twilio | null = null;

function getMasterClient(): Twilio.Twilio {
	if (_masterClient) return _masterClient;
	const config = useRuntimeConfig();
	const sid = config.twilioAccountSid;
	const token = config.twilioAuthToken;
	if (!sid || !token) {
		throw new Error('TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN are required');
	}
	_masterClient = Twilio(sid, token);
	return _masterClient;
}

/**
 * Get or create a Twilio sub-account for an organization.
 * Idempotent — if the org already has a sub-account, returns the existing one.
 */
export async function getOrCreateSubAccount(orgId: string, orgName: string): Promise<{
	accountSid: string;
	authToken: string;
}> {
	const directus = getTypedDirectus();

	// Check if org already has a sub-account
	const org = await directus.request(
		readItem('organizations', orgId, {
			fields: ['twilio_subaccount_sid', 'twilio_subaccount_token', 'name'],
		})
	) as any;

	if (org.twilio_subaccount_sid && org.twilio_subaccount_token) {
		return {
			accountSid: org.twilio_subaccount_sid,
			authToken: org.twilio_subaccount_token,
		};
	}

	// Create a new sub-account
	const master = getMasterClient();
	const subAccount = await master.api.accounts.create({
		friendlyName: `Earnest — ${orgName || org.name || orgId}`,
	});

	// Persist credentials to org record
	await directus.request(
		updateItem('organizations', orgId, {
			twilio_subaccount_sid: subAccount.sid,
			twilio_subaccount_token: subAccount.authToken,
			twilio_subaccount_status: 'active',
		})
	);

	return {
		accountSid: subAccount.sid,
		authToken: subAccount.authToken,
	};
}

/**
 * Get a Twilio client scoped to an org's sub-account.
 * All org-level voice/SMS operations should use this client.
 */
export async function twilioSubaccount(orgId: string, orgName: string): Promise<Twilio.Twilio> {
	const { accountSid, authToken } = await getOrCreateSubAccount(orgId, orgName);
	return Twilio(accountSid, authToken);
}

/**
 * Search available phone numbers in an area code for an org.
 */
export async function searchPhoneNumbers(orgId: string, orgName: string, areaCode: string) {
	const client = await twilioSubaccount(orgId, orgName);
	return client.availablePhoneNumbers('US')
		.local
		.list({ areaCode: parseInt(areaCode), limit: 10 });
}

/**
 * Purchase a phone number for an org and configure webhooks.
 * The webhooks route back to Earnest API for call/SMS handling.
 */
export async function purchasePhoneNumber(
	orgId: string,
	orgName: string,
	phoneNumber: string,
	lineId: string, // phone_settings record ID for webhook routing
): Promise<string> {
	const config = useRuntimeConfig();
	const client = await twilioSubaccount(orgId, orgName);
	const baseUrl = config.public.siteUrl || 'https://earnest.guru';

	const purchased = await client.incomingPhoneNumbers.create({
		phoneNumber,
		voiceUrl: `${baseUrl}/api/phone/voice/${lineId}`,
		voiceMethod: 'POST',
		smsUrl: `${baseUrl}/api/phone/sms/${lineId}`,
		smsMethod: 'POST',
		statusCallback: `${baseUrl}/api/phone/status`,
		statusCallbackMethod: 'POST',
	});

	return purchased.sid;
}

/**
 * Suspend an org's sub-account (e.g., when add-on is cancelled).
 */
export async function suspendSubAccount(orgId: string): Promise<void> {
	const directus = getTypedDirectus();
	const org = await directus.request(
		readItem('organizations', orgId, {
			fields: ['twilio_subaccount_sid'],
		})
	) as any;

	if (!org.twilio_subaccount_sid) return;

	const master = getMasterClient();
	await master.api.accounts(org.twilio_subaccount_sid).update({ status: 'suspended' });

	await directus.request(
		updateItem('organizations', orgId, {
			twilio_subaccount_status: 'suspended',
		})
	);
}
