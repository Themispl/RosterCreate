# StaffFlow - Hotel Staff Roster Generator PRD

## Original Problem Statement
Create a program that generates a monthly and weekly staff roster for a hotel, exported as an Excel file.

## User Personas
- **Hotel Managers**: Need to create and maintain staff schedules efficiently
- **HR Staff**: Require compliant schedules with proper rest periods and fair distribution

## Core Requirements (Static)
1. Staff input via CSV upload or manual text entry
2. Month/Year selection for roster generation
3. Position types: GSC, GSA, AGSM, Welcome Agent
4. 24/7 coverage with shift types: Morning (7:00), Afternoon (15:00), Night (23:00)
5. AGSM and Welcome Agent fixed at 9am shift
6. Vacation (V), Leave (L), Day Off (0) marking
7. Color-coded display matching reference image
8. Excel export with formatting and colors

## NEW Scheduling Constraints (Updated December 2025)
- **5 work days + 2 days off per week** (mandatory)
- **Minimum 11 hours between shifts** - No AM→PM next day without off day
- Use days off to transition between shift types
- Night shift: 5 consecutive days, then 2 days off, then PM shift
- Days off MUST be consecutive (together)
- Alternate weeks: Morning one week, Afternoon next week
- Max 5 night shifts per person per month
- Balance days off across staff (not everyone off same day)

## Color Coding (User Customizable)
| Shift | Default Color | Hex |
|-------|---------------|-----|
| 7 (Morning) | Red | #FF6666 |
| 15 (Afternoon) | Green | #009933 |
| 23 (Night) | Blue | #3366CC |
| 9 | Yellow | #FFFF66 |
| 0 (Day Off) | Light Pink | #FF9999 |
| V (Vacation) | Dark Purple | #663399 |
| L (Leave) | Orange | #CC6600 |

## What's Been Implemented (December 2025)

### Backend (FastAPI)
- ✅ Employee CRUD endpoints with position-based sorting
- ✅ CSV import endpoint for bulk employee upload
- ✅ NEW roster generation algorithm with all constraints
- ✅ Excel export with customizable colors
- ✅ Color configuration save/load endpoints
- ✅ Week view support

### Frontend (React)
- ✅ Dark sidebar with staff management
- ✅ **Position ordering: AGSM → GSC → GSA → Welcome Agent**
- ✅ **Week/Month view toggle with week navigation**
- ✅ **Color legend with click-to-edit functionality**
- ✅ **Wider name column (280px) for full names**
- ✅ CSV upload zone with drag & drop
- ✅ Manual employee entry dialog
- ✅ Roster grid with exact color coding
- ✅ Cell click edit dialog
- ✅ Generate Roster button
- ✅ Export Excel button
- ✅ Toast notifications (Sonner)

## Architecture
```
Frontend (React + Tailwind) → API (FastAPI) → MongoDB
                           ↓
                    Excel Export (openpyxl)
```

## Prioritized Backlog

### P0 (Critical) - COMPLETED
- [x] Staff management (CRUD)
- [x] Roster generation with new algorithm
- [x] Excel export with custom colors
- [x] Week/Month views
- [x] Color customization

### P1 (High Priority) - Future
- [ ] Save/load roster presets
- [ ] Bulk vacation entry
- [ ] Print-friendly CSS

### P2 (Medium Priority) - Future
- [ ] Employee availability preferences
- [ ] Overtime tracking
- [ ] Copy previous month feature

## Next Action Items
1. Implement save/load roster templates
2. Add bulk vacation entry for multiple employees
3. Add "Copy Previous Month" feature
