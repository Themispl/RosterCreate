import requests
import sys
import json
from datetime import datetime, timedelta
import calendar
from collections import defaultdict, Counter

class HotelRosterAPITester:
    def __init__(self, base_url="https://rota-maker.preview.emergentagent.com"):
        self.base_url = base_url
        self.api_url = f"{base_url}/api"
        self.tests_run = 0
        self.tests_passed = 0
        self.created_employee_ids = []
        self.test_results = []

    def log_test(self, name, passed, details=""):
        """Log test result"""
        self.tests_run += 1
        if passed:
            self.tests_passed += 1
            print(f"✅ {name}")
        else:
            print(f"❌ {name} - {details}")
        
        self.test_results.append({
            "name": name,
            "passed": passed,
            "details": details
        })

    def run_test(self, name, method, endpoint, expected_status, data=None, headers=None):
        """Run a single API test"""
        url = f"{self.api_url}/{endpoint}"
        if headers is None:
            headers = {'Content-Type': 'application/json'}

        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        print(f"   URL: {url}")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers)
            elif method == 'DELETE':
                response = requests.delete(url, headers=headers)

            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                try:
                    return success, response.json() if response.content else {}
                except:
                    return success, {}
            else:
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                print(f"   Response: {response.text[:200]}...")
                return False, {}

        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            return False, {}

    def test_root_endpoint(self):
        """Test root API endpoint"""
        return self.run_test("Root API", "GET", "", 200)

    def test_create_employee(self, last_name, first_name, position, group=None):
        """Test creating an employee"""
        data = {
            "last_name": last_name,
            "first_name": first_name,
            "position": position
        }
        if group:
            data["group"] = group
            
        success, response = self.run_test(
            f"Create Employee ({first_name} {last_name})",
            "POST",
            "employees",
            200,
            data=data
        )
        
        if success and 'id' in response:
            self.created_employee_ids.append(response['id'])
            return response['id']
        return None

    def test_get_employees(self):
        """Test getting all employees"""
        success, response = self.run_test(
            "Get All Employees",
            "GET",
            "employees",
            200
        )
        return response if success else []

    def test_delete_employee(self, employee_id):
        """Test deleting an employee"""
        success, _ = self.run_test(
            f"Delete Employee ({employee_id})",
            "DELETE",
            f"employees/{employee_id}",
            200
        )
        if success and employee_id in self.created_employee_ids:
            self.created_employee_ids.remove(employee_id)
        return success

    def test_generate_roster(self, year, month, employee_ids, view_type="month", week_number=None):
        """Test roster generation"""
        data = {
            "year": year,
            "month": month,
            "employees": employee_ids,
            "vacation_days": {},
            "leave_days": {},
            "view_type": view_type
        }
        
        if view_type == "week" and week_number:
            data["week_number"] = week_number
        
        success, response = self.run_test(
            f"Generate Roster ({month}/{year}) - {view_type.title()} View" + (f" Week {week_number}" if week_number else ""),
            "POST",
            "roster/generate",
            200,
            data=data
        )
        return response if success else {}

    def test_export_excel(self, year, month, employee_ids):
        """Test Excel export"""
        data = {
            "year": year,
            "month": month,
            "employees": employee_ids,
            "vacation_days": {},
            "leave_days": {}
        }
        
        url = f"{self.api_url}/roster/export-excel"
        headers = {'Content-Type': 'application/json'}
        
        self.tests_run += 1
        print(f"\n🔍 Testing Excel Export ({month}/{year})...")
        print(f"   URL: {url}")
        
        try:
            response = requests.post(url, json=data, headers=headers)
            
            success = response.status_code == 200
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                print(f"   Content-Type: {response.headers.get('content-type', 'N/A')}")
                print(f"   Content-Length: {len(response.content)} bytes")
                return True
            else:
                print(f"❌ Failed - Expected 200, got {response.status_code}")
                print(f"   Response: {response.text[:200]}...")
                return False
                
        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            return False

    def test_position_order(self, employees):
        """Test that employees are returned in correct position order: AGSM → GSC → GSA → Welcome Agent"""
        print(f"\n🔍 Testing Position Order...")
        
        # Expected order
        expected_order = ["AGSM", "GSC", "GSA", "Welcome Agent"]
        
        # Group employees by position
        positions_found = []
        for emp in employees:
            if emp['position'] not in positions_found:
                positions_found.append(emp['position'])
        
        # Check if positions appear in correct order
        correct_order = True
        last_position_index = -1
        
        for position in positions_found:
            if position in expected_order:
                current_index = expected_order.index(position)
                if current_index < last_position_index:
                    correct_order = False
                    break
                last_position_index = current_index
        
        self.tests_run += 1
        if correct_order:
            self.tests_passed += 1
            print(f"✅ Passed - Position order correct: {' → '.join(positions_found)}")
        else:
            print(f"❌ Failed - Position order incorrect: {' → '.join(positions_found)}")
            print(f"   Expected order: {' → '.join(expected_order)}")
        
        return correct_order

    def test_week_view_generation(self, year, month, employee_ids):
        """Test week view roster generation"""
        print(f"\n🔍 Testing Week View Generation...")
        
        # Test week 1
        week1_data = self.test_generate_roster(year, month, employee_ids, "week", 1)
        if not week1_data:
            return False
            
        # Check that week view returns only 7 days or less
        days_count = len(week1_data.get('days_info', []))
        week_view_correct = days_count <= 7
        
        self.tests_run += 1
        if week_view_correct:
            self.tests_passed += 1
            print(f"✅ Passed - Week view returns {days_count} days (≤7)")
        else:
            print(f"❌ Failed - Week view returns {days_count} days (should be ≤7)")
        
        return week_view_correct

    def test_night_shift_constraints(self, roster_data):
        """Test that night shifts (23) appear in consecutive blocks"""
        print(f"\n🔍 Testing Night Shift Constraints...")
        
        roster = roster_data.get('roster', {})
        if not roster:
            print("❌ No roster data to test")
            return False
        
        night_shift_violations = 0
        total_employees_checked = 0
        
        for emp_id, schedule in roster.items():
            total_employees_checked += 1
            dates = sorted(schedule.keys())
            night_shifts = []
            
            # Find all night shift dates for this employee
            for date in dates:
                if schedule[date] == '23':
                    night_shifts.append(date)
            
            if len(night_shifts) > 1:
                # Check if night shifts are consecutive
                for i in range(len(night_shifts) - 1):
                    current_date = datetime.strptime(night_shifts[i], '%Y-%m-%d')
                    next_date = datetime.strptime(night_shifts[i + 1], '%Y-%m-%d')
                    
                    # If there's a gap of more than 1 day, it's not consecutive
                    if (next_date - current_date).days > 1:
                        # Check if there are any non-night shifts in between
                        gap_start = current_date
                        gap_end = next_date
                        has_non_night_in_gap = False
                        
                        current_check = gap_start
                        while current_check < gap_end:
                            current_check += timedelta(days=1)
                            check_date_str = current_check.strftime('%Y-%m-%d')
                            if check_date_str in schedule and schedule[check_date_str] not in ['23', '0']:
                                has_non_night_in_gap = True
                                break
                        
                        if has_non_night_in_gap:
                            night_shift_violations += 1
                            break
        
        self.tests_run += 1
        if night_shift_violations == 0:
            self.tests_passed += 1
            print(f"✅ Passed - Night shifts appear in proper consecutive blocks")
        else:
            print(f"❌ Failed - {night_shift_violations} employees have non-consecutive night shifts")
        
        return night_shift_violations == 0

    def test_days_off_consecutive(self, roster_data):
        """Test that days off (0) appear in consecutive pairs"""
        print(f"\n🔍 Testing Days Off Consecutive Constraint...")
        
        roster = roster_data.get('roster', {})
        if not roster:
            print("❌ No roster data to test")
            return False
        
        violations = 0
        total_employees_checked = 0
        
        for emp_id, schedule in roster.items():
            total_employees_checked += 1
            dates = sorted(schedule.keys())
            off_days = []
            
            # Find all off days for this employee
            for date in dates:
                if schedule[date] == '0':
                    off_days.append(date)
            
            if len(off_days) > 0:
                # Check if off days are in consecutive pairs
                isolated_off_days = 0
                
                for i, off_date in enumerate(off_days):
                    current_date = datetime.strptime(off_date, '%Y-%m-%d')
                    
                    # Check if this off day has an adjacent off day
                    has_adjacent = False
                    
                    # Check previous day
                    prev_date = (current_date - timedelta(days=1)).strftime('%Y-%m-%d')
                    if prev_date in schedule and schedule[prev_date] == '0':
                        has_adjacent = True
                    
                    # Check next day
                    next_date = (current_date + timedelta(days=1)).strftime('%Y-%m-%d')
                    if next_date in schedule and schedule[next_date] == '0':
                        has_adjacent = True
                    
                    if not has_adjacent:
                        isolated_off_days += 1
                
                if isolated_off_days > 0:
                    violations += 1
        
        self.tests_run += 1
        if violations == 0:
            self.tests_passed += 1
            print(f"✅ Passed - Days off appear in consecutive pairs")
        else:
            print(f"❌ Failed - {violations} employees have isolated off days")
        
        return violations == 0

    def test_exactly_two_consecutive_off_days_per_week(self, roster_data):
        """Test Rule: Each employee has exactly 2 consecutive days off per week"""
        print(f"\n🔍 Testing Exactly 2 Consecutive Off Days Per Week...")
        
        roster = roster_data.get('roster', {})
        year = roster_data.get('year')
        month = roster_data.get('month')
        num_days = calendar.monthrange(year, month)[1]
        
        violations = []
        
        for emp_id, schedule in roster.items():
            # Group days by week
            weeks = defaultdict(list)
            for day in range(1, num_days + 1):
                date_str = f"{year}-{month:02d}-{day:02d}"
                date_obj = datetime(year, month, day)
                week_num = (day - 1) // 7
                shift = schedule.get(date_str, '')
                weeks[week_num].append((day, shift))
            
            # Check each week
            for week_num, week_days in weeks.items():
                if len(week_days) < 7:  # Skip partial weeks
                    continue
                    
                off_days = [day for day, shift in week_days if shift == '0']
                
                # Should have exactly 2 off days
                if len(off_days) != 2:
                    violations.append(f"Employee {emp_id} Week {week_num}: {len(off_days)} off days (expected 2)")
                    continue
                
                # Check if off days are consecutive
                if abs(off_days[1] - off_days[0]) != 1:
                    violations.append(f"Employee {emp_id} Week {week_num}: Off days {off_days} not consecutive")
        
        self.tests_run += 1
        if not violations:
            self.tests_passed += 1
            print(f"✅ Passed - All employees have exactly 2 consecutive off days per week")
        else:
            print(f"❌ Failed - {len(violations)} violations found:")
            for violation in violations[:3]:  # Show first 3 violations
                print(f"   • {violation}")
        
        return len(violations) == 0

    def test_balanced_off_days(self, roster_data):
        """Test Rule: Days off are balanced - not everyone off same day"""
        print(f"\n🔍 Testing Balanced Off Days...")
        
        roster = roster_data.get('roster', {})
        year = roster_data.get('year')
        month = roster_data.get('month')
        num_days = calendar.monthrange(year, month)[1]
        
        # Count off days per date
        off_count_per_day = defaultdict(int)
        total_employees = len(roster)
        
        for day in range(1, num_days + 1):
            date_str = f"{year}-{month:02d}-{day:02d}"
            for emp_id, schedule in roster.items():
                if schedule.get(date_str) == '0':
                    off_count_per_day[date_str] += 1
        
        # Check if any day has too many people off (more than 50% of staff)
        max_allowed_off = max(1, total_employees // 2)
        violations = []
        
        for date_str, count in off_count_per_day.items():
            if count > max_allowed_off:
                violations.append(f"Date {date_str}: {count} employees off (max allowed: {max_allowed_off})")
        
        self.tests_run += 1
        if not violations:
            self.tests_passed += 1
            print(f"✅ Passed - Off days are balanced across staff")
        else:
            print(f"❌ Failed - {len(violations)} days with too many staff off:")
            for violation in violations[:3]:
                print(f"   • {violation}")
        
        return len(violations) == 0

    def test_agsm_welcome_agent_only_9am(self, roster_data, employees):
        """Test Rule: AGSM and Welcome Agent only have 9am shifts"""
        print(f"\n🔍 Testing AGSM/Welcome Agent Only 9am Shifts...")
        
        roster = roster_data.get('roster', {})
        year = roster_data.get('year')
        month = roster_data.get('month')
        num_days = calendar.monthrange(year, month)[1]
        
        # Create position map
        position_map = {emp['id']: emp['position'] for emp in employees}
        
        violations = []
        
        for emp_id, schedule in roster.items():
            if emp_id not in position_map:
                continue
                
            position = position_map[emp_id]
            
            if position in ['AGSM', 'Welcome Agent']:
                for day in range(1, num_days + 1):
                    date_str = f"{year}-{month:02d}-{day:02d}"
                    shift = schedule.get(date_str, '')
                    
                    # Should only have '9' (9am) or '0' (off) shifts
                    if shift not in ['9', '0', 'V', 'L']:
                        violations.append(f"{position} employee {emp_id}: shift '{shift}' on {date_str}")
        
        self.tests_run += 1
        if not violations:
            self.tests_passed += 1
            print(f"✅ Passed - AGSM/Welcome Agent employees only have 9am shifts")
        else:
            print(f"❌ Failed - {len(violations)} violations found:")
            for violation in violations[:3]:
                print(f"   • {violation}")
        
        return len(violations) == 0

    def test_night_shifts_five_day_blocks(self, roster_data, employees):
        """Test Rule: Night shifts (23) appear in 5-day consecutive blocks"""
        print(f"\n🔍 Testing Night Shifts in 5-Day Consecutive Blocks...")
        
        roster = roster_data.get('roster', {})
        year = roster_data.get('year')
        month = roster_data.get('month')
        num_days = calendar.monthrange(year, month)[1]
        
        # Get flexible employees (not AGSM/Welcome Agent)
        position_map = {emp['id']: emp['position'] for emp in employees}
        flexible_employees = [emp_id for emp_id, pos in position_map.items() 
                            if pos not in ['AGSM', 'Welcome Agent']]
        
        violations = []
        
        for emp_id in flexible_employees:
            if emp_id not in roster:
                continue
                
            schedule = roster[emp_id]
            night_shifts = []
            
            # Find all night shifts for this employee
            for day in range(1, num_days + 1):
                date_str = f"{year}-{month:02d}-{day:02d}"
                if schedule.get(date_str) == '23':
                    night_shifts.append(day)
            
            if not night_shifts:
                continue  # No night shifts for this employee
            
            # Check if night shifts are in consecutive blocks of 5
            current_block = [night_shifts[0]]
            blocks = []
            
            for i in range(1, len(night_shifts)):
                if night_shifts[i] == night_shifts[i-1] + 1:
                    current_block.append(night_shifts[i])
                else:
                    blocks.append(current_block)
                    current_block = [night_shifts[i]]
            blocks.append(current_block)
            
            # Each block should be exactly 5 days
            for block in blocks:
                if len(block) != 5:
                    violations.append(f"Employee {emp_id}: night shift block of {len(block)} days (expected 5): {block}")
        
        self.tests_run += 1
        if not violations:
            self.tests_passed += 1
            print(f"✅ Passed - Night shifts appear in 5-day consecutive blocks")
        else:
            print(f"❌ Failed - {len(violations)} violations found:")
            for violation in violations[:3]:
                print(f"   • {violation}")
        
        return len(violations) == 0

    def test_no_am_pm_transition_without_off(self, roster_data, employees):
        """Test Rule: No AM→PM transition without off day between"""
        print(f"\n🔍 Testing No AM→PM Transition Without Off Day...")
        
        roster = roster_data.get('roster', {})
        year = roster_data.get('year')
        month = roster_data.get('month')
        num_days = calendar.monthrange(year, month)[1]
        
        # Get flexible employees (not AGSM/Welcome Agent)
        position_map = {emp['id']: emp['position'] for emp in employees}
        flexible_employees = [emp_id for emp_id, pos in position_map.items() 
                            if pos not in ['AGSM', 'Welcome Agent']]
        
        violations = []
        
        for emp_id in flexible_employees:
            if emp_id not in roster:
                continue
                
            schedule = roster[emp_id]
            
            for day in range(1, num_days):
                today_date = f"{year}-{month:02d}-{day:02d}"
                tomorrow_date = f"{year}-{month:02d}-{day+1:02d}"
                
                today_shift = schedule.get(today_date, '')
                tomorrow_shift = schedule.get(tomorrow_date, '')
                
                # Check AM→PM transition (7→15)
                if today_shift == '7' and tomorrow_shift == '15':
                    violations.append(f"Employee {emp_id}: AM→PM transition {today_date}→{tomorrow_date}")
                
                # Check PM→AM transition (15→7)
                if today_shift == '15' and tomorrow_shift == '7':
                    violations.append(f"Employee {emp_id}: PM→AM transition {today_date}→{tomorrow_date}")
        
        self.tests_run += 1
        if not violations:
            self.tests_passed += 1
            print(f"✅ Passed - No AM↔PM transitions without off day")
        else:
            print(f"❌ Failed - {len(violations)} violations found:")
            for violation in violations[:3]:
                print(f"   • {violation}")
        
        return len(violations) == 0

    def cleanup(self):
        """Clean up created employees"""
        print(f"\n🧹 Cleaning up {len(self.created_employee_ids)} created employees...")
        for emp_id in self.created_employee_ids.copy():
            self.test_delete_employee(emp_id)

def main():
    print("🏨 Hotel Staff Roster Generator - Backend API Testing")
    print("=" * 60)
    
    tester = HotelRosterAPITester()
    
    # Test 1: Root endpoint
    tester.test_root_endpoint()
    
    # Test 2: Create test employees with all required positions
    print("\n📝 Creating test employees...")
    emp1_id = tester.test_create_employee("Smith", "John", "AGSM")
    emp2_id = tester.test_create_employee("Johnson", "Sarah", "GSC")
    emp3_id = tester.test_create_employee("Williams", "Mike", "GSA")
    emp4_id = tester.test_create_employee("Brown", "Lisa", "Welcome Agent")
    emp5_id = tester.test_create_employee("Davis", "Tom", "GSC")
    emp6_id = tester.test_create_employee("Miller", "Anna", "GSA")
    
    # Test 3: Get employees and check position order
    employees = tester.test_get_employees()
    print(f"   Found {len(employees)} employees in database")
    
    # Test position order
    if employees:
        tester.test_position_order(employees)
    
    # Test 4: Generate roster and test all rules (if we have employees)
    employee_ids = [emp_id for emp_id in [emp1_id, emp2_id, emp3_id, emp4_id, emp5_id, emp6_id] if emp_id]
    
    if len(employee_ids) >= 4:  # Need at least 4 employees for meaningful testing
        current_year = datetime.now().year
        current_month = datetime.now().month
        
        print(f"\n📅 Testing roster generation for {current_month}/{current_year}...")
        
        # Test month view
        roster_data = tester.test_generate_roster(
            current_year, 
            current_month, 
            employee_ids,
            "month"
        )
        
        if roster_data:
            print(f"   Generated roster with {len(roster_data.get('roster', {}))} employee schedules")
            print(f"   Days info: {len(roster_data.get('days_info', []))} days")
            
            print("\n🔍 Testing Hotel Roster Rules...")
            print("-" * 40)
            
            # Test all specific roster rules
            tester.test_exactly_two_consecutive_off_days_per_week(roster_data)
            tester.test_balanced_off_days(roster_data)
            tester.test_agsm_welcome_agent_only_9am(roster_data, employees)
            tester.test_night_shifts_five_day_blocks(roster_data, employees)
            tester.test_no_am_pm_transition_without_off(roster_data, employees)
            
            # Test existing business logic constraints
            tester.test_night_shift_constraints(roster_data)
            tester.test_days_off_consecutive(roster_data)
            
            # Test week view
            tester.test_week_view_generation(current_year, current_month, employee_ids)
            
            # Test 5: Excel export
            tester.test_export_excel(current_year, current_month, employee_ids)
    else:
        print("❌ Not enough employees created for roster testing")
    
    # Cleanup
    tester.cleanup()
    
    # Print results
    print(f"\n📊 Backend API Test Results")
    print("=" * 40)
    print(f"Tests passed: {tester.tests_passed}/{tester.tests_run}")
    
    success_rate = (tester.tests_passed / tester.tests_run * 100) if tester.tests_run > 0 else 0
    print(f"Success rate: {success_rate:.1f}%")
    
    if success_rate >= 80:
        print("✅ Backend APIs are working well!")
        return 0
    else:
        print("❌ Backend has significant issues that need attention")
        return 1

if __name__ == "__main__":
    sys.exit(main())