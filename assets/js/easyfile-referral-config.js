window.EASYFILE_REFERRAL_CONFIG = Object.freeze({
  apiBase: "https://easyfile-referrals-prod-za.azurewebsites.net/api/referrals",
  referralsRequired: 3,
  statusPollMs: 30000,
  requestTimeoutMs: 10000,
  allowOfflineUnlockedAccess: false,
  qualifyingClickFallback: true,
  referralCodePattern: "^[A-Z0-9][A-Z0-9_-]{5,31}$",
  emailVerificationEnabled: false,
  emailSender: "referrals@easyfile.co.za",
  clientVersion: "2.1.0",
  supportEmail: "support@easyfile.co.za"
});
