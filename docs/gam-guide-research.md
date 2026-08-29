# Google Ad Manager rewarded web ads research

Checked official Google documentation on 2026-08-29.

The official Ad Manager help page says rewarded web ads are supported for reservations, Preferred Deals, Open Auction, Private Auctions, and Programmatic Guaranteed, subject to the policies for ad units that offer rewards.

For rewarded web ads, the ad unit size does not affect ad serving. The Reward setting can define a reward amount and reward type, for example 1 life or 20 lives.

For reservations line items, use ad type `Video or audio` and expected creative size `1x1v (Video / VAST)`. For Ad Exchange line items, use ad type `Display (Standard)` and expected creative size `1x1 (Custom)`.

Rewarded web ads use Google Publisher Tag (GPT). The GPT sample documents `RewardedSlotReadyEvent`, `RewardedSlotGrantedEvent`, `RewardedSlotVideoCompletedEvent`, and `RewardedSlotClosedEvent`. The reward must be granted after the proper reward event, not merely when the ad is opened or closed.

The GPT sample notes that `defineOutOfPageSlot()` may return null, and rewarded web ads require a mobile-optimized page with neutral zoom/viewport. Google also requires compliance with reward-ad policies and user consent.

Sources:
- https://support.google.com/admanager/answer/9116812?hl=en
- https://support.google.com/admanager/answer/7496282?hl=en
- https://developers.google.com/publisher-tag/samples/display-rewarded-ad
