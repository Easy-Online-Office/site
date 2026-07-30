/* Compatibility hook for generated referral identity controls. */
document.addEventListener("click", (event) => {
  const button = event.target.closest("#easyfileReferralIdentity form button");
  if (!button) return;
  const form = button.closest("form");
  if (!form) return;
  event.preventDefault();
  form.requestSubmit();
});
