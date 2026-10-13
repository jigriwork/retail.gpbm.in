# GPBM Club: customer login and tiers (plan)

Status: plan only, nothing built. Written 2026-10-13. Tier names, thresholds and benefits are for the owner to decide.

## Goal

Every customer of Go Planet and Brand Mark can open a page, log in with their mobile number, and see:
- their tier,
- what that tier gives them,
- how close they are to the next tier,
- their purchases.

The page should also make the customer aware of **both** stores. Brand Mark's main problem is that people don't know it exists, and only 102 customers have shopped at both stores.

## What the customer sees

1. **Login:** they enter their mobile number and get a 6-digit code on WhatsApp. There is no password.
2. **Home card:** their name, a tier badge (for example Silver / Gold / Platinum), and "₹4,200 more to reach Gold" with a progress bar.
3. **My benefits:** the current tier's benefits, plus any active personal coupons (for example "₹300 at Brand Mark, valid till 30 Oct").
4. **My purchases:** date, store and amount of each bill, across both stores. Items can be added later.
5. **Our stores:** both stores with a map link, phone and timings.
6. **My details:** name, birthday and anniversary (for wishes and birthday offers), the WhatsApp offers on/off switch, and "delete my data".

## How login works

- **Customers are kept completely separate from staff.** They never get a staff account (Supabase Auth user). That way a customer login can never reach staff pages, even if a bug is introduced later.
- **One-time code on WhatsApp**, through MSG91, using a WhatsApp **authentication** template. This is the category Meta allows for login codes; the "account approved" template failed because it wasn't in this category. Cost is about ₹0.12 per code. SMS can be a fallback later (it needs DLT).
- **Codes are stored hashed** and expire in 5 minutes. Each number gets at most 5 tries and 3 codes per hour, and requests are also limited per device and IP address.
- **Session:** a signed, httpOnly cookie that lasts 30 days. It is only valid on the customer pages.
- **Address:** `retail.gpbm.in/club`, or a separate subdomain `club.gpbm.in`, installable on the phone like an app.

## Data model (new tables)

| Table | Purpose |
|---|---|
| `loyalty_tiers` | name, colour, sort order, rule (`min_spend_12m`, `min_visits_12m`), benefits text, active flag. The owner edits these |
| `customer_tier_status` | one row per mobile: current tier, 12-month spend, 12-month visits, next tier, amount still needed, tier kept until (grace date), computed at |
| `customer_tier_history` | every tier change (old tier → new tier, date, reason), for "you've been upgraded" messages and reporting |
| `customer_otps` | mobile, code hash, expiry, attempts, IP/device hash |
| `customer_sessions` | session id hash, mobile, created, last seen, expiry, revoked |
| `customer_coupons` (phase 3) | code, mobile, store, value, valid from/to, redeemed bill number, redeemed at |

All of these are read and written only by server code (the service role) or by `security definer` functions that take the mobile number from the customer's session. The browser never queries them directly.

## How tiers are worked out

- **Source:** existing bills (`sales_rows` from current Logic reports) for **both stores**, matched by mobile number. Net sale includes returns, which are negative lines.
- **Rule:** a rolling 12-month window. The tier is the highest one whose spend **or** visits rule the customer meets. Whether it's "or" or "and" is the owner's choice.
- **When:** recalculated every night (pg_cron, after the 11 PM report uploads), and straight away when a customer opens their page.
- **Downgrades** get a grace period, so the customer keeps their tier until the end of the next quarter. Upgrades apply immediately.
- **Upgrade message:** an automatic WhatsApp ("You're now Gold at GPBM 🎉"), using a marketing template, so it goes only to customers who agreed to offers.
- **Uploaded customers** (from the new upload page) start at the lowest tier until they buy.

## Staff side

- The customer page and list show a tier badge, and the list can be filtered by tier.
- **At the counter (phase 3):** staff type the customer's mobile and see their tier and coupons. When a coupon is used, its code goes into the Logic bill remark, and the app marks it redeemed when the sales report is uploaded.
- **Owner page `/app/customers/tiers`:** edit tiers and see how many customers are in each, with a "what if" preview before saving new thresholds.

## Phases

1. **Phase 1, login and view:** WhatsApp OTP login, sessions, home card, purchases, stores page. Fixed starting tiers, so the owner gives draft numbers.
2. **Phase 2, tier engine:** owner tier editor, nightly calculation, history, upgrade WhatsApp, tier badges in the staff app.
3. **Phase 3, benefits:** personal coupons (including "visit Brand Mark"), counter lookup, redemption tracking from bills, referral codes.

## Decisions needed from the owner

1. Tier names, and the spend/visit rule for each tier.
2. Benefits per tier: discount %, birthday gift, early sale access, free alteration, and so on.
3. Whether it's one shared club for both stores (recommended, since it pushes Go Planet customers to Brand Mark) or separate clubs.
4. The address: `retail.gpbm.in/club` or `club.gpbm.in`.
5. Whether family members can share a tier, with several numbers linked to one account.
6. How returns count: subtracted from spend (recommended) or ignored.

## Risks and dependencies

- **Tier accuracy depends on the mobile number being entered on every bill.** Today that's 91% at Go Planet and 79% at Brand Mark, so this must improve first.
- **The WhatsApp authentication template needs Meta's approval.** It is a fixed OTP format, so approval is usually straightforward.
- **Privacy (DPDP):** customers see only their own data. They need a consent line at first login and a working delete/opt-out.
