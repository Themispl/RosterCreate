import { useState, useEffect, useCallback } from "react";
import "@/App.css";
import axios from "axios";
import { Toaster, toast } from "sonner";
import { 
  Calendar, 
  Users, 
  Download, 
  Plus, 
  Trash2, 
  Upload, 
  RefreshCw,
  ChevronDown,
  FileSpreadsheet,
  Menu,
  X,
  Edit2,
  Check
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Shift color configuration matching reference image
const SHIFT_COLORS = {
  "7": { bg: "#FF6666", text: "#000000", label: "Morning (7:00)" },
  "15": { bg: "#009933", text: "#FFFFFF", label: "Afternoon (15:00)" },
  "23": { bg: "#3366CC", text: "#FFFFFF", label: "Night (23:00)" },
  "9": { bg: "#FFFF66", text: "#000000", label: "9:00 AM" },
  "11": { bg: "#6699FF", text: "#000000", label: "11:00 AM" },
  "12": { bg: "#9966CC", text: "#FFFFFF", label: "12:00 PM" },
  "8": { bg: "#FF9999", text: "#000000", label: "8:00 AM" },
  "16": { bg: "#CC0033", text: "#FFFFFF", label: "4:00 PM" },
  "0": { bg: "#FF9999", text: "#B91C1C", label: "Day Off" },
  "V": { bg: "#663399", text: "#FFFFFF", label: "Vacation" },
  "L": { bg: "#CC6600", text: "#FFFFFF", label: "Leave" },
};

const POSITIONS = ["GSC", "GSA", "AGSM", "Welcome Agent"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

function App() {
  const [employees, setEmployees] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [roster, setRoster] = useState({});
  const [daysInfo, setDaysInfo] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [vacationDays, setVacationDays] = useState({});
  const [leaveDays, setLeaveDays] = useState({});
  
  // New employee form
  const [newEmployee, setNewEmployee] = useState({
    last_name: "",
    first_name: "",
    position: "GSC",
    group: ""
  });
  
  // CSV import
  const [isDragging, setIsDragging] = useState(false);
  
  // Cell edit dialog
  const [editCell, setEditCell] = useState(null);
  const [addEmployeeOpen, setAddEmployeeOpen] = useState(false);

  // Fetch employees on mount
  useEffect(() => {
    fetchEmployees();
  }, []);

  const fetchEmployees = async () => {
    try {
      const response = await axios.get(`${API}/employees`);
      setEmployees(response.data);
    } catch (error) {
      console.error("Failed to fetch employees:", error);
      toast.error("Failed to load employees");
    }
  };

  const addEmployee = async () => {
    if (!newEmployee.last_name || !newEmployee.first_name) {
      toast.error("Please fill in all required fields");
      return;
    }
    
    try {
      const response = await axios.post(`${API}/employees`, newEmployee);
      setEmployees([...employees, response.data]);
      setNewEmployee({ last_name: "", first_name: "", position: "GSC", group: "" });
      setAddEmployeeOpen(false);
      toast.success("Employee added successfully");
    } catch (error) {
      console.error("Failed to add employee:", error);
      toast.error("Failed to add employee");
    }
  };

  const deleteEmployee = async (id) => {
    try {
      await axios.delete(`${API}/employees/${id}`);
      setEmployees(employees.filter(e => e.id !== id));
      toast.success("Employee removed");
    } catch (error) {
      console.error("Failed to delete employee:", error);
      toast.error("Failed to remove employee");
    }
  };

  const handleCSVUpload = async (file) => {
    const formData = new FormData();
    formData.append("file", file);
    
    try {
      const response = await axios.post(`${API}/employees/import-csv`, formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      setEmployees([...employees, ...response.data.employees]);
      toast.success(`Imported ${response.data.imported} employees`);
    } catch (error) {
      console.error("Failed to import CSV:", error);
      toast.error("Failed to import CSV file");
    }
  };

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
    
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith(".csv")) {
      handleCSVUpload(file);
    } else {
      toast.error("Please upload a CSV file");
    }
  }, []);

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const generateRoster = async () => {
    if (employees.length === 0) {
      toast.error("Please add employees first");
      return;
    }
    
    setIsGenerating(true);
    
    try {
      const response = await axios.post(`${API}/roster/generate`, {
        year: selectedYear,
        month: selectedMonth,
        employees: employees.map(e => e.id),
        vacation_days: vacationDays,
        leave_days: leaveDays
      });
      
      setRoster(response.data.roster);
      setDaysInfo(response.data.days_info);
      toast.success("Roster generated successfully!");
    } catch (error) {
      console.error("Failed to generate roster:", error);
      toast.error("Failed to generate roster");
    } finally {
      setIsGenerating(false);
    }
  };

  const exportExcel = async () => {
    if (employees.length === 0 || Object.keys(roster).length === 0) {
      toast.error("Please generate a roster first");
      return;
    }
    
    setIsExporting(true);
    
    try {
      const response = await axios.post(`${API}/roster/export-excel`, {
        year: selectedYear,
        month: selectedMonth,
        employees: employees.map(e => e.id),
        vacation_days: vacationDays,
        leave_days: leaveDays
      }, {
        responseType: "blob"
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `roster_${selectedYear}_${selectedMonth.toString().padStart(2, '0')}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      
      toast.success("Excel file downloaded!");
    } catch (error) {
      console.error("Failed to export Excel:", error);
      toast.error("Failed to export Excel file");
    } finally {
      setIsExporting(false);
    }
  };

  const handleCellClick = (employeeId, date) => {
    setEditCell({ employeeId, date, currentValue: roster[employeeId]?.[date] || "" });
  };

  const updateCellValue = (value) => {
    if (!editCell) return;
    
    // Update local roster state
    setRoster(prev => ({
      ...prev,
      [editCell.employeeId]: {
        ...prev[editCell.employeeId],
        [editCell.date]: value
      }
    }));
    
    // Update vacation/leave tracking
    if (value === "V") {
      setVacationDays(prev => ({
        ...prev,
        [editCell.employeeId]: [...(prev[editCell.employeeId] || []), editCell.date]
      }));
    } else if (value === "L") {
      setLeaveDays(prev => ({
        ...prev,
        [editCell.employeeId]: [...(prev[editCell.employeeId] || []), editCell.date]
      }));
    }
    
    setEditCell(null);
    toast.success("Cell updated");
  };

  const getShiftStyle = (shift) => {
    if (!shift || !SHIFT_COLORS[shift]) {
      return { backgroundColor: "#FFFFFF", color: "#64748B" };
    }
    return { 
      backgroundColor: SHIFT_COLORS[shift].bg, 
      color: SHIFT_COLORS[shift].text 
    };
  };

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() + i - 2);

  return (
    <div className="app-container" data-testid="app-container">
      <Toaster position="top-right" richColors />
      
      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? '' : 'hidden md:flex'}`} data-testid="sidebar">
        <div className="sidebar-header">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight" style={{ fontFamily: "'Manrope', sans-serif" }}>
                StaffFlow
              </h1>
              <p className="text-sm text-slate-400 mt-1">Hotel Roster Generator</p>
            </div>
            <button 
              className="btn-ghost md:hidden"
              onClick={() => setSidebarOpen(false)}
              data-testid="close-sidebar-btn"
            >
              <X size={20} />
            </button>
          </div>
        </div>
        
        <ScrollArea className="sidebar-content flex-1">
          {/* Month/Year Selection */}
          <div className="form-group">
            <label className="form-label">
              <Calendar size={14} className="inline mr-2" />
              Select Period
            </label>
            <div className="flex gap-2">
              <Select 
                value={selectedMonth.toString()} 
                onValueChange={(v) => setSelectedMonth(parseInt(v))}
              >
                <SelectTrigger className="bg-slate-800 border-slate-700 text-white" data-testid="month-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((month, idx) => (
                    <SelectItem key={idx} value={(idx + 1).toString()}>
                      {month}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              <Select 
                value={selectedYear.toString()} 
                onValueChange={(v) => setSelectedYear(parseInt(v))}
              >
                <SelectTrigger className="bg-slate-800 border-slate-700 text-white w-24" data-testid="year-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {years.map(year => (
                    <SelectItem key={year} value={year.toString()}>
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          
          {/* CSV Upload */}
          <div className="form-group">
            <label className="form-label">
              <Upload size={14} className="inline mr-2" />
              Import Staff (CSV)
            </label>
            <div 
              className={`upload-zone ${isDragging ? 'dragover' : ''}`}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => document.getElementById('csv-input').click()}
              data-testid="csv-upload-zone"
            >
              <FileSpreadsheet size={32} className="mx-auto mb-2 text-slate-400" />
              <p className="text-sm text-slate-400">
                Drop CSV file here or click to upload
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Columns: last_name, first_name, position, group
              </p>
            </div>
            <input 
              type="file" 
              id="csv-input" 
              accept=".csv" 
              className="hidden"
              onChange={(e) => e.target.files[0] && handleCSVUpload(e.target.files[0])}
            />
          </div>
          
          {/* Add Employee */}
          <div className="form-group">
            <label className="form-label">
              <Users size={14} className="inline mr-2" />
              Staff ({employees.length})
            </label>
            
            <Dialog open={addEmployeeOpen} onOpenChange={setAddEmployeeOpen}>
              <DialogTrigger asChild>
                <Button 
                  className="w-full bg-blue-600 hover:bg-blue-700"
                  data-testid="add-employee-btn"
                >
                  <Plus size={16} className="mr-2" />
                  Add Employee
                </Button>
              </DialogTrigger>
              <DialogContent data-testid="add-employee-dialog">
                <DialogHeader>
                  <DialogTitle>Add New Employee</DialogTitle>
                  <DialogDescription>
                    Enter employee details below
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="last_name">Last Name *</Label>
                    <Input
                      id="last_name"
                      value={newEmployee.last_name}
                      onChange={(e) => setNewEmployee({...newEmployee, last_name: e.target.value})}
                      placeholder="e.g., Smith"
                      data-testid="last-name-input"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="first_name">First Name *</Label>
                    <Input
                      id="first_name"
                      value={newEmployee.first_name}
                      onChange={(e) => setNewEmployee({...newEmployee, first_name: e.target.value})}
                      placeholder="e.g., John"
                      data-testid="first-name-input"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="position">Position *</Label>
                    <Select 
                      value={newEmployee.position} 
                      onValueChange={(v) => setNewEmployee({...newEmployee, position: v})}
                    >
                      <SelectTrigger data-testid="position-select">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {POSITIONS.map(pos => (
                          <SelectItem key={pos} value={pos}>{pos}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="group">Group (Optional)</Label>
                    <Input
                      id="group"
                      value={newEmployee.group}
                      onChange={(e) => setNewEmployee({...newEmployee, group: e.target.value})}
                      placeholder="e.g., NAFSIKA"
                      data-testid="group-input"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setAddEmployeeOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={addEmployee} data-testid="save-employee-btn">
                    Save Employee
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            
            {/* Employee List */}
            <div className="employee-list mt-4" data-testid="employee-list">
              {employees.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-4">
                  No employees added yet
                </p>
              ) : (
                employees.map((emp) => (
                  <div key={emp.id} className="employee-item animate-fade-in" data-testid={`employee-item-${emp.id}`}>
                    <div className="employee-item-info">
                      <div className="employee-item-name">
                        {emp.last_name} {emp.first_name}
                      </div>
                      <div className="employee-item-position">
                        {emp.position} {emp.group && `• ${emp.group}`}
                      </div>
                    </div>
                    <button 
                      className="btn-ghost text-red-400 hover:text-red-300"
                      onClick={() => deleteEmployee(emp.id)}
                      data-testid={`delete-employee-${emp.id}`}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
          
          {/* Legend */}
          <div className="form-group mt-8">
            <label className="form-label">Color Legend</label>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(SHIFT_COLORS).map(([key, value]) => (
                <div key={key} className="legend-item">
                  <div 
                    className="legend-color"
                    style={{ backgroundColor: value.bg, color: value.text }}
                  >
                    {key}
                  </div>
                  <span className="text-xs text-slate-400">{value.label}</span>
                </div>
              ))}
            </div>
          </div>
        </ScrollArea>
      </aside>
      
      {/* Main Content */}
      <main className="main-content" data-testid="main-content">
        {/* Header */}
        <header className="main-header">
          <div className="flex items-center gap-4">
            <button 
              className="btn-ghost md:hidden"
              onClick={() => setSidebarOpen(true)}
              data-testid="open-sidebar-btn"
            >
              <Menu size={24} />
            </button>
            <div>
              <h2 className="text-xl font-bold text-slate-900" style={{ fontFamily: "'Manrope', sans-serif" }}>
                {MONTHS[selectedMonth - 1]} {selectedYear} Roster
              </h2>
              <p className="text-sm text-slate-500">
                {employees.length} employees • {daysInfo.length} days
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <Button
              onClick={generateRoster}
              disabled={isGenerating || employees.length === 0}
              className="bg-slate-900 hover:bg-slate-800"
              data-testid="generate-roster-btn"
            >
              {isGenerating ? (
                <RefreshCw size={16} className="mr-2 animate-spin" />
              ) : (
                <RefreshCw size={16} className="mr-2" />
              )}
              Generate Roster
            </Button>
            
            <Button
              onClick={exportExcel}
              disabled={isExporting || Object.keys(roster).length === 0}
              variant="outline"
              className="border-slate-200"
              data-testid="export-excel-btn"
            >
              {isExporting ? (
                <RefreshCw size={16} className="mr-2 animate-spin" />
              ) : (
                <Download size={16} className="mr-2" />
              )}
              Export Excel
            </Button>
          </div>
        </header>
        
        {/* Roster Grid */}
        <div className="roster-container" data-testid="roster-container">
          {Object.keys(roster).length === 0 ? (
            <div className="flex flex-col items-center justify-center h-96 text-slate-500">
              <Calendar size={64} className="mb-4 text-slate-300" />
              <h3 className="text-lg font-semibold mb-2">No Roster Generated</h3>
              <p className="text-sm text-center max-w-md">
                Add employees and click "Generate Roster" to create a schedule for {MONTHS[selectedMonth - 1]} {selectedYear}
              </p>
            </div>
          ) : (
            <div className="roster-table-wrapper overflow-x-auto">
              <table className="roster-table" data-testid="roster-table">
                <thead>
                  <tr>
                    <th className="sticky-col sticky-header employee-cell" style={{ minWidth: '200px', zIndex: 30 }}>
                      Employee
                    </th>
                    {daysInfo.map((day) => (
                      <th 
                        key={day.date} 
                        className={`day-header sticky-header ${['SAT', 'SUN'].includes(day.weekday) ? 'weekend' : ''}`}
                      >
                        <div className="font-bold">{day.day}</div>
                        <div className="text-xs text-slate-500">{day.weekday}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {employees.map((emp) => (
                    <tr key={emp.id} data-testid={`roster-row-${emp.id}`}>
                      <td className="sticky-col employee-cell">
                        <div className="employee-name">{emp.last_name} {emp.first_name}</div>
                        <div className="employee-position">{emp.position}</div>
                      </td>
                      {daysInfo.map((day) => {
                        const shift = roster[emp.id]?.[day.date] || "";
                        return (
                          <td 
                            key={day.date}
                            onClick={() => handleCellClick(emp.id, day.date)}
                            data-testid={`cell-${emp.id}-${day.date}`}
                          >
                            <div 
                              className="shift-cell"
                              style={getShiftStyle(shift)}
                            >
                              {shift}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
      
      {/* Cell Edit Dialog */}
      <Dialog open={!!editCell} onOpenChange={() => setEditCell(null)}>
        <DialogContent data-testid="edit-cell-dialog">
          <DialogHeader>
            <DialogTitle>Edit Shift</DialogTitle>
            <DialogDescription>
              Select a shift type for this day
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-3 gap-2 py-4">
            {Object.entries(SHIFT_COLORS).map(([key, value]) => (
              <Button
                key={key}
                variant="outline"
                className="h-16 flex flex-col gap-1"
                style={{ 
                  backgroundColor: value.bg, 
                  color: value.text,
                  borderColor: value.bg
                }}
                onClick={() => updateCellValue(key)}
                data-testid={`shift-option-${key}`}
              >
                <span className="font-bold text-lg">{key}</span>
                <span className="text-xs opacity-80">{value.label}</span>
              </Button>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditCell(null)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default App;
