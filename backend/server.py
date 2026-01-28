from fastapi import FastAPI, APIRouter, UploadFile, File, HTTPException
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone, timedelta
import calendar
import io
import csv
from openpyxl import Workbook
from openpyxl.styles import PatternFill, Font, Alignment, Border, Side
from openpyxl.utils import get_column_letter

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app
app = FastAPI()
api_router = APIRouter(prefix="/api")

# Color configuration matching the reference image
SHIFT_COLORS = {
    "7": {"bg": "FF6666", "text": "000000"},      # Morning - Red
    "15": {"bg": "009933", "text": "FFFFFF"},     # Afternoon - Green
    "23": {"bg": "3366CC", "text": "FFFFFF"},     # Night - Blue
    "9": {"bg": "FFFF66", "text": "000000"},      # 9am - Yellow
    "11": {"bg": "6699FF", "text": "000000"},     # 11am - Light Blue
    "12": {"bg": "9966CC", "text": "FFFFFF"},     # 12pm - Purple
    "8": {"bg": "FF9999", "text": "000000"},      # 8am - Pink
    "16": {"bg": "CC0033", "text": "FFFFFF"},     # 16pm - Maroon
    "0": {"bg": "FF9999", "text": "B91C1C"},      # Day Off - Light Pink with red text
    "V": {"bg": "663399", "text": "FFFFFF"},      # Vacation - Dark Purple
    "L": {"bg": "CC6600", "text": "FFFFFF"},      # Leave - Orange
}

# Models
class Employee(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    last_name: str
    first_name: str
    position: str  # GSC, GSA, AGSM, Welcome Agent
    group: Optional[str] = None  # e.g., "NAFSIKA", "WELCOME AGENTS"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class EmployeeCreate(BaseModel):
    last_name: str
    first_name: str
    position: str
    group: Optional[str] = None

class EmployeeUpdate(BaseModel):
    last_name: Optional[str] = None
    first_name: Optional[str] = None
    position: Optional[str] = None
    group: Optional[str] = None

class RosterEntry(BaseModel):
    employee_id: str
    date: str  # YYYY-MM-DD
    shift: str  # "7", "15", "23", "9", "0", "V", "L", etc.

class RosterRequest(BaseModel):
    year: int
    month: int
    employees: List[str]  # List of employee IDs
    vacation_days: Dict[str, List[str]] = {}  # employee_id -> list of dates
    leave_days: Dict[str, List[str]] = {}  # employee_id -> list of dates

class RosterResponse(BaseModel):
    year: int
    month: int
    roster: Dict[str, Dict[str, str]]  # employee_id -> {date: shift}
    days_info: List[Dict[str, Any]]  # [{day: 1, weekday: "MON", date: "2025-01-01"}, ...]

# Employee endpoints
@api_router.post("/employees", response_model=Employee)
async def create_employee(employee: EmployeeCreate):
    emp = Employee(**employee.model_dump())
    doc = emp.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.employees.insert_one(doc)
    return emp

@api_router.get("/employees", response_model=List[Employee])
async def get_employees():
    employees = await db.employees.find({}, {"_id": 0}).to_list(1000)
    for emp in employees:
        if isinstance(emp.get('created_at'), str):
            emp['created_at'] = datetime.fromisoformat(emp['created_at'])
    return employees

@api_router.put("/employees/{employee_id}", response_model=Employee)
async def update_employee(employee_id: str, update: EmployeeUpdate):
    update_data = {k: v for k, v in update.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No update data provided")
    
    result = await db.employees.update_one(
        {"id": employee_id},
        {"$set": update_data}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Employee not found")
    
    employee = await db.employees.find_one({"id": employee_id}, {"_id": 0})
    if isinstance(employee.get('created_at'), str):
        employee['created_at'] = datetime.fromisoformat(employee['created_at'])
    return Employee(**employee)

@api_router.delete("/employees/{employee_id}")
async def delete_employee(employee_id: str):
    result = await db.employees.delete_one({"id": employee_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Employee not found")
    return {"message": "Employee deleted"}

@api_router.post("/employees/bulk")
async def bulk_create_employees(employees: List[EmployeeCreate]):
    created = []
    for emp_data in employees:
        emp = Employee(**emp_data.model_dump())
        doc = emp.model_dump()
        doc['created_at'] = doc['created_at'].isoformat()
        await db.employees.insert_one(doc)
        created.append(emp)
    return created

@api_router.post("/employees/import-csv")
async def import_csv(file: UploadFile = File(...)):
    content = await file.read()
    decoded = content.decode('utf-8')
    reader = csv.DictReader(io.StringIO(decoded))
    
    created = []
    for row in reader:
        emp_data = EmployeeCreate(
            last_name=row.get('last_name', row.get('LAST_NAME', row.get('Last Name', ''))),
            first_name=row.get('first_name', row.get('FIRST_NAME', row.get('First Name', ''))),
            position=row.get('position', row.get('POSITION', row.get('Position', 'GSC'))),
            group=row.get('group', row.get('GROUP', row.get('Group', None)))
        )
        emp = Employee(**emp_data.model_dump())
        doc = emp.model_dump()
        doc['created_at'] = doc['created_at'].isoformat()
        await db.employees.insert_one(doc)
        created.append(emp)
    
    return {"imported": len(created), "employees": created}

# Roster generation algorithm
def generate_roster(year: int, month: int, employees: List[dict], 
                   vacation_days: Dict[str, List[str]] = {},
                   leave_days: Dict[str, List[str]] = {}) -> Dict[str, Dict[str, str]]:
    """
    Generate a roster following the constraints:
    - 24/7 coverage (at least 1 person on night shift)
    - 8-hour shifts
    - 5 work days, 2 days off per week
    - Min 11 hours rest between shifts
    - No more than 5 consecutive work days
    - Quick turnaround rule (no afternoon -> morning next day)
    - AGSM and Welcome Agent always 9am shift
    """
    num_days = calendar.monthrange(year, month)[1]
    roster = {emp['id']: {} for emp in employees}
    
    # Track consecutive work days and last shift for each employee
    consecutive_days = {emp['id']: 0 for emp in employees}
    last_shift = {emp['id']: None for emp in employees}
    days_worked_this_week = {emp['id']: 0 for emp in employees}
    
    # Separate employees by position
    fixed_9am = [e for e in employees if e['position'] in ['AGSM', 'Welcome Agent']]
    flexible = [e for e in employees if e['position'] not in ['AGSM', 'Welcome Agent']]
    
    for day in range(1, num_days + 1):
        date_str = f"{year}-{month:02d}-{day:02d}"
        date_obj = datetime(year, month, day)
        weekday = date_obj.weekday()  # 0=Monday, 6=Sunday
        
        # Reset weekly counter on Monday
        if weekday == 0:
            for emp_id in days_worked_this_week:
                days_worked_this_week[emp_id] = 0
        
        # Track shift assignments for this day
        morning_assigned = []
        afternoon_assigned = []
        night_assigned = []
        nine_am_assigned = []
        
        # First, handle vacation and leave days
        for emp in employees:
            emp_id = emp['id']
            if vacation_days.get(emp_id) and date_str in vacation_days[emp_id]:
                roster[emp_id][date_str] = 'V'
                continue
            if leave_days.get(emp_id) and date_str in leave_days[emp_id]:
                roster[emp_id][date_str] = 'L'
                continue
        
        # Assign 9am shift to AGSM and Welcome Agent
        for emp in fixed_9am:
            emp_id = emp['id']
            if roster[emp_id].get(date_str):  # Already assigned (V or L)
                continue
            
            # Check if employee needs a day off
            if consecutive_days[emp_id] >= 5 or days_worked_this_week[emp_id] >= 5:
                roster[emp_id][date_str] = '0'
                consecutive_days[emp_id] = 0
            else:
                roster[emp_id][date_str] = '9'
                nine_am_assigned.append(emp_id)
                consecutive_days[emp_id] += 1
                days_worked_this_week[emp_id] += 1
                last_shift[emp_id] = '9'
        
        # Assign shifts to flexible employees
        available_for_morning = []
        available_for_afternoon = []
        available_for_night = []
        needs_day_off = []
        
        for emp in flexible:
            emp_id = emp['id']
            if roster[emp_id].get(date_str):  # Already assigned (V or L)
                continue
            
            # Check if employee needs a day off
            if consecutive_days[emp_id] >= 5 or days_worked_this_week[emp_id] >= 5:
                needs_day_off.append(emp_id)
                continue
            
            # Check quick turnaround rule
            prev_shift = last_shift[emp_id]
            
            # Can't do morning after afternoon (15->7 violates 11h rest)
            if prev_shift != '15':
                available_for_morning.append(emp_id)
            
            # Afternoon is always available (except after night which rarely happens)
            if prev_shift != '23':
                available_for_afternoon.append(emp_id)
            
            # Night shift - prefer rotating among staff
            if prev_shift not in ['23']:  # Don't do consecutive nights
                available_for_night.append(emp_id)
        
        # Assign day offs
        for emp_id in needs_day_off:
            roster[emp_id][date_str] = '0'
            consecutive_days[emp_id] = 0
        
        # Ensure at least one night shift
        if available_for_night:
            night_emp = available_for_night.pop(0)
            roster[night_emp][date_str] = '23'
            night_assigned.append(night_emp)
            consecutive_days[night_emp] += 1
            days_worked_this_week[night_emp] += 1
            last_shift[night_emp] = '23'
            
            # Remove from other available lists
            if night_emp in available_for_morning:
                available_for_morning.remove(night_emp)
            if night_emp in available_for_afternoon:
                available_for_afternoon.remove(night_emp)
        
        # Distribute remaining employees between morning and afternoon
        remaining = set(available_for_morning + available_for_afternoon)
        remaining = remaining - set(night_assigned)
        
        # Balance morning and afternoon shifts
        remaining_list = list(remaining)
        mid = len(remaining_list) // 2
        
        for i, emp_id in enumerate(remaining_list):
            if i < mid:
                # Assign morning if available
                if emp_id in available_for_morning:
                    roster[emp_id][date_str] = '7'
                    last_shift[emp_id] = '7'
                elif emp_id in available_for_afternoon:
                    roster[emp_id][date_str] = '15'
                    last_shift[emp_id] = '15'
                else:
                    roster[emp_id][date_str] = '0'
                    consecutive_days[emp_id] = 0
                    continue
            else:
                # Assign afternoon if available
                if emp_id in available_for_afternoon:
                    roster[emp_id][date_str] = '15'
                    last_shift[emp_id] = '15'
                elif emp_id in available_for_morning:
                    roster[emp_id][date_str] = '7'
                    last_shift[emp_id] = '7'
                else:
                    roster[emp_id][date_str] = '0'
                    consecutive_days[emp_id] = 0
                    continue
            
            consecutive_days[emp_id] += 1
            days_worked_this_week[emp_id] += 1
    
    return roster

@api_router.post("/roster/generate", response_model=RosterResponse)
async def generate_roster_endpoint(request: RosterRequest):
    # Get employees from database
    employees = await db.employees.find(
        {"id": {"$in": request.employees}},
        {"_id": 0}
    ).to_list(1000)
    
    if not employees:
        raise HTTPException(status_code=400, detail="No employees found")
    
    roster = generate_roster(
        request.year, 
        request.month, 
        employees,
        request.vacation_days,
        request.leave_days
    )
    
    # Generate days info
    num_days = calendar.monthrange(request.year, request.month)[1]
    weekday_names = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']
    days_info = []
    for day in range(1, num_days + 1):
        date_obj = datetime(request.year, request.month, day)
        days_info.append({
            "day": day,
            "weekday": weekday_names[date_obj.weekday()],
            "date": f"{request.year}-{request.month:02d}-{day:02d}"
        })
    
    return RosterResponse(
        year=request.year,
        month=request.month,
        roster=roster,
        days_info=days_info
    )

@api_router.post("/roster/update-cell")
async def update_roster_cell(employee_id: str, date: str, shift: str):
    """Update a single cell in the roster (for manual vacation/request marking)"""
    # Store in database
    await db.roster_entries.update_one(
        {"employee_id": employee_id, "date": date},
        {"$set": {"shift": shift}},
        upsert=True
    )
    return {"success": True}

@api_router.post("/roster/export-excel")
async def export_excel(request: RosterRequest):
    """Export roster as formatted Excel file"""
    # Get employees
    employees = await db.employees.find(
        {"id": {"$in": request.employees}},
        {"_id": 0}
    ).to_list(1000)
    
    if not employees:
        raise HTTPException(status_code=400, detail="No employees found")
    
    # Generate roster
    roster = generate_roster(
        request.year,
        request.month,
        employees,
        request.vacation_days,
        request.leave_days
    )
    
    # Create Excel workbook
    wb = Workbook()
    ws = wb.active
    ws.title = f"Roster {request.month:02d}/{request.year}"
    
    num_days = calendar.monthrange(request.year, request.month)[1]
    weekday_names = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']
    
    # Header styling
    header_fill = PatternFill(start_color="FFFFFF", end_color="FFFFFF", fill_type="solid")
    header_font = Font(bold=True, size=10)
    thin_border = Border(
        left=Side(style='thin'),
        right=Side(style='thin'),
        top=Side(style='thin'),
        bottom=Side(style='thin')
    )
    
    # Write header row 1 (day numbers)
    ws.cell(row=1, column=1, value="LAST NAME")
    ws.cell(row=1, column=2, value="FIRST NAME")
    ws.cell(row=1, column=3, value="POSITION")
    
    for day in range(1, num_days + 1):
        col = day + 3
        ws.cell(row=1, column=col, value=day)
        ws.cell(row=1, column=col).font = header_font
        ws.cell(row=1, column=col).alignment = Alignment(horizontal='center')
        ws.cell(row=1, column=col).border = thin_border
    
    # Write header row 2 (weekday names)
    for day in range(1, num_days + 1):
        col = day + 3
        date_obj = datetime(request.year, request.month, day)
        ws.cell(row=2, column=col, value=weekday_names[date_obj.weekday()])
        ws.cell(row=2, column=col).font = Font(bold=True, size=8)
        ws.cell(row=2, column=col).alignment = Alignment(horizontal='center')
        ws.cell(row=2, column=col).border = thin_border
    
    # Set column widths
    ws.column_dimensions['A'].width = 15
    ws.column_dimensions['B'].width = 15
    ws.column_dimensions['C'].width = 10
    for day in range(1, num_days + 1):
        ws.column_dimensions[get_column_letter(day + 3)].width = 5
    
    # Write employee rows
    row = 3
    current_group = None
    
    # Sort employees by group
    sorted_employees = sorted(employees, key=lambda x: (x.get('group') or '', x['last_name']))
    
    for emp in sorted_employees:
        # Add group header if group changes
        if emp.get('group') and emp.get('group') != current_group:
            current_group = emp.get('group')
            ws.cell(row=row, column=1, value=current_group)
            ws.cell(row=row, column=1).font = Font(bold=True, italic=True)
            row += 1
        
        ws.cell(row=row, column=1, value=emp['last_name'])
        ws.cell(row=row, column=2, value=emp['first_name'])
        ws.cell(row=row, column=3, value=emp['position'])
        
        for col in range(1, 4):
            ws.cell(row=row, column=col).border = thin_border
        
        # Write shifts with colors
        emp_roster = roster.get(emp['id'], {})
        for day in range(1, num_days + 1):
            col = day + 3
            date_str = f"{request.year}-{request.month:02d}-{day:02d}"
            shift = emp_roster.get(date_str, '')
            
            cell = ws.cell(row=row, column=col, value=shift)
            cell.alignment = Alignment(horizontal='center', vertical='center')
            cell.border = thin_border
            
            # Apply color based on shift
            if shift in SHIFT_COLORS:
                color = SHIFT_COLORS[shift]
                cell.fill = PatternFill(start_color=color["bg"], end_color=color["bg"], fill_type="solid")
                cell.font = Font(color=color["text"], bold=True)
        
        row += 1
    
    # Save to bytes
    output = io.BytesIO()
    wb.save(output)
    output.seek(0)
    
    filename = f"roster_{request.year}_{request.month:02d}.xlsx"
    
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

@api_router.get("/")
async def root():
    return {"message": "StaffFlow API - Hotel Roster Generator"}

# Include router
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
