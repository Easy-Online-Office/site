# EasyFile referral edge controls

Production browser traffic must follow this path:

`www.easyfile.co.za -> Front Door WAF -> API Management -> Azure Function`

1. In APIM, create the secret named value `easyfile-referral-edge-shared-secret`.
2. Set the identical value as the Function App secret `EASYFILE_EDGE_SHARED_SECRET` and set `EASYFILE_REQUIRE_EDGE_GATEWAY=true`.
3. Configure the APIM backend with the Function origin, then bind `api-easyfile.skunkworks.africa` to APIM/Front Door. Do not point it directly at the Function App.
4. Apply `apim-referral-policy.xml` to the referral API. The deployment workflow does this when `AZURE_APIM_NAME` and `AZURE_APIM_API_ID` are configured.
5. Add this Front Door WAF custom rule to the owning policy and ensure that policy is in **Prevention** mode. It provides a coarse per-source-IP cap; APIM provides account/IP/device-risk limits.

   ```bash
   az network front-door waf-policy rule create \
     --name EasyFileReferralRateLimit \
     --policy-name "$AZURE_WAF_POLICY_NAME" \
     --resource-group "$AZURE_RESOURCE_GROUP" \
     --rule-type RateLimitRule \
     --rate-limit-duration 1 \
     --rate-limit-threshold 180 \
     --action Block \
     --priority 20 \
     --defer
   az network front-door waf-policy rule match-condition add \
     --name EasyFileReferralRateLimit \
     --policy-name "$AZURE_WAF_POLICY_NAME" \
     --resource-group "$AZURE_RESOURCE_GROUP" \
     --match-variable RequestUri \
     --operator Contains \
     --values '/api/referrals/'
   ```
6. Add a Function App access restriction allowing only the APIM/Front Door origin. The shared secret is defence in depth, not a substitute for origin access restrictions.

APIM retains only a SHA-256-derived counter key for the request email. `X-EasyFile-Device-Risk` is a risk signal only and must never be used as account identity or as a reason to block a legitimate customer without review.
