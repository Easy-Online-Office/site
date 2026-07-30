window.EASYFILE_REFERRAL_CONFIG = Object.freeze({
  apiBase: "https://api-easyfile.skunkworks.africa/api/referrals",
  referralsRequired: 3,
  statusPollMs: 30000,
  requestTimeoutMs: 10000,
  allowOfflineUnlockedAccess: false,
  qualifyingClickFallback: true,
  referralCodePattern: "^[A-Z0-9][A-Z0-9_-]{5,31}$",
  clientVersion: "2.0.0",
  supportEmail: "support@easyfile.co.za"
});
