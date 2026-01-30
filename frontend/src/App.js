import { useState, useEffect, useCallback } from "react";
import "@/App.css";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import { Toaster, toast } from "sonner";
import { 
  Calendar, 
  Users, 
  Download, 
  Plus, 
  Trash2, 
  Upload, 
  RefreshCw,
  FileSpreadsheet,
  Menu,
  X,
  Palette,
  ChevronLeft,
  ChevronRight,
  Database
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

// Storage keys
const STORAGE_KEYS = {
  EMPLOYEES: 'staffflow_employees',
  COLORS: 'staffflow_colors',
  ROSTER: 'staffflow_roster'
};

// Default shift color configuration
const DEFAULT_SHIFT_COLORS = {
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

const POSITIONS = ["AGSM", "GSC", "GSA", "Welcome Agent"];
const POSITION_ORDER = { "AGSM": 0, "GSC": 1, "GSA": 2, "Welcome Agent": 3 };
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

// Helper function to get days in month
const getDaysInMonth = (year, month) => new Date(year, month, 0).getDate();

// Generate unique ID
const generateId = () => `emp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

// Roster generation algorithm (client-side)
const generateRosterLogic = (year, month, employees, vacationDays = {}, leaveDays = {}) => {
  const numDays = getDaysInMonth(year, month);
  
  // Initialize roster
  const roster = {};
  employees.forEach(emp => {
    roster[emp.id] = {};
    for (let d = 1; d <= numDays; d++) {
      roster[emp.id][`${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`] = null;
    }
  });
  
  // Apply vacation and leave
  employees.forEach(emp => {
    if (vacationDays[emp.id]) {
      vacationDays[emp.id].forEach(dateStr => {
        if (roster[emp.id] && roster[emp.id][dateStr] !== undefined) {
          roster[emp.id][dateStr] = 'V';
        }
      });
    }
    if (leaveDays[emp.id]) {
      leaveDays[emp.id].forEach(dateStr => {
        if (roster[emp.id] && roster[emp.id][dateStr] !== undefined) {
          roster[emp.id][dateStr] = 'L';
        }
      });
    }
  });
  
  // Separate employees
  const fixed9am = employees.filter(e => ['AGSM', 'Welcome Agent'].includes(e.position));
  const flexible = employees.filter(e => !['AGSM', 'Welcome Agent'].includes(e.position));
  
  // STEP 1: Assign 2 consecutive off days per week
  employees.forEach((emp, empIdx) => {
    const baseOffDay = empIdx % 5;
    let weekNum = 0;
    let d = 1;
    
    while (d <= numDays) {
      const dateObj = new Date(year, month - 1, d);
      const weekday = dateObj.getDay(); // 0=Sun, 1=Mon
      const mondayWeekday = weekday === 0 ? 6 : weekday - 1; // Convert to 0=Mon
      
      if (mondayWeekday === 0 || d === 1) {
        const weekStart = d;
        const weekEnd = Math.min(d + (6 - mondayWeekday), numDays);
        const targetOffWeekday = (baseOffDay + weekNum) % 5;
        
        let offAssigned = 0;
        for (let checkD = weekStart; checkD <= weekEnd && offAssigned < 2; checkD++) {
          const checkDate = new Date(year, month - 1, checkD);
          const checkWeekday = checkDate.getDay();
          const checkMondayWeekday = checkWeekday === 0 ? 6 : checkWeekday - 1;
          
          if (checkMondayWeekday === targetOffWeekday) {
            const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(checkD).padStart(2, '0')}`;
            if (roster[emp.id][dateStr] === null) {
              roster[emp.id][dateStr] = '0';
              offAssigned++;
            }
            if (checkD + 1 <= numDays) {
              const nextDateStr = `${year}-${String(month).padStart(2, '0')}-${String(checkD + 1).padStart(2, '0')}`;
              if (roster[emp.id][nextDateStr] === null) {
                roster[emp.id][nextDateStr] = '0';
                offAssigned++;
              }
            }
            break;
          }
        }
        
        // Fallback if couldn't assign
        if (offAssigned < 2) {
          for (let checkD = weekStart; checkD <= weekEnd && offAssigned < 2; checkD++) {
            const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(checkD).padStart(2, '0')}`;
            if (roster[emp.id][dateStr] === null) {
              roster[emp.id][dateStr] = '0';
              offAssigned++;
            }
          }
        }
        
        weekNum++;
        d = weekEnd + 1;
      } else {
        d++;
      }
    }
  });
  
  // STEP 2: Assign 9am to AGSM and Welcome Agent
  fixed9am.forEach(emp => {
    for (let d = 1; d <= numDays; d++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      if (roster[emp.id][dateStr] === null) {
        roster[emp.id][dateStr] = '9';
      }
    }
  });
  
  // STEP 3: Night shifts (5 consecutive, max 5 per month)
  const nightCount = {};
  flexible.forEach(e => nightCount[e.id] = 0);
  
  let currentNightWorker = null;
  let nightDaysDone = 0;
  
  for (let d = 1; d <= numDays; d++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    
    if (currentNightWorker === null || nightDaysDone >= 5) {
      for (const emp of flexible) {
        if (nightCount[emp.id] < 5) {
          let canDo = true;
          for (let checkD = d; checkD <= Math.min(d + 4, numDays); checkD++) {
            const checkDate = `${year}-${String(month).padStart(2, '0')}-${String(checkD).padStart(2, '0')}`;
            if (roster[emp.id][checkDate] === '0') {
              canDo = false;
              break;
            }
          }
          if (canDo) {
            currentNightWorker = emp.id;
            nightDaysDone = 0;
            break;
          }
        }
      }
    }
    
    if (currentNightWorker && nightDaysDone < 5) {
      if (roster[currentNightWorker][dateStr] === null) {
        roster[currentNightWorker][dateStr] = '23';
        nightCount[currentNightWorker]++;
        nightDaysDone++;
      } else {
        nightDaysDone++;
      }
    }
  }
  
  // STEP 4: Morning/Afternoon with 11-hour rule
  const lastShift = {};
  const shiftType = {};
  flexible.forEach((emp, idx) => {
    lastShift[emp.id] = null;
    shiftType[emp.id] = idx % 2 === 0 ? 'morning' : 'afternoon';
  });
  
  for (let d = 1; d <= numDays; d++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dateObj = new Date(year, month - 1, d);
    const weekday = dateObj.getDay();
    
    flexible.forEach(emp => {
      if (roster[emp.id][dateStr] !== null) {
        lastShift[emp.id] = roster[emp.id][dateStr];
        return;
      }
      
      const target = shiftType[emp.id];
      const prev = lastShift[emp.id];
      
      if (prev === '7' && target === 'afternoon') {
        roster[emp.id][dateStr] = '7';
        lastShift[emp.id] = '7';
      } else if (prev === '15' && target === 'morning') {
        roster[emp.id][dateStr] = '15';
        lastShift[emp.id] = '15';
      } else if (prev === '23') {
        roster[emp.id][dateStr] = '15';
        lastShift[emp.id] = '15';
        shiftType[emp.id] = 'afternoon';
      } else {
        if (target === 'morning') {
          roster[emp.id][dateStr] = '7';
          lastShift[emp.id] = '7';
        } else {
          roster[emp.id][dateStr] = '15';
          lastShift[emp.id] = '15';
        }
      }
    });
    
    // End of week - switch
    if (weekday === 0) {
      flexible.forEach(emp => {
        shiftType[emp.id] = shiftType[emp.id] === 'morning' ? 'afternoon' : 'morning';
      });
    }
  }
  
  // STEP 5: Fill remaining and ensure consecutive offs
  employees.forEach(emp => {
    for (let d = 1; d <= numDays; d++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      if (roster[emp.id][dateStr] === null) {
        roster[emp.id][dateStr] = ['AGSM', 'Welcome Agent'].includes(emp.position) ? '9' : '15';
      }
    }
    
    // Ensure consecutive offs
    const dates = Object.keys(roster[emp.id]).sort();
    for (let i = 0; i < dates.length; i++) {
      if (roster[emp.id][dates[i]] === '0') {
        if (i + 1 < dates.length && roster[emp.id][dates[i + 1]] !== '0') {
          if (!['V', 'L'].includes(roster[emp.id][dates[i + 1]])) {
            roster[emp.id][dates[i + 1]] = '0';
          }
        }
        i++; // Skip pair
      }
    }
  });
  
  return roster;
};

function App() {
  const [employees, setEmployees] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [roster, setRoster] = useState({});
  const [daysInfo, setDaysInfo] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [vacationDays, setVacationDays] = useState({});
  const [leaveDays, setLeaveDays] = useState({});
  
  const [viewType, setViewType] = useState("month");
  const [weekNumber, setWeekNumber] = useState(1);
  
  const [shiftColors, setShiftColors] = useState(DEFAULT_SHIFT_COLORS);
  const [colorDialogOpen, setColorDialogOpen] = useState(false);
  const [editingColor, setEditingColor] = useState(null);
  const [tempColor, setTempColor] = useState({ bg: "", text: "" });
  
  const [newEmployee, setNewEmployee] = useState({
    last_name: "",
    first_name: "",
    position: "GSC",
    group: ""
  });
  
  const [isDragging, setIsDragging] = useState(false);
  const [editCell, setEditCell] = useState(null);
  const [addEmployeeOpen, setAddEmployeeOpen] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    const savedEmployees = localStorage.getItem(STORAGE_KEYS.EMPLOYEES);
    if (savedEmployees) {
      try {
        const parsed = JSON.parse(savedEmployees);
        setEmployees(parsed.sort((a, b) => {
          const orderA = POSITION_ORDER[a.position] ?? 99;
          const orderB = POSITION_ORDER[b.position] ?? 99;
          return orderA !== orderB ? orderA - orderB : a.last_name.localeCompare(b.last_name);
        }));
      } catch (e) {
        console.error('Failed to parse employees:', e);
      }
    }
    
    const savedColors = localStorage.getItem(STORAGE_KEYS.COLORS);
    if (savedColors) {
      try {
        setShiftColors({ ...DEFAULT_SHIFT_COLORS, ...JSON.parse(savedColors) });
      } catch (e) {
        console.error('Failed to parse colors:', e);
      }
    }
  }, []);

  // Save employees to localStorage
  const saveEmployees = (emps) => {
    localStorage.setItem(STORAGE_KEYS.EMPLOYEES, JSON.stringify(emps));
  };

  // Save colors to localStorage
  const saveColors = (colors) => {
    localStorage.setItem(STORAGE_KEYS.COLORS, JSON.stringify(colors));
  };

  const addEmployee = () => {
    if (!newEmployee.last_name || !newEmployee.first_name) {
      toast.error("Please fill in all required fields");
      return;
    }
    
    const emp = {
      id: generateId(),
      ...newEmployee,
      created_at: new Date().toISOString()
    };
    
    const updated = [...employees, emp].sort((a, b) => {
      const orderA = POSITION_ORDER[a.position] ?? 99;
      const orderB = POSITION_ORDER[b.position] ?? 99;
      return orderA !== orderB ? orderA - orderB : a.last_name.localeCompare(b.last_name);
    });
    
    setEmployees(updated);
    saveEmployees(updated);
    setNewEmployee({ last_name: "", first_name: "", position: "GSC", group: "" });
    setAddEmployeeOpen(false);
    toast.success("Employee added successfully");
  };

  const deleteEmployee = (id) => {
    const updated = employees.filter(e => e.id !== id);
    setEmployees(updated);
    saveEmployees(updated);
    toast.success("Employee removed");
  };

  const handleCSVUpload = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target.result;
        const lines = text.split('\n');
        const headers = lines[0].toLowerCase().split(',').map(h => h.trim());
        
        const newEmps = [];
        for (let i = 1; i < lines.length; i++) {
          if (!lines[i].trim()) continue;
          const values = lines[i].split(',').map(v => v.trim());
          
          const emp = {
            id: generateId(),
            last_name: values[headers.indexOf('last_name')] || values[0] || '',
            first_name: values[headers.indexOf('first_name')] || values[1] || '',
            position: values[headers.indexOf('position')] || values[2] || 'GSC',
            group: values[headers.indexOf('group')] || values[3] || '',
            created_at: new Date().toISOString()
          };
          
          if (emp.last_name && emp.first_name) {
            newEmps.push(emp);
          }
        }
        
        const updated = [...employees, ...newEmps].sort((a, b) => {
          const orderA = POSITION_ORDER[a.position] ?? 99;
          const orderB = POSITION_ORDER[b.position] ?? 99;
          return orderA !== orderB ? orderA - orderB : a.last_name.localeCompare(b.last_name);
        });
        
        setEmployees(updated);
        saveEmployees(updated);
        toast.success(`Imported ${newEmps.length} employees`);
      } catch (err) {
        toast.error("Failed to parse CSV file");
        console.error(err);
      }
    };
    reader.readAsText(file);
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
  }, [employees]);

  const generateRoster = () => {
    if (employees.length === 0) {
      toast.error("Please add employees first");
      return;
    }
    
    setIsGenerating(true);
    
    setTimeout(() => {
      try {
        const generatedRoster = generateRosterLogic(
          selectedYear,
          selectedMonth,
          employees,
          vacationDays,
          leaveDays
        );
        
        setRoster(generatedRoster);
        
        // Generate days info
        const numDays = getDaysInMonth(selectedYear, selectedMonth);
        const weekdayNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
        const days = [];
        
        for (let d = 1; d <= numDays; d++) {
          const dateObj = new Date(selectedYear, selectedMonth - 1, d);
          days.push({
            day: d,
            weekday: weekdayNames[dateObj.getDay()],
            date: `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`
          });
        }
        
        // Filter for week view
        if (viewType === "week" && weekNumber) {
          const startDay = (weekNumber - 1) * 7;
          const endDay = Math.min(startDay + 7, numDays);
          setDaysInfo(days.slice(startDay, endDay));
        } else {
          setDaysInfo(days);
        }
        
        toast.success("Roster generated successfully!");
      } catch (err) {
        toast.error("Failed to generate roster");
        console.error(err);
      } finally {
        setIsGenerating(false);
      }
    }, 100);
  };

  const exportExcel = () => {
    if (employees.length === 0 || Object.keys(roster).length === 0) {
      toast.error("Please generate a roster first");
      return;
    }
    
    try {
      const numDays = getDaysInMonth(selectedYear, selectedMonth);
      const weekdayNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
      
      // Prepare data
      const data = [];
      
      // Header row 1 - day numbers
      const header1 = ['LAST NAME', 'FIRST NAME', 'POSITION'];
      for (let d = 1; d <= numDays; d++) {
        header1.push(d);
      }
      data.push(header1);
      
      // Header row 2 - weekdays
      const header2 = ['', '', ''];
      for (let d = 1; d <= numDays; d++) {
        const dateObj = new Date(selectedYear, selectedMonth - 1, d);
        header2.push(weekdayNames[dateObj.getDay()]);
      }
      data.push(header2);
      
      // Employee rows
      employees.forEach(emp => {
        const row = [emp.last_name, emp.first_name, emp.position];
        for (let d = 1; d <= numDays; d++) {
          const dateStr = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
          row.push(roster[emp.id]?.[dateStr] || '');
        }
        data.push(row);
      });
      
      // Create workbook
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(data);
      
      // Set column widths
      ws['!cols'] = [
        { wch: 15 }, { wch: 15 }, { wch: 12 },
        ...Array(numDays).fill({ wch: 5 })
      ];
      
      XLSX.utils.book_append_sheet(wb, ws, `Roster ${selectedMonth}-${selectedYear}`);
      
      // Generate and download
      const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([wbout], { type: 'application/octet-stream' });
      saveAs(blob, `roster_${selectedYear}_${String(selectedMonth).padStart(2, '0')}.xlsx`);
      
      toast.success("Excel file downloaded!");
    } catch (err) {
      toast.error("Failed to export Excel");
      console.error(err);
    }
  };

  const handleCellClick = (employeeId, date) => {
    setEditCell({ employeeId, date, currentValue: roster[employeeId]?.[date] || "" });
  };

  const updateCellValue = (value) => {
    if (!editCell) return;
    
    setRoster(prev => ({
      ...prev,
      [editCell.employeeId]: {
        ...prev[editCell.employeeId],
        [editCell.date]: value
      }
    }));
    
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
    if (!shift || !shiftColors[shift]) {
      return { backgroundColor: "#FFFFFF", color: "#64748B" };
    }
    return { backgroundColor: shiftColors[shift].bg, color: shiftColors[shift].text };
  };

  const openColorEditor = (shiftKey) => {
    setEditingColor(shiftKey);
    setTempColor({ bg: shiftColors[shiftKey].bg, text: shiftColors[shiftKey].text });
    setColorDialogOpen(true);
  };

  const saveColorEdit = () => {
    if (editingColor) {
      const updated = {
        ...shiftColors,
        [editingColor]: { ...shiftColors[editingColor], bg: tempColor.bg, text: tempColor.text }
      };
      setShiftColors(updated);
      saveColors(updated);
      setColorDialogOpen(false);
      setEditingColor(null);
      toast.success("Color saved");
    }
  };

  const getWeeksInMonth = () => Math.ceil(getDaysInMonth(selectedYear, selectedMonth) / 7);
  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() + i - 2);

  return (
    <div className="app-container" data-testid="app-container">
      <Toaster position="top-right" richColors />
      
      {/* Storage indicator */}
      <div className="fixed bottom-4 right-4 bg-green-600 text-white px-3 py-1 rounded-full text-xs flex items-center gap-2 z-50">
        <Database size={12} />
        Browser Storage Active
      </div>
      
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
            <button className="btn-ghost md:hidden" onClick={() => setSidebarOpen(false)}>
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
              <Select value={selectedMonth.toString()} onValueChange={(v) => setSelectedMonth(parseInt(v))}>
                <SelectTrigger className="bg-slate-800 border-slate-700 text-white" data-testid="month-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((month, idx) => (
                    <SelectItem key={idx} value={(idx + 1).toString()}>{month}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              <Select value={selectedYear.toString()} onValueChange={(v) => setSelectedYear(parseInt(v))}>
                <SelectTrigger className="bg-slate-800 border-slate-700 text-white w-24" data-testid="year-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {years.map(year => (
                    <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          
          {/* View Type */}
          <div className="form-group">
            <label className="form-label">View Type</label>
            <Tabs value={viewType} onValueChange={setViewType} className="w-full">
              <TabsList className="w-full bg-slate-800">
                <TabsTrigger value="month" className="flex-1 data-[state=active]:bg-blue-600">Month</TabsTrigger>
                <TabsTrigger value="week" className="flex-1 data-[state=active]:bg-blue-600">Week</TabsTrigger>
              </TabsList>
            </Tabs>
            
            {viewType === "week" && (
              <div className="flex items-center justify-between mt-3 bg-slate-800 rounded-lg p-2">
                <Button variant="ghost" size="sm" onClick={() => setWeekNumber(Math.max(1, weekNumber - 1))} disabled={weekNumber <= 1} className="text-white hover:bg-slate-700">
                  <ChevronLeft size={18} />
                </Button>
                <span className="text-white font-medium">Week {weekNumber}</span>
                <Button variant="ghost" size="sm" onClick={() => setWeekNumber(Math.min(getWeeksInMonth(), weekNumber + 1))} disabled={weekNumber >= getWeeksInMonth()} className="text-white hover:bg-slate-700">
                  <ChevronRight size={18} />
                </Button>
              </div>
            )}
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
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onClick={() => document.getElementById('csv-input').click()}
            >
              <FileSpreadsheet size={32} className="mx-auto mb-2 text-slate-400" />
              <p className="text-sm text-slate-400">Drop CSV file here or click to upload</p>
              <p className="text-xs text-slate-500 mt-1">Columns: last_name, first_name, position, group</p>
            </div>
            <input type="file" id="csv-input" accept=".csv" className="hidden" onChange={(e) => e.target.files[0] && handleCSVUpload(e.target.files[0])} />
          </div>
          
          {/* Add Employee */}
          <div className="form-group">
            <label className="form-label">
              <Users size={14} className="inline mr-2" />
              Staff ({employees.length})
            </label>
            
            <Dialog open={addEmployeeOpen} onOpenChange={setAddEmployeeOpen}>
              <DialogTrigger asChild>
                <Button className="w-full bg-blue-600 hover:bg-blue-700" data-testid="add-employee-btn">
                  <Plus size={16} className="mr-2" />
                  Add Employee
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add New Employee</DialogTitle>
                  <DialogDescription>Enter employee details below</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label>Last Name *</Label>
                    <Input value={newEmployee.last_name} onChange={(e) => setNewEmployee({...newEmployee, last_name: e.target.value})} placeholder="e.g., Smith" data-testid="last-name-input" />
                  </div>
                  <div className="grid gap-2">
                    <Label>First Name *</Label>
                    <Input value={newEmployee.first_name} onChange={(e) => setNewEmployee({...newEmployee, first_name: e.target.value})} placeholder="e.g., John" data-testid="first-name-input" />
                  </div>
                  <div className="grid gap-2">
                    <Label>Position *</Label>
                    <Select value={newEmployee.position} onValueChange={(v) => setNewEmployee({...newEmployee, position: v})}>
                      <SelectTrigger data-testid="position-select"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {POSITIONS.map(pos => (<SelectItem key={pos} value={pos}>{pos}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label>Group (Optional)</Label>
                    <Input value={newEmployee.group} onChange={(e) => setNewEmployee({...newEmployee, group: e.target.value})} placeholder="e.g., NAFSIKA" />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setAddEmployeeOpen(false)}>Cancel</Button>
                  <Button onClick={addEmployee} data-testid="save-employee-btn">Save Employee</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            
            {/* Employee List */}
            <div className="employee-list mt-4">
              {employees.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-4">No employees added yet</p>
              ) : (
                employees.map((emp) => (
                  <div key={emp.id} className="employee-item animate-fade-in">
                    <div className="employee-item-info">
                      <div className="employee-item-name">{emp.last_name} {emp.first_name}</div>
                      <div className="employee-item-position">{emp.position} {emp.group && `• ${emp.group}`}</div>
                    </div>
                    <button className="btn-ghost text-red-400 hover:text-red-300" onClick={() => deleteEmployee(emp.id)}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
          
          {/* Color Legend */}
          <div className="form-group mt-8">
            <div className="flex items-center justify-between mb-2">
              <label className="form-label mb-0">Color Legend</label>
              <span className="text-xs text-slate-500">Click to edit</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(shiftColors).map(([key, value]) => (
                <div key={key} className="legend-item cursor-pointer hover:bg-slate-800 p-1 rounded transition-colors" onClick={() => openColorEditor(key)}>
                  <div className="legend-color" style={{ backgroundColor: value.bg, color: value.text }}>{key}</div>
                  <span className="text-xs text-slate-400">{value.label}</span>
                </div>
              ))}
            </div>
          </div>
        </ScrollArea>
      </aside>
      
      {/* Main Content */}
      <main className="main-content">
        <header className="main-header">
          <div className="flex items-center gap-4">
            <button className="btn-ghost md:hidden" onClick={() => setSidebarOpen(true)}>
              <Menu size={24} />
            </button>
            <div>
              <h2 className="text-xl font-bold text-slate-900" style={{ fontFamily: "'Manrope', sans-serif" }}>
                {MONTHS[selectedMonth - 1]} {selectedYear} Roster
                {viewType === "week" && ` - Week ${weekNumber}`}
              </h2>
              <p className="text-sm text-slate-500">{employees.length} employees • {daysInfo.length} days</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <Button onClick={generateRoster} disabled={isGenerating || employees.length === 0} className="bg-slate-900 hover:bg-slate-800" data-testid="generate-roster-btn">
              <RefreshCw size={16} className={`mr-2 ${isGenerating ? 'animate-spin' : ''}`} />
              Generate Roster
            </Button>
            
            <Button onClick={exportExcel} disabled={Object.keys(roster).length === 0} variant="outline" className="border-slate-200" data-testid="export-excel-btn">
              <Download size={16} className="mr-2" />
              Export Excel
            </Button>
          </div>
        </header>
        
        {/* Roster Grid */}
        <div className="roster-container">
          {Object.keys(roster).length === 0 ? (
            <div className="flex flex-col items-center justify-center h-96 text-slate-500">
              <Calendar size={64} className="mb-4 text-slate-300" />
              <h3 className="text-lg font-semibold mb-2">No Roster Generated</h3>
              <p className="text-sm text-center max-w-md">
                Add employees and click "Generate Roster" to create a schedule
              </p>
            </div>
          ) : (
            <div className="roster-table-wrapper overflow-x-auto">
              <table className="roster-table">
                <thead>
                  <tr>
                    <th className="sticky-col sticky-header employee-cell" style={{ width: '120px', zIndex: 30 }}>Employee</th>
                    {daysInfo.map((day) => (
                      <th key={day.date} className={`day-header sticky-header ${['SAT', 'SUN'].includes(day.weekday) ? 'weekend' : ''}`}>
                        <div className="font-bold">{day.day}</div>
                        <div className="text-xs text-slate-500">{day.weekday}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {employees.map((emp) => (
                    <tr key={emp.id}>
                      <td className="sticky-col employee-cell" style={{ width: '120px' }}>
                        <div className="employee-name" title={`${emp.last_name} ${emp.first_name}`}>{emp.last_name}</div>
                        <div className="employee-position" title={`${emp.first_name} - ${emp.position}`}>{emp.first_name} • {emp.position}</div>
                      </td>
                      {daysInfo.map((day) => {
                        const shift = roster[emp.id]?.[day.date] || "";
                        return (
                          <td key={day.date} onClick={() => handleCellClick(emp.id, day.date)}>
                            <div className="shift-cell" style={getShiftStyle(shift)}>{shift}</div>
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Shift</DialogTitle>
            <DialogDescription>Select a shift type for this day</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-3 gap-2 py-4">
            {Object.entries(shiftColors).map(([key, value]) => (
              <Button key={key} variant="outline" className="h-16 flex flex-col gap-1" style={{ backgroundColor: value.bg, color: value.text, borderColor: value.bg }} onClick={() => updateCellValue(key)}>
                <span className="font-bold text-lg">{key}</span>
                <span className="text-xs opacity-80">{value.label}</span>
              </Button>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditCell(null)}>Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Color Edit Dialog */}
      <Dialog open={colorDialogOpen} onOpenChange={setColorDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle><Palette className="inline mr-2" size={20} />Edit Color for "{editingColor}"</DialogTitle>
            <DialogDescription>Customize the background and text color</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Background Color</Label>
              <div className="flex gap-2 items-center">
                <input type="color" value={tempColor.bg} onChange={(e) => setTempColor({...tempColor, bg: e.target.value})} className="w-12 h-10 rounded border cursor-pointer" />
                <Input value={tempColor.bg} onChange={(e) => setTempColor({...tempColor, bg: e.target.value})} placeholder="#FF6666" className="flex-1" />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Text Color</Label>
              <div className="flex gap-2 items-center">
                <input type="color" value={tempColor.text} onChange={(e) => setTempColor({...tempColor, text: e.target.value})} className="w-12 h-10 rounded border cursor-pointer" />
                <Input value={tempColor.text} onChange={(e) => setTempColor({...tempColor, text: e.target.value})} placeholder="#000000" className="flex-1" />
              </div>
            </div>
            <div className="mt-2">
              <Label>Preview</Label>
              <div className="mt-2 p-4 rounded-lg text-center font-bold text-xl" style={{ backgroundColor: tempColor.bg, color: tempColor.text }}>{editingColor}</div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setColorDialogOpen(false)}>Cancel</Button>
            <Button onClick={saveColorEdit}>Save Color</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default App;
