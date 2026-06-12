# Owner Workflow Reality Audit

Date: 2026-06-12

Version audited: v6.0.0

Scope: audit-only review of whether GPBM Retail is genuinely useful for the owner workflow, especially purchasing and restocking decisions. No code, schema, data, parsers, payslip modules, salary modules, or security rules were changed for this audit.

## 1. Executive Summary

Owner workflow readiness rating: 7/10

Purchasing/restock readiness rating: 6.5/10

Brand search readiness rating: 7/10

Category stock readiness rating: 7/10

Product/item detail readiness rating: 5.5/10

Staff sales readiness rating: 7/10

Speed/performance readiness rating: 6.5/10

The app is now meaningfully useful for the owner. The strongest owner-facing feature is `/app/reports/business`, which combines sales rows and latest monthly stock rows into one searchable page with brand, category, item, size, staff, stock, restock, slow/no-sale, warnings, CSV, print, copy, and WhatsApp share actions. For a real purchasing moment like "I am buying Adidas stock", the owner can get a usable answer if the uploaded sales and stock files have clean brand/category/item/size data.

The app is not yet a complete purchasing cockpit. The biggest gap is drilldown depth: the owner can search/filter and see top rows, but cannot click a brand/product into a dedicated detail page with full history, size curve, vendor, purchase quantity recommendation, and confidence summary. Product search is also partly limited because item matching/search is applied after loading rows from server-side store/date/brand/category/size filters. That is acceptable for v6.0.0, but it will become weaker after a large historical import.

Biggest blockers:

- No dedicated brand detail page.
- No dedicated product/item detail page.
- No purchase order draft or suggested reorder quantity.
- Product search is not fully indexed/server-side.
- Brand/category/product normalization is still dependent on raw uploaded file values.
- Slow/no-sale is correctly cautious, but real dead stock confidence needs purchase date or ageing.
- Today page is still heavy and not optimized as a fast owner decision panel.
- Staff zero-sale visibility is missing because staff with no sales rows do not appear.
- CSV is useful, but Excel workbook/PDF export is missing.
- Reports navigation still has overlapping analytics pages that can confuse a non-technical owner.

Implemented well:

- Business Reporting route exists and is clearly aimed at brand/category/item/size performance.
- Brand and category rows show sales, sold quantity, returns, bills, stock quantity, stock MRP, items, sizes, top staff, and movement.
- Item table is business-readable: item name is primary, barcode/SKU are secondary.
- Size-wise stock vs sale is visible when explicit size data exists.
- Restock Suggestions, Low Stock by Size, and Slow / No-sale Signals exist.
- Warnings exist for missing stock, missing sales reports, missing sales size, weak matching, and monthly stock not being live inventory.
- Share/copy/print/CSV actions exist.
- Compound indexes were added for common sales and stock reporting filters.
- v6.0.0 auth/session fixes improve login persistence and repeated auth reads.
- Report status batching reduces avoidable tab-switch overhead.

Still confusing or missing:

- The owner has to know that Business Reporting is the purchasing page.
- Today does not make Business Reporting the main "buying/restock" action.
- Reports page mixes upload workflows, analytics workflows, staff, aliases, correction, stock, salary attendance, employees, and payslips.
- Stock Analytics still says "dead stock candidates"; Business Reporting is safer with "Slow / No-sale", but wording should be consistent.
- Product rows are capped and not clickable.
- Category/brand spelling variants can split the same business entity.
- There is no per-product confidence card.

Top 5 fixes needed next:

1. Owner Workflow Polish for Business Reporting: clearer entry points, selected brand/category summary, better empty states, better warnings, safer labels.
2. Today Performance and Lazy Loading: make Today fast and decision-focused, move heavy blocks behind links or progressive sections.
3. Brand/Product Detail Pages: click brand/product to full detail with size curve, stock, sales, staff, returns, confidence, and export.
4. Excel/PDF Export: owner-ready workbook with separate sheets and a printable PDF purchasing report.
5. Product Master and Normalization: normalize brand/category/item/barcode/SKU to reduce duplicate spellings and weak matches.

## 2. Owner Navigation Audit

Journey audited:

- Login: works through `/login`; version badge shows v6.0.0. Recent `proxy.ts` session refresh makes close/reopen login persistence more reliable.
- Today page: useful for daily status, but still crowded. It shows AI Secretary, staff phones, payslips, receivables, audit, stock pulse, sales pulse, workflows, checklist, reviews, tasks, updates, stores, reports, and cards. It is not yet a crisp owner purchasing entry.
- Reports page: main hub for uploads and analytics. Business Reporting appears near the top and the copy says "Search brand, category, item, size, stock and sales performance."
- Business Reporting page: strongest purchasing workflow.
- Staff Sales page: good staff ranking by period/store, but not enough for lowest/zero-sale accountability.
- Stock Analytics page: useful high-level stock movement dashboard, but Business Reporting is more complete for purchasing.
- Sales Correction Center: owner-only, useful for fixing wrong sales data and bulk historical upload, with audit logs.
- Settings/Users: owner can manage users, store targets, firm mapping, and personal Life Flow link from Settings.

Can owner quickly find Business Reporting?

Verdict: somewhat clear.

Business Reporting is visible on the Reports page, but not strongly promoted from Today. If the owner thinks "I am buying stock", they may look under Stock Analytics instead of Business Reporting.

Can owner understand where to go for brand/product/stock information?

Verdict: somewhat clear.

Reports page has both Business Reporting and Stock Analytics. Business Reporting is the right place for combined stock and sales, but Stock Analytics name can attract the owner first. This needs clearer labels such as "Buying / Restock Report" or "Brand and Product Purchase Report."

Duplicate/confusing report pages:

- Business Reporting: combined brand/category/item/size purchasing view.
- Sales Analytics: sales-only trend and rankings.
- Stock Analytics: stock-only movement candidates.
- Staff Sales Report: staff-only sales ranking.
- Daily Sales Report and Monthly Stock Report: upload/status pages.

These pages are individually useful, but their names overlap. Reports page should be reorganized into "Owner Decisions", "Uploads", "Data Correction", and "Admin/Staff".

Old pages still useful or confusing:

- Sales Analytics remains useful for target and sales-only view.
- Stock Analytics remains useful but should not be the main purchasing page.
- Staff Sales remains useful but needs zero-sale and custom range.
- Store Detail is useful for a single-store operational pulse, not purchasing.

Should Today link more clearly to Business Reporting?

Yes. Today should have an owner-only card like "Buying / Restock Decisions" linking to `/app/reports/business`, probably above stock pulse.

Should Reports page be reorganized?

Yes. Verdict: needs redesign.

Current owner navigation verdict: somewhat clear.

## 3. Business Reporting Feature Verification

Route: `/app/reports/business`

| Filter | Implemented | Where it works | Owner-friendly | Fast | Limitation |
| --- | --- | --- | --- | --- | --- |
| Store filter | Yes | Server-side in sales and stock queries through `storeIds` | Yes | Good | Limited to accessible stores and filtered to GP/BM codes on page |
| Period filter | Yes | Server-side date range for sales rows | Yes | Good | Stock remains latest monthly upload, not period inventory |
| This month | Yes | Default period via `getBusinessDateRange("month")` | Yes | Good | Could hide older movement unless owner changes period |
| This year | Yes | Server-side sales date range from Jan 1 to today | Yes | Moderate | Can scan many sales rows after bulk historical upload |
| Custom date range | Yes | Server-side sales date range | Yes | Moderate | Owner must apply dates manually |
| Brand search/select | Yes | `brand` equality server-side for sales and stock | Mostly | Good with indexes | Raw spelling must match uploaded data exactly |
| Category search/select | Yes | `category` equality server-side for sales and stock | Mostly | Good with indexes | Raw category spelling can split categories |
| Item/product search | Yes | In-memory filter after rows load | Partial | Risky at scale | Search is not fully database-indexed/server-side |
| Size filter | Yes | `size` equality server-side for sales and stock | Yes | Good | Only reliable if uploaded explicit size exists |

Overall verification: implemented and usable for v6.0.0, but product search and normalization are the main scale risks.

## 4. Brand Workflow Audit

Owner example: "I am purchasing Adidas stock. I want to search Adidas and understand what to order."

| Need | Status | Notes |
| --- | --- | --- |
| Brand name clearly, not barcode-first | Implemented | Brand table and item table show brand/product first. Barcode/SKU are secondary. |
| Current stock quantity for brand | Implemented | Brand Performance has Stock Qty. |
| Current stock MRP value for brand | Implemented | Brand Performance has Stock MRP. |
| Total sold quantity for brand | Implemented | Brand Performance has Sold Qty for selected period. |
| Total sale value for brand | Implemented | Brand Performance has Net Sales. |
| Sold this month | Implemented | Default period is this month. |
| Sold this year | Implemented | Period supports This year. |
| Custom date sale | Implemented | Period supports custom start/end. |
| Size-wise stock for brand | Implemented | Size-wise table after filtering brand. |
| Size-wise sold quantity for brand | Implemented if sales size exists | Warning appears when sales size is missing. |
| Item/product list under brand | Partial | Item table shows top 50 matching products, not complete drilldown. |
| Top selling items under brand | Partial | Item table sorted by combined sales/stock signal, not a dedicated top-selling-only brand section. |
| Slow/no-sale items under brand | Implemented | Slow / No-sale signal section responds to selected filters. |
| Restock suggestions under brand | Implemented | Restock Suggestions responds to selected filters. |
| Staff who sold the brand | Implemented | Staff by Selected Filters shows staff for selected brand. |
| Returns under brand | Implemented | Return amount/quantity shown in summary and tables. |
| CSV/share report for brand | Implemented | Copy, WhatsApp, print, CSV use selected filters. |

Verdict: partial to usable.

For a real Adidas purchase, the owner can make a first-pass buying decision. However, they still need a dedicated brand detail view with full product list, size curve, historical sales by month, and reorder quantity suggestions before this becomes truly purchasing-grade.

## 5. Category Workflow Audit

Owner example: "I want to see Footwear stock and sales."

| Need | Status | Notes |
| --- | --- | --- |
| Footwear current stock | Implemented | Category Performance and summary after category filter. |
| Footwear stock MRP value | Implemented | Category Performance has Stock MRP. |
| Footwear sale month/year/custom | Implemented | Period filter covers month/year/custom. |
| Footwear sold quantity | Implemented | Category Performance has Sold Qty. |
| Footwear size-wise stock | Implemented | Size-wise Quantity after category filter. |
| Footwear size-wise sold quantity | Implemented if sales size exists | Explicit sales size required. |
| Footwear brand ranking | Partial | Brand Performance after category filter gives brand rows. |
| Footwear product ranking | Partial | Item table gives top 50, not full ranking/detail. |
| Footwear staff ranking | Implemented | Staff by Selected Filters. |
| Footwear restock suggestions | Implemented | Restock Suggestions. |
| Footwear slow/no-sale signals | Implemented | Slow / No-sale Signals. |
| Footwear returns | Implemented | Summary and category rows. |
| CSV/share report | Implemented | Current filters included. |

Category values come directly from uploaded files. That is fast to build and transparent, but it can confuse the owner if files contain spelling variations like "FOOTWEAR", "Footwear", "Foot Wear", or store-specific category names. There is no category master/normalization yet.

Verdict: usable with data-quality caveat.

## 6. Product/Item Workflow Audit

Owner example: "I want details for one product before ordering more."

Search support:

| Search method | Status | Notes |
| --- | --- | --- |
| Item name | Implemented | `itemSearch` checks item name in fetched rows. |
| Brand + item | Partial | Owner can use brand filter plus item search. |
| Barcode | Implemented | `itemSearch` checks barcode in fetched rows. |
| SKU | Implemented | `itemSearch` checks SKU in fetched rows. |

Product detail visibility:

| Need | Status | Notes |
| --- | --- | --- |
| Product name clearly | Implemented | Item/Product Name is primary. |
| Brand | Implemented | Item table column. |
| Category | Implemented | Item table column. |
| Current stock | Implemented | Stock Qty. |
| Current MRP value | Implemented | Stock MRP. |
| Sold quantity | Implemented | Sold Qty. |
| Net sale | Implemented | Net Sales. |
| Return quantity/amount | Partial | Return Qty in item table, return amount in data model but not table column. |
| Available sizes | Implemented | Size column combines available/sold sizes. |
| Sold sizes | Partial | Combined with available sizes, not separated in item row. |
| Stock vs sold | Implemented | Stock Qty and Sold Qty side by side. |
| Staff who sold it | Implemented | Staff column, sliced to first 5 names. |
| Match confidence | Implemented | Match Confidence column. |
| Restock signal | Implemented | Restock Signal column. |
| Slow/no-sale signal | Implemented separately | Appears in Slow / No-sale section. |

Dedicated item detail page:

Missing.

Is current table enough?

Partial. It is good for scanning, but not enough for a confident purchase decision on one exact product. The owner needs "click item to open full detail."

Is product search too limited because item search is after selected result loading?

Yes. Store/date/brand/category/size filters are server-side, but `matchesSearch` filters item/SKU/barcode after rows are returned. This is acceptable with narrow filters and current scale, but not ideal after bulk historical uploads.

Verdict: partial.

## 7. Size-wise Quantity Audit

| Question | Audit result |
| --- | --- |
| Does stock size-wise quantity show correctly when `stock_rows.size` exists? | Yes. Stock size is aggregated into Size-wise Quantity and size-specific signal rows. |
| Does sales size-wise quantity show only when `sales_rows.size` exists? | Yes. It uses explicit size only. |
| Is there warning when sales size is missing? | Yes. Business Reporting displays count of sales rows missing size. |
| Can size-wise restock work for footwear? | Yes, if both stock and sales uploads include explicit size. |
| Does it show size 7/8/9/10 style clearly? | Yes, as raw size values from uploaded rows. |
| Does it show sold qty vs stock qty per size? | Yes, Size-wise Quantity table shows Stock Qty, Sold Qty, Return Qty, Net Sold Qty, Net Sales. |
| Can owner understand which size to reorder? | Partially. Low Stock by Size and Restock Suggestions help, but there is no final suggested reorder quantity. |
| Does it avoid unsafe inference from product name? | Yes. Phase 2 explicitly uses size columns only. |
| What is missing for reliable size reporting? | Sales files must consistently include size; size normalization is missing; size curve recommendation is missing; product-level size detail page is missing. |

Verdict: good foundation, not final purchase automation.

## 8. Staff Sales Workflow Audit

Routes audited:

- `/app/reports/staff`
- `/app/reports/business` staff section
- Today top staff

| Need | Status | Notes |
| --- | --- | --- |
| Staff sales per day | Implemented | Staff page supports Today and Yesterday. |
| Staff sales per month | Implemented | Staff page supports This month. |
| Staff sales by brand/category/product | Partial | Business Reporting staff section works after selected brand/category/item filters. Staff page itself does not filter by brand/category/product. |
| Highest/lowest staff | Partial | Sorted highest first. Lowest visible only by scrolling to bottom; no explicit lowest performer card. |
| Source alias mapping | Implemented | Active `staff_name_aliases` combine source names. |
| Does staff page show all staff, not just top 5/6? | Mostly | It returns all staff found in selected sales rows, not capped in UI code. |
| Supports Today, Yesterday, This week, This month | Yes | Staff page period options include these. |
| Supports custom date range | No | Staff page does not expose custom date range. |
| Shows per brand/category staff performance | Partial | Top Brand and Top Category per staff only. |
| Business Reporting shows staff by selected brand/category/item | Yes | `Staff by Selected Filters` uses current filters. |
| Alias mapping combines RITA + RITA S | Yes if alias rows exist | Depends on active alias data. |
| Shows return amount per staff | Yes | Return Amount column. |
| Shows zero-sale active staff | No | Staff are derived from `sales_rows`; no employee roster join for zero-sale staff. |
| Shows lowest performer clearly | No | No lowest-card or zero-sale section. |
| Manager only sees assigned store staff | Likely yes | `getAccessibleStores` and RLS limit rows to assigned stores. |

Verdict: useful for sales ranking, incomplete for accountability.

Exact missing pieces:

- Custom date range on staff page.
- Zero-sale active staff from employee contacts/store roster.
- Lowest performer card.
- Staff by selected brand/category/product on staff page, not only Business Reporting.
- Staff target and target progress.
- Return quantity per staff, not only return amount.

## 9. Restock Decision Audit

Questions owner can answer now:

| Question | Status | Notes |
| --- | --- | --- |
| What should I reorder urgently? | Partial | Restock Urgent flags sold qty >= 5 and stock qty <= 2. |
| What should I reorder soon? | Partial | Restock Soon flags sold qty >= 3 and stock qty <= 5. |
| What should I avoid buying? | Partial | Do Not Reorder / Push Offer and Slow / No-sale signals help. |
| What should I push with staff/offer? | Partial | Slow Suggested Action says Check display, Put in offer, Avoid reorder, Push staff. |
| Which size is low and moving? | Implemented | Low Stock by Size has Low and Moving. |
| Which item has high sale but low stock? | Implemented | Restock and Low Stock sections surface it. |
| Which brand/category is underperforming? | Partial | Movement and slow counts help, but no underperformance benchmark against target/last period. |

Restock Suggestions:

- Logic: simple thresholds from selected-period sold quantity and latest stock quantity.
- Business usefulness: useful as a first-pass list.
- Risk: does not consider season, supplier lead time, purchase cost, margin, ageing, or upcoming demand.
- False-positive risk: moderate, especially when sales uploads are incomplete or stock is stale monthly data.
- Missing ageing/purchase date issue: yes.
- Purchasing decision verdict: good for shortlist, not final order quantity.

Low Stock by Size:

- Logic: Out of Stock, Very Low, Low and Moving based on stock and sold quantities.
- Business usefulness: high for footwear/apparel when size data exists.
- Risk: sales size missing weakens it.
- False-positive risk: moderate if size values are inconsistent.
- Purchasing decision verdict: useful but needs size normalization and reorder quantity.

Slow / No-sale:

- Logic: current stock exists with low/no selected-period sales.
- Business usefulness: useful to avoid blind buying and identify display/offer candidates.
- Risk: should not be treated as final dead stock.
- False-positive risk: high if selected period is too short, stock just arrived, or sales reports missing.
- Ageing issue: no purchase date/ageing is used.
- Purchasing decision verdict: use as caution signal only.

Important: Do not call dead stock final unless ageing is used. Business Reporting follows this principle. Stock Analytics still uses "Dead stock candidates", which should be softened later.

## 10. Stock Insight Audit

Owner stock needs:

| Need | Status | Notes |
| --- | --- | --- |
| Stock uploaded latest month | Implemented | Business report summary shows latest stock month per store. |
| Total stock by store | Partial | Stock Analytics and store detail show totals; Business Reporting can filter store. |
| Total stock by brand | Implemented | Brand Performance. |
| Total stock by category | Implemented | Category Performance. |
| Total stock by product | Partial | Item table top 50, not complete product detail. |
| Total stock by size | Implemented | Size-wise Quantity. |
| Stock MRP value | Implemented | Summary, brand, category, item. |
| Slow/no-sale | Implemented | Business Reporting and Stock Analytics. |
| Restock urgent | Implemented | Business Reporting. |
| Low stock | Implemented | Low Stock by Size. |
| No stock warning | Partial | Missing stock report warning exists; item-level out-of-stock exists in low stock signals when represented in signal rows. |
| Stock match confidence | Implemented | Item and signal tables show match confidence. |

Can owner search a brand and understand current available stock enough for purchasing?

Verdict: mostly yes for a first-pass decision. The owner can search brand, see current stock qty/MRP, item list, size table, restock, slow/no-sale, staff, and export. It is not yet enough for final purchase orders because product detail, full product list, supplier mapping, and suggested quantity are missing.

## 11. Share / Download / Reporting Action Audit

| Action | Status | Audit |
| --- | --- | --- |
| Copy Summary | Implemented | Useful high-level summary. Includes store, period, brand/category filters, sales, stock, top staff/product, urgent restock, slow/no-sale. |
| WhatsApp Share | Implemented | Opens `wa.me` with readable summary. Good for quick sharing, not a detailed report. |
| Print | Implemented | Browser print. Useful for page snapshot, but not a designed PDF report. |
| CSV Download | Implemented | Multi-section CSV includes brand, category, item/product, size, restock, slow/no-sale. Opens in Excel but is not a multi-sheet workbook. |

Does summary include selected filters?

Mostly. It includes store, period, brand, and category. Item and size filters are not explicitly listed in summary text.

Does it include brand/category/product names?

Brand/category yes in summary. Product appears as top product. CSV includes product names.

Does it include stock and sales?

Yes.

Is WhatsApp message readable?

Yes, concise and readable.

Is CSV useful in Excel?

Yes, but a single multi-section CSV is less polished than separate Excel sheets.

Does CSV include restock/slow/size data?

Yes.

Is PDF missing?

Yes. PDF should be Phase 3.

Should Excel with separate sheets be Phase 3?

Yes. Owner purchasing reports should export to XLSX with separate sheets for Summary, Brands, Categories, Products, Sizes, Restock, Slow, Staff, Data Warnings.

Verdict: good v6.0.0 sharing, not final board/purchasing export.

## 12. Data Quality / Trust Warnings Audit

Warnings checked:

| Risk | Warning exists | Notes |
| --- | --- | --- |
| No latest stock uploaded | Yes | `stockWarning` names stores missing latest stock. |
| Missing sales report days | Yes | Business Reporting shows selected store/date combinations missing. |
| Size missing in sales rows | Yes | Count shown. |
| Weak item matching | Yes | Count of weak/missing match rows shown. |
| Stock is monthly upload, not live inventory | Yes | Explicit warning shown. |
| Brand/category spelling differences | No | No normalization warning for duplicate raw values. |
| Missing barcode/SKU | Partial | Stock Analytics warns when some rows lack SKU/barcode; Business Reporting mainly surfaces weak match confidence. |
| No purchase date/ageing for dead stock | Partial | Business Reporting states slow/no-sale is not final dead stock; Stock Analytics wording still says dead stock candidates. |

Verdict: owner gets several important warnings, but not enough to fully understand raw-file spelling/normalization risk. Trust communication is good for v6.0.0 and should be strengthened before purchase automation.

## 13. Speed / Performance Reality Audit

Pages audited:

- `/app/today`
- `/app/reports/business`
- `/app/reports/staff`
- `/app/reports/sales/analytics`
- `/app/reports/stock/analytics`
- `/app/reports/correction`

Current performance after v6.0.0:

- Auth/session refresh is fixed with Next 16 `proxy.ts`.
- Repeated user/profile fetches are reduced with React request caching.
- Report status queries are batched into `store_id IN (...)` queries.
- Business Reporting has compound indexes for common server-side filters.

Business Reporting likely slow after bulk historical upload?

Moderate risk. Store/date/brand/category/size filters are server-side and indexed, which helps. However, item search is in-memory after fetching rows, and yearly/custom ranges can pull many sales rows. Latest stock month only keeps stock side bounded, but sales side can grow heavily after historical upload.

Indexes added:

- `sales_rows(store_id, sale_date, brand)`
- `sales_rows(store_id, sale_date, category)`
- `sales_rows(store_id, sale_date, barcode)`
- `sales_rows(store_id, sale_date, sku)`
- `sales_rows(store_id, sale_date, staff_name)`
- `stock_rows(store_id, stock_month, brand)`
- `stock_rows(store_id, stock_month, category)`
- `stock_rows(store_id, stock_month, barcode)`
- `stock_rows(store_id, stock_month, sku)`

Server-side filters:

- Store.
- Sales date range.
- Stock month.
- Brand equality.
- Category equality.
- Size equality.

Client/in-memory filters:

- Item/product/SKU/barcode text search in Business Reporting.
- Most ranking/aggregation after rows load.
- Signal generation after rows load.

Repeated queries:

- v6.0.0 reduced repeated auth/profile and report status reads.
- Today still runs many business queries in one page render.
- Store detail still loads many sections, including stock analytics and weekly audit.

Heavy pages:

- `/app/today`: still the heaviest because it loads many unrelated sections at once.
- `/app/reports/business`: can be heavy for broad date ranges and no brand/category filters.
- `/app/reports/stock/analytics`: calls stock summary and several candidate helpers that each can reload stock/sales rows.
- `/app/reports/sales/analytics`: pulls sales rows for period and month target summary.
- `/app/reports/correction`: paginated and likely acceptable, but bulk upload actions are inherently heavy.

What should be lazy-loaded next:

- Today stock pulse, sales pulse, salary receivables, weekly audit, reviews, updates, and lower cards.
- Store detail stock analytics and weekly audit.
- Business Reporting signal sections could be loaded after summary/filter results if needed.

Should Today be simplified next?

Yes. It should become a fast owner decision panel, not a full dashboard of every module.

Speed/performance verdict: improved but not finished.

## 14. Business Autopilot Gap List

| Missing feature | Why owner needs it | Priority | Complexity | Dependency |
| --- | --- | --- | --- | --- |
| Brand detail page | Buying often starts by brand; needs full brand view | High | Medium | Business report filters |
| Product detail page | Owner needs exact product before reordering | High | Medium-high | Product identity/matching |
| Click product to full detail | Table scan is not enough | High | Medium | Item route and query |
| Excel download with separate sheets | Owner can share/use in Excel cleanly | High | Medium | XLSX export |
| PDF report | Print-ready purchase report | Medium | Medium | Report design |
| Better restock quantity recommendation | Owner needs how much to buy, not only signal | High | High | Sales velocity, size curve, lead time |
| Purchase order draft | Converts insight into action | High | High | Supplier/product master |
| Supplier/vendor mapping | Purchasing is supplier-driven | High | Medium-high | Product master |
| Brand/category normalization | Raw spelling splits business truth | High | Medium | Master data UI |
| Product master | Stable identity across files | High | High | Barcode/SKU/item mapping |
| Size curve recommendation | Footwear/apparel purchase is size-driven | High | High | Reliable size data |
| Zero-sale staff | Owner needs accountability | High | Medium | Employee roster/store schedule |
| Staff target | Owner needs performance goals | Medium | Medium | Target settings |
| Target forecast | Owner needs monthly risk early | Medium | Medium | Sales trend summaries |
| AI daily business summary | Owner wants fast decisions | Medium | Medium | Business report context |
| Missing upload alerts | Data completeness needs enforcement | High | Medium | Notifications |
| WhatsApp manager alerts | Owner can chase missing reports/issues | Medium | Medium | WhatsApp integration |
| Daily owner decision panel | Reduce app navigation burden | High | Medium | Today redesign |
| Stock ageing/dead stock confidence | Avoid false dead-stock labels | High | High | Purchase date/stock ledger |

## 15. Keep / Improve / Rebuild Verdict

| Module | Verdict | Reason |
| --- | --- | --- |
| Today | Improve | Useful but heavy and not decision-focused. |
| Business Reporting | Improve | Strong core, needs polish and drilldowns. |
| Staff Sales | Improve | Useful ranking, missing custom range, zero-sale, lowest performer. |
| Stock Analytics | Improve | Useful but overlaps with Business Reporting and dead-stock wording needs caution. |
| Sales Analytics | Keep as is for now | Good sales-only view; not main purchasing workflow. |
| Correction Center | Keep as is | Important owner-only data repair path with audit logs. |
| AI Secretary | Improve | Useful context, but should include better Business Reporting summaries later. |
| Reports page | Rebuild later | Needs owner-decision grouping and clearer labels. |
| Store Detail | Improve | Useful store pulse, but heavy and not purchasing-first. |

## 16. Recommended Next 3 Builds

### 1. Owner Workflow Polish + Bug Fixes for Business Reporting

Exact scope:

- Rename or label Business Reporting as the buying/restock decision page.
- Add Today owner card linking directly to Business Reporting.
- Add selected filters summary that includes item and size.
- Add clearer "data confidence" box.
- Make "dead stock candidates" wording consistent across Stock Analytics.
- Improve empty states for brand/category/item search.
- Add top-selling-only and avoid-buying-only short cards.
- Make item search behavior clearer.

Why needed:

This gives the owner confidence using the existing feature without changing core business logic.

Risk:

Low to medium. Mostly UI/copy/query polish.

Expected business value:

High. The owner can immediately use the app while purchasing.

### 2. Today Performance / Lazy Loading

Exact scope:

- Convert Today into a fast decision panel.
- Lazy-load or move lower-priority sections.
- Keep only urgent upload gaps, sales/stock alerts, restock entry, top issues, and AI entry.
- Avoid heavy stock/sales analytics on first render.

Why needed:

The owner already reported slow app switching. v6.0.0 fixed avoidable auth/status overhead, but Today still does too much.

Risk:

Medium. Needs careful UX decisions so useful cards are not lost.

Expected business value:

High. Faster daily use and less confusion.

### 3. Brand/Product Detail + Excel/PDF Export

Exact scope:

- Add brand detail route.
- Add product/item detail route.
- Add click-through from Business Reporting rows.
- Add item-level size curve, sales, stock, returns, staff, confidence, and restock signal.
- Add XLSX export with separate sheets.
- Add PDF/print-friendly purchasing report.

Why needed:

Purchasing decisions need detail and shareable outputs.

Risk:

Medium-high. Product identity and match confidence must be handled carefully.

Expected business value:

Very high. Converts dashboard into a real buying assistant.

## 17. Verification

Commands required for this audit:

- `npm run lint`
- `npx tsc --noEmit`
- `npm run build`
- `git status`
- `git log --oneline -20`

Results will be recorded in the final response after the commands are run.

## 18. Git

Required commit:

`add owner workflow reality audit`

Required push:

No push for this task.

Expected committed file:

- `docs/OWNER_WORKFLOW_REALITY_AUDIT.md`

## Final Audit Verdict

GPBM Retail v6.0.0 is now a real owner business tool, not just an upload tracker. Business Reporting is the best feature for purchasing/restocking and is useful today for brand/category/product/size questions. The app is still one build away from feeling natural for the owner and two builds away from becoming a confident purchasing system.

The next phase should not add more scattered pages. It should polish the owner path around Business Reporting, simplify Today, and add drilldown/export features that turn insights into purchase decisions.
