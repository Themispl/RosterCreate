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

## Scheduling Constraints
- 8-hour shifts
- 5 work days, 2 days off per week
- Minimum 11 hours rest between shifts
- No more than 5 consecutive work days
- Quick turnaround rule (no Afternoon → Morning next day)

## Color Coding
| Shift | Color | Hex |
|-------|-------|-----|
| 7 (Morning) | Red | #FF6666 |
| 15 (Afternoon) | Green | #009933 |
| 23 (Night) | Blue | #3366CC |
| 9 | Yellow | #FFFF66 |
| 11 | Light Blue | #6699FF |
| 12 | Purple | #9966CC |
| 8 | Pink | #FF9999 |
| 16 | Maroon | #CC0033 |
| 0 (Day Off) | Light Pink | #FF9999 |
| V (Vacation) | Dark Purple | #663399 |
| L (Leave) | Orange | #CC6600 |

## What's Been Implemented (December 2025)

### Backend (FastAPI)
- ✅ Employee CRUD endpoints (create, read, update, delete)
- ✅ CSV import endpoint for bulk employee upload
- ✅ Roster generation algorithm with all constraints
- ✅ Excel export with color formatting
- ✅ MongoDB integration for data persistence

### Frontend (React)
- ✅ Dark sidebar with staff management
- ✅ CSV upload zone with drag & drop
- ✅ Manual employee entry dialog
- ✅ Month/Year picker
- ✅ Roster grid with exact color coding from reference
- ✅ Cell click edit dialog for vacation/leave marking
- ✅ Generate Roster button
- ✅ Export Excel button
- ✅ Color legend display
- ✅ Toast notifications (Sonner)
- ✅ Responsive design

## Architecture
```
Frontend (React + Tailwind) → API (FastAPI) → MongoDB
                           ↓
                    Excel Export (openpyxl)
```

## Prioritized Backlog

### P0 (Critical) - COMPLETED
- [x] Staff management (CRUD)
- [x] Roster generation
- [x] Excel export
- [x] Color coding

### P1 (High Priority) - Future
- [ ] Weekly view toggle
- [ ] Save/load roster presets
- [ ] Bulk vacation entry

### P2 (Medium Priority) - Future
- [ ] Print-friendly CSS
- [ ] Employee availability preferences
- [ ] Overtime tracking

### P3 (Low Priority) - Future
- [ ] Email roster to employees
- [ ] Mobile app version
- [ ] Analytics dashboard

## Next Action Items
1. Add weekly view toggle for week-by-week roster display
2. Implement save/load roster templates
3. Add bulk vacation entry for multiple employees
4. Consider analytics dashboard for shift distribution insights
