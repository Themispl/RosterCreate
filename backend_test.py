import requests
import sys
import json
from datetime import datetime

class HotelRosterAPITester:
    def __init__(self, base_url="https://rota-maker.preview.emergentagent.com"):
        self.base_url = base_url
        self.api_url = f"{base_url}/api"
        self.tests_run = 0
        self.tests_passed = 0
        self.created_employee_ids = []

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

    def test_generate_roster(self, year, month, employee_ids):
        """Test roster generation"""
        data = {
            "year": year,
            "month": month,
            "employees": employee_ids,
            "vacation_days": {},
            "leave_days": {}
        }
        
        success, response = self.run_test(
            f"Generate Roster ({month}/{year})",
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
    
    # Test 2: Create employees
    emp1_id = tester.test_create_employee("Smith", "John", "GSC", "NAFSIKA")
    emp2_id = tester.test_create_employee("Johnson", "Sarah", "GSA", "WELCOME AGENTS")
    emp3_id = tester.test_create_employee("Brown", "Mike", "AGSM")
    emp4_id = tester.test_create_employee("Davis", "Emma", "Welcome Agent")
    
    # Test 3: Get employees
    employees = tester.test_get_employees()
    print(f"   Found {len(employees)} employees in database")
    
    # Test 4: Generate roster (if we have employees)
    if emp1_id and emp2_id:
        current_year = datetime.now().year
        current_month = datetime.now().month
        
        roster_data = tester.test_generate_roster(
            current_year, 
            current_month, 
            [emp1_id, emp2_id, emp3_id, emp4_id] if emp3_id and emp4_id else [emp1_id, emp2_id]
        )
        
        if roster_data:
            print(f"   Generated roster with {len(roster_data.get('roster', {}))} employee schedules")
            print(f"   Days info: {len(roster_data.get('days_info', []))} days")
            
            # Test 5: Excel export
            employee_ids = [emp1_id, emp2_id]
            if emp3_id:
                employee_ids.append(emp3_id)
            if emp4_id:
                employee_ids.append(emp4_id)
                
            tester.test_export_excel(current_year, current_month, employee_ids)
    
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