# Google rewarded ads – notes

Checked official Google documentation on 2026-08-29.

- Google Publisher Tag (GPT) has a web rewarded ad sample using `defineOutOfPageSlot` and events including `RewardedSlotReadyEvent`, `RewardedSlotGrantedEvent`, `RewardedSlotVideoCompletedEvent`, and `RewardedSlotClosedEvent`.
- The rewarded slot can create its own container; a normal ad `<div>` is not necessarily required.
- The GPT documentation says publishers must comply with policies for ad units that offer rewards and obtain user consent.
- The sample notes that rewarded ads are currently supported on mobile-optimized pages with a neutral viewport/zoom.
- Google AdSense documentation result concerns a “Rewarded ad” user choice in AdSense Offerwall. This is not the same integration surface as the GPT web rewarded-ad sample for a game revive reward.

Sources:
- https://developers.google.com/publisher-tag/samples/display-rewarded-ad
- https://support.google.com/adsense/answer/12726063?hl=en
- https://support.google.com/admanager/answer/9116812?hl=en
