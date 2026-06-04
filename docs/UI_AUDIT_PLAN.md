# UI Audit Plan

This document is a checklist for a future UI audit of the GPBM Retail platform.
**This is not a redesign.** It documents what to look at when we do audit the UI.

## General checklist

- [ ] Mobile-first layout — all pages usable on phone screens (375px+)
- [ ] Black/white premium theme — consistent use of foreground/background/border tokens
- [ ] No blue or gradient usage — verify all colors follow the design system
- [ ] Dashboard spacing — consistent gap/padding across all sections
- [ ] Empty states — all pages have clear empty state messages
- [ ] Error/success messages — consistent feedback style across all actions
- [ ] Button hierarchy — primary (filled) vs secondary (border) usage is correct
- [ ] Forms readability — labels, inputs, and validation are clear and accessible
- [ ] Loading states — all async actions show proper loading indicators

## Page-level checklist

### Owner Today page
- [ ] Section order makes sense for daily workflow
- [ ] Cards are not too crowded
- [ ] All data is loading fast enough
- [ ] Receivables card shows correctly when data exists
- [ ] Receivables card hides for managers

### Payslip module
- [ ] Upload flow is intuitive
- [ ] Batch detail page is scannable
- [ ] Row cards show important info first
- [ ] Receivable badge is visible but not distracting
- [ ] Batch receivable warning is noticeable
- [ ] Receivables dashboard is usable on mobile
- [ ] Month selector works well with many months
- [ ] Filter chips are easy to tap on mobile
- [ ] Summary cards don't overflow on small screens
- [ ] Status action buttons fit on small screens
- [ ] Partial payment input is accessible

### Staff Phone Directory
- [ ] Search works quickly
- [ ] Missing phone indicators are clear
- [ ] Phone edit is easy on mobile
- [ ] Manager vs owner view is correct

### Manager workflow
- [ ] Tasks page is easy to scan
- [ ] Update submission is smooth
- [ ] Checklist is quick to fill
- [ ] Review forms work on mobile

### Reports pages
- [ ] Sales analytics loads quickly
- [ ] Stock analytics is readable
- [ ] Upload forms work on mobile
- [ ] Error handling is clear

### Settings/stores
- [ ] Store settings are clear
- [ ] Target setting inputs work correctly

## Old/basic-looking pages

When auditing, identify pages that feel:
- [ ] Too plain or basic compared to modern expectations
- [ ] Missing micro-animations or transitions
- [ ] Using default browser styling
- [ ] Missing proper typography
- [ ] Having inconsistent card styling
- [ ] Lacking proper visual hierarchy

## Notes

- Do not do UI redesign until this audit is completed
- Prioritize functional issues over aesthetic ones
- Mobile usability is the highest priority
- Maintain all existing features during any future redesign
