
"use client";

import { useState } from "react";
import {
  Activity,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Bell,
  BookOpen,
  Bot,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Clock3,
  Cloud,
  Command,
  Database,
  File,
  FileSpreadsheet,
  FileText,
  Folder,
  FolderOpen,
  Grid2X2,
  HardDrive,
  LayoutDashboard,
  List,
  MoreHorizontal,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  UploadCloud,
  Users,
  Workflow,
} from "lucide-react";

const BLUE = "#2869e8";

const navigation = [
  { icon: LayoutDashboard, label: "Dashboard" },
  { icon: BookOpen, label: "Knowledge", active: true },
  { icon: Bot, label: "AI Agents" },
  { icon: Workflow, label: "Workflows" },
  { icon: BarChart3, label: "Analytics" },
  { icon: Users, label: "Team" },
];

const folders = [
  { name: "Company Policies", count: 24 },
  { name: "Operations", count: 18 },
  { name: "Human Resources", count: 12 },
  { name: "Finance", count: 9 },
  { name: "Technical Documentation", count: 32 },
];

const documents = [
  {
    name: "Expense Reimbursement Policy.pdf",
    folder: "Company Policies",
    type: "PDF",
    color: "#ef4444",
    bg: "#fff0f0",
    icon: FileText,
    source: "HR Team",
    usage: 312,
    date: "May 19, 2026",
    author: "Sarah Ahmed",
    bars: [5, 9, 6, 15, 11, 7, 4],
  },
  {
    name: "Vendor Management Guidelines.docx",
    folder: "Operations",
    type: "DOCX",
    color: "#2874eb",
    bg: "#edf4ff",
    icon: FileText,
    source: "Operations",
    usage: 245,
    date: "May 18, 2026",
    author: "Rafiq Hasan",
    bars: [4, 8, 12, 18, 10, 6, 3],
  },
  {
    name: "Pricing & Discount Matrix.xlsx",
    folder: "Finance",
    type: "XLSX",
    color: "#18a66a",
    bg: "#eafaf2",
    icon: FileSpreadsheet,
    source: "Finance",
    usage: 189,
    date: "May 18, 2026",
    author: "Nusrat Jahan",
    bars: [4, 7, 14, 10, 17, 6, 3],
  },
  {
    name: "Onboarding Process Overview.pptx",
    folder: "Human Resources",
    type: "PPTX",
    color: "#ef9a37",
    bg: "#fff4e8",
    icon: File,
    source: "HR Team",
    usage: 156,
    date: "May 17, 2026",
    author: "Sarah Ahmed",
    bars: [3, 9, 17, 10, 7, 4, 2],
  },
  {
    name: "Industry Regulations & Compliance",
    folder: "Legal",
    type: "URL",
    color: "#9b65e9",
    bg: "#f4edff",
    icon: ShieldCheck,
    source: "Legal",
    usage: 142,
    date: "May 16, 2026",
    author: "Hasan Mahmud",
    bars: [5, 10, 16, 9, 5, 3, 2],
  },
  {
    name: "Employee Code of Conduct.txt",
    folder: "Company Policies",
    type: "TXT",
    color: "#64748b",
    bg: "#eef2f7",
    icon: FileText,
    source: "HR Team",
    usage: 98,
    date: "May 15, 2026",
    author: "Sarah Ahmed",
    bars: [6, 12, 16, 9, 7, 4, 2],
  },
  {
    name: "Q1 Financial Report 2026.pdf",
    folder: "Finance",
    type: "PDF",
    color: "#ef4444",
    bg: "#fff0f0",
    icon: FileText,
    source: "Finance",
    usage: 87,
    date: "May 14, 2026",
    author: "Nusrat Jahan",
    bars: [3, 7, 12, 8, 5, 3, 2],
  },
  {
    name: "IT Security Best Practices.docx",
    folder: "Technical Documentation",
    type: "DOCX",
    color: "#2874eb",
    bg: "#edf4ff",
    icon: FileText,
    source: "IT Team",
    usage: 65,
    date: "May 14, 2026",
    author: "Jahid Hasan",
    bars: [4, 9, 15, 11, 7, 4, 2],
  },
];

const metrics = [
  {
    label: "Total Documents",
    value: "1,248",
    growth: "18%",
    icon: FileText,
    color: "#2869e8",
    bg: "#edf3ff",
    line: "0,30 16,24 32,29 48,17 64,22 80,12 96,20 112,8 128,14 144,5 160,14",
  },
  {
    label: "Total Size",
    value: "24.6 GB",
    growth: "12%",
    icon: Database,
    color: "#9659e9",
    bg: "#f5edff",
    line: "0,25 16,23 32,30 48,17 64,24 80,14 96,21 112,7 128,15 144,6 160,13",
  },
  {
    label: "Sources",
    value: "38",
    growth: "15%",
    icon: HardDrive,
    color: "#17a878",
    bg: "#e8faf2",
    line: "0,17 16,19 32,27 48,16 64,21 80,26 96,10 112,17 128,12 144,15 160,9",
  },
  {
    label: "AI Usage",
    value: "4.2K",
    growth: "22%",
    icon: Sparkles,
    color: "#ef9c3c",
    bg: "#fff5e9",
    line: "0,17 16,22 32,29 48,13 64,7 80,19 96,30 112,25 128,13 144,22 160,8",
  },
];

function MetricCard({
  metric,
}: {
  metric: (typeof metrics)[number];
}) {
  const Icon = metric.icon;

  return (
    <div className="min-w-0 rounded-[22px] border border-white/90 bg-white/85 p-5 shadow-[0_8px_35px_rgba(50,85,155,0.035)] backdrop-blur-xl">
      <div className="flex items-center gap-3">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-[13px]"
          style={{ background: metric.bg, color: metric.color }}
        >
          <Icon size={19} strokeWidth={1.8} />
        </div>
        <span className="text-[12px] font-medium text-slate-600">
          {metric.label}
        </span>
      </div>

      <div className="mt-4 text-[27px] font-semibold tracking-[-1.2px] text-[#17233d]">
        {metric.value}
      </div>

      <div className="mt-1 flex items-center gap-1 text-[11px]">
        <ArrowUpRight size={13} className="text-emerald-500" />
        <span className="font-medium text-slate-700">
          {metric.growth}
        </span>
        <span className="text-slate-400">vs last month</span>
      </div>

      <svg
        viewBox="0 0 160 42"
        preserveAspectRatio="none"
        className="mt-3 h-10 w-full overflow-visible"
      >

        <defs>
        <linearGradient
            id={`gradient-${metric.label.replaceAll(" ", "-")}`}
            x1="0"
            y1="0"
            x2="0"
            y2="1"
        >
            <stop offset="0%" stopColor={metric.color} stopOpacity="0.15" />
            <stop offset="100%" stopColor={metric.color} stopOpacity="0" />
        </linearGradient>
        </defs>


        <polygon
        points={`0,42 ${metric.line} 160,42`}
        fill={`url(#gradient-${metric.label.replaceAll(" ", "-")})`}
        />
        <polyline
          points={metric.line}
          fill="none"
          stroke={metric.color}
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

export default function TestPage() {
  const [activeNav, setActiveNav] = useState("Knowledge");
  const [activeTab, setActiveTab] = useState("All Content");
  const [search, setSearch] = useState("");
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [view, setView] = useState<"list" | "grid">("list");
  const [sort, setSort] = useState("recent");
  const [type, setType] = useState("all");
  const [page, setPage] = useState(1);
  const [showUpload, setShowUpload] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);

  const filteredDocuments = documents
    .filter((doc) => {
      const matchesSearch =
        doc.name.toLowerCase().includes(search.toLowerCase()) ||
        doc.folder.toLowerCase().includes(search.toLowerCase());

      const matchesFolder =
        !selectedFolder || doc.folder === selectedFolder;

      const matchesType = type === "all" || doc.type === type;

      return matchesSearch && matchesFolder && matchesType;
    })
    .sort((a, b) =>
      sort === "popular"
        ? b.usage - a.usage
        : sort === "name"
          ? a.name.localeCompare(b.name)
          : 0
    );

  return (
    <div
      className="min-h-screen font-sans text-[#202b42]"
      style={{
        background:
          "radial-gradient(ellipse 65% 55% at 5% 0%, #eaf0ff 0%, transparent 75%), radial-gradient(ellipse 55% 50% at 100% 5%, #eaf3ff 0%, transparent 75%), radial-gradient(ellipse 60% 50% at 50% 100%, #f0efff 0%, transparent 75%), #f7f9ff",
      }}
    >
      <div className="flex min-h-screen">

        {/* PRIMARY SIDEBAR */}

        <aside className="sticky top-0 hidden h-screen w-[76px] shrink-0 flex-col items-center border-r border-[#e9edf7] bg-white/75 py-6 backdrop-blur-2xl lg:flex">
          <div
            className="flex h-11 w-11 items-center justify-center rounded-2xl text-white shadow-[0_5px_15px_rgba(40,105,232,0.2)]"
            style={{
              background: "linear-gradient(145deg,#58b7ff,#2869e8 75%)",
            }}
          >
            <Sparkles size={22} strokeWidth={1.8} />
          </div>

          <div className="mt-12 flex w-full flex-col items-center gap-3">
            {navigation.map((item) => {
              const Icon = item.icon;
              const active = activeNav === item.label;

              return (
                <button
                  key={item.label}
                  title={item.label}
                  onClick={() => setActiveNav(item.label)}
                  className={`relative flex h-11 w-11 items-center justify-center rounded-[14px] transition-all duration-200 ${
                    active
                      ? "bg-[#eaf1ff] text-[#2869e8] shadow-[0_4px_12px_rgba(40,105,232,0.08)]"
                      : "text-[#8290a7] hover:bg-[#f1f5ff] hover:text-[#2869e8]"
                  }`}
                >
                  {active && (
                    <span className="absolute -left-[16px] h-7 w-[3px] rounded-r-full bg-[#2869e8]" />
                  )}
                  <Icon size={20} strokeWidth={1.8} />
                </button>
              );
            })}
          </div>

          <div className="mt-auto flex flex-col items-center gap-4">
            <button
              title="Settings"
              className="flex h-11 w-11 items-center justify-center rounded-xl text-[#8290a7] hover:bg-[#f1f5ff]"
            >
              <Settings size={20} />
            </button>

            <div className="flex h-10 w-10 items-center justify-center rounded-full border-[3px] border-white bg-gradient-to-br from-[#c9d9ff] to-[#7896d9] text-xs font-semibold text-white shadow-sm">
              ML
            </div>
          </div>
        </aside>

        {/* SECONDARY SIDEBAR */}

        <aside className="sticky top-0 hidden h-screen w-[235px] shrink-0 flex-col border-r border-[#e9edf7]/70 bg-white/55 px-4 py-6 backdrop-blur-xl xl:flex">
          <div className="mb-10 flex items-center gap-3 px-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#eaf1ff] text-[#2869e8]">
              <BookOpen size={19} />
            </div>
            <div>
              <div className="text-[15px] font-bold tracking-[-0.4px]">
                Knowledge
              </div>
              <div className="text-[11px] text-slate-400">
                CRS LAB Workspace
              </div>
            </div>
            <ChevronDown size={14} className="ml-auto text-slate-400" />
          </div>

          <div className="mb-3 px-3 text-[10px] font-semibold uppercase tracking-[1.3px] text-slate-400">
            Workspace
          </div>

          <button
            onClick={() => {
              setActiveTab("All Content");
              setSelectedFolder(null);
            }}
            className={`mb-2 flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-[12px] font-medium transition ${
              !selectedFolder && activeTab === "All Content"
                ? "bg-[#eaf1ff] text-[#2869e8]"
                : "text-slate-500 hover:bg-white/80"
            }`}
          >
            <Grid2X2 size={17} />
            All Content
            <span className="ml-auto text-[10px]">1,248</span>
          </button>

          <button
            onClick={() => {
              setActiveTab("Folders");
              setSelectedFolder(null);
            }}
            className={`mb-5 flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-[12px] font-medium ${
              activeTab === "Folders" && !selectedFolder
                ? "bg-[#eaf1ff] text-[#2869e8]"
                : "text-slate-500 hover:bg-white/80"
            }`}
          >
            <FolderOpen size={17} />
            All Folders
          </button>

          <div className="mb-3 flex items-center justify-between px-3">
            <span className="text-[10px] font-semibold uppercase tracking-[1.3px] text-slate-400">
              Folders
            </span>
            <Plus size={15} className="text-slate-400" />
          </div>

          <div className="space-y-1">
            {folders.map((folder) => (
              <button
                key={folder.name}
                onClick={() => {
                  setSelectedFolder(folder.name);
                  setActiveTab("Folders");
                }}
                className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[12px] transition ${
                  selectedFolder === folder.name
                    ? "bg-[#eaf1ff] font-medium text-[#2869e8]"
                    : "text-[#66758e] hover:bg-white/80"
                }`}
              >
                <Folder size={15} strokeWidth={1.8} />
                <span className="min-w-0 flex-1 truncate">
                  {folder.name}
                </span>
                <span className="text-[10px] text-slate-400">
                  {folder.count}
                </span>
              </button>
            ))}
          </div>

          <div className="mt-auto rounded-[20px] border border-white bg-gradient-to-br from-[#eaf1ff] via-[#f5f8ff] to-white p-4 shadow-[0_8px_25px_rgba(50,90,170,0.06)]">
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-white text-[#2869e8] shadow-sm">
              <Sparkles size={19} />
            </div>
            <div className="text-[12px] font-semibold">AI Copilot</div>
            <p className="mt-2 text-[11px] leading-[1.7] text-slate-500">
              Ask, analyze and retrieve information with your AI assistant.
            </p>
            <button className="mt-4 flex items-center gap-2 text-[11px] font-semibold text-[#2869e8]">
              Open Copilot <ArrowRight size={13} />
            </button>
          </div>
        </aside>

        {/* MAIN AREA */}

        <main className="min-w-0 flex-1 px-5 pb-10 pt-6 2xl:px-8">

          {/* TOP BAR */}

          <header className="mb-9 flex min-h-[45px] items-center justify-between gap-5">
            <div className="flex items-center gap-2 xl:hidden">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#2869e8] text-white">
                <Sparkles size={18} />
              </div>
              <span className="text-sm font-bold">CRS LAB</span>
            </div>

            <div className="hidden flex-1 justify-center md:flex">
              <div className="flex h-11 w-full max-w-[470px] items-center gap-3 rounded-[15px] border border-white bg-white/75 px-4 shadow-[0_5px_20px_rgba(40,80,150,0.035)] backdrop-blur-xl">
                <Search size={17} className="text-slate-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search documents, folders, tags..."
                  className="min-w-0 flex-1 bg-transparent text-[12px] text-slate-700 outline-none placeholder:text-slate-400"
                />
                <div className="flex items-center gap-1 rounded-md border border-[#edf0f7] px-1.5 py-1 text-[10px] text-slate-400">
                  <Command size={11} /> K
                </div>
              </div>
            </div>

            <div className="ml-auto flex items-center gap-3">
              <button
                onClick={() => setShowNotifications(!showNotifications)}
                className="relative flex h-10 w-10 items-center justify-center rounded-[13px] border border-white bg-white/80 text-slate-500 shadow-sm"
              >
                <Bell size={18} />
                <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-red-400" />
              </button>

              <button className="flex h-10 w-10 items-center justify-center rounded-[13px] border border-white bg-white/80 text-slate-500 shadow-sm">
                <CircleHelp size={18} />
              </button>

              <button
                onClick={() => setShowUpload(!showUpload)}
                className="flex h-10 items-center gap-2 rounded-[13px] bg-gradient-to-r from-[#2869e8] to-[#5488ee] px-4 text-[12px] font-medium text-white shadow-[0_5px_14px_rgba(40,105,232,0.2)] transition hover:brightness-105"
              >
                <Plus size={16} />
                <span className="hidden sm:inline">Add Document</span>
                <ChevronDown size={14} className="ml-2 opacity-70" />
              </button>
            </div>
          </header>

          {showNotifications && (
            <div className="mb-4 rounded-xl border border-blue-100 bg-white p-4 text-xs text-slate-600">
              No new notifications. This is a visual prototype.
            </div>
          )}

          {showUpload && (
            <div className="mb-4 flex items-center gap-3 rounded-xl border border-blue-100 bg-white p-4 text-xs text-slate-600">
              <UploadCloud size={20} className="text-[#2869e8]" />
              Document upload will be connected to the existing CRS LAB functionality.
            </div>
          )}

          {/* TITLE */}

          <div className="mb-7">
            <div className="flex items-center gap-2">
              <h1 className="text-[25px] font-semibold tracking-[-0.9px] text-[#17233d]">
                Knowledge Base
              </h1>
              <CircleHelp size={14} className="text-slate-400" />
            </div>
            <p className="mt-1 text-[12px] text-[#8190a7]">
              Organize, manage and make your company knowledge accessible to AI agents.
            </p>
          </div>

          {/* DASHBOARD GRID */}

          <div className="grid grid-cols-1 gap-5 2xl:grid-cols-[minmax(0,1fr)_270px]">

            <div className="min-w-0 space-y-5">

              {/* METRICS */}

              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                {metrics.map((metric) => (
                  <MetricCard key={metric.label} metric={metric} />
                ))}
              </div>

              {/* DOCUMENT TABLE */}

              <section className="overflow-hidden rounded-[24px] border border-white/90 bg-white/85 shadow-[0_10px_40px_rgba(50,85,155,0.035)] backdrop-blur-xl">

                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#edf1f8] px-5 pt-5">
                  <div className="flex items-center gap-7">
                    {["All Content", "Folders", "Data Sources", "Tags"].map(
                      (tab) => (
                        <button
                          key={tab}
                          onClick={() => {
                            setActiveTab(tab);
                            setSelectedFolder(null);
                          }}
                          className={`relative pb-4 text-[12px] transition ${
                            activeTab === tab
                              ? "font-medium text-[#2869e8]"
                              : "text-slate-500 hover:text-slate-800"
                          }`}
                        >
                          {tab}
                          {activeTab === tab && (
                            <span className="absolute bottom-0 left-0 h-[2px] w-full rounded-full bg-[#2869e8]" />
                          )}
                        </button>
                      )
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                  <div className="flex items-center gap-2">
                    <select
                      value={type}
                      onChange={(e) => setType(e.target.value)}
                      className="h-9 rounded-[10px] border border-[#e9edf5] bg-white px-3 text-[11px] text-slate-600 outline-none"
                    >
                      <option value="all">All Types</option>
                      <option value="PDF">PDF</option>
                      <option value="DOCX">DOCX</option>
                      <option value="XLSX">XLSX</option>
                      <option value="PPTX">PPTX</option>
                      <option value="TXT">TXT</option>
                    </select>

                    <button className="flex h-9 items-center gap-2 rounded-[10px] border border-[#e9edf5] bg-white px-3 text-[11px] text-slate-600">
                      All Sources <ChevronDown size={13} />
                    </button>

                    <button className="flex h-9 items-center gap-2 rounded-[10px] border border-[#e9edf5] bg-white px-3 text-[11px] text-slate-600">
                      <SlidersHorizontal size={13} /> Filters
                    </button>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex h-9 items-center rounded-[10px] border border-[#e9edf5] bg-white p-1">
                      <button
                        onClick={() => setView("list")}
                        className={`flex h-7 w-7 items-center justify-center rounded-md ${
                          view === "list"
                            ? "bg-[#edf3ff] text-[#2869e8]"
                            : "text-slate-400"
                        }`}
                      >
                        <List size={15} />
                      </button>
                      <button
                        onClick={() => setView("grid")}
                        className={`flex h-7 w-7 items-center justify-center rounded-md ${
                          view === "grid"
                            ? "bg-[#edf3ff] text-[#2869e8]"
                            : "text-slate-400"
                        }`}
                      >
                        <Grid2X2 size={14} />
                      </button>
                    </div>

                    <select
                      value={sort}
                      onChange={(e) => setSort(e.target.value)}
                      className="h-9 rounded-[10px] border border-[#e9edf5] bg-white px-3 text-[11px] text-slate-600 outline-none"
                    >
                      <option value="recent">Recently Updated</option>
                      <option value="popular">Most Accessed</option>
                      <option value="name">Name A-Z</option>
                    </select>
                  </div>
                </div>

                {view === "list" ? (
                  <div className="overflow-x-auto px-4">
                    <table className="w-full min-w-[650px] border-collapse text-left">
                      <thead>
                        <tr className="bg-[#f7f9ff] text-[10px] font-medium text-[#8490a5]">
                          <th className="rounded-l-lg px-3 py-3 font-medium">Name</th>
                          <th className="px-3 py-3 font-medium">Type</th>
                          <th className="px-3 py-3 font-medium">Source</th>
                          <th className="px-3 py-3 font-medium">AI Usage</th>
                          <th className="px-3 py-3 font-medium">Last Updated</th>
                          <th className="rounded-r-lg px-3 py-3" />
                        </tr>
                      </thead>

                      <tbody>
                        {filteredDocuments.map((doc) => {
                          const Icon = doc.icon;

                          return (
                            <tr
                              key={doc.name}
                              className="group border-b border-[#f0f2f8] transition hover:bg-[#f8faff]"
                            >
                              <td className="px-3 py-3">
                                <div className="flex items-center gap-3">
                                  <div
                                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]"
                                    style={{
                                      background: doc.bg,
                                      color: doc.color,
                                    }}
                                  >
                                    <Icon size={18} strokeWidth={1.8} />
                                  </div>
                                  <div className="min-w-0">
                                    <div className="max-w-[220px] truncate text-[11px] font-medium text-[#26334b]">
                                      {doc.name}
                                    </div>
                                    <div className="mt-1 text-[10px] text-slate-400">
                                      {doc.folder}
                                    </div>
                                  </div>
                                </div>
                              </td>

                              <td className="px-3 py-3">
                                <span
                                  className="rounded-md px-2 py-1 text-[10px] font-medium"
                                  style={{
                                    background: doc.bg,
                                    color: doc.color,
                                  }}
                                >
                                  {doc.type}
                                </span>
                              </td>

                              <td className="px-3 py-3">
                                <div className="flex items-center gap-2 whitespace-nowrap text-[11px] text-slate-600">
                                  <span
                                    className="h-1.5 w-1.5 rounded-full"
                                    style={{ background: doc.color }}
                                  />
                                  {doc.source}
                                </div>
                              </td>

                              <td className="px-3 py-3">
                                <div className="flex items-center gap-4">
                                  <span className="w-7 text-[11px] text-slate-700">
                                    {doc.usage}
                                  </span>
                                  <div className="flex h-5 items-end gap-[3px]">
                                    {doc.bars.map((height, index) => (
                                      <span
                                        key={index}
                                        className="w-[3px] rounded-t-sm bg-[#3779e9]"
                                        style={{ height }}
                                      />
                                    ))}
                                  </div>
                                </div>
                              </td>

                              <td className="px-3 py-3">
                                <div className="whitespace-nowrap text-[11px] text-slate-600">
                                  {doc.date}
                                </div>
                                <div className="mt-1 text-[10px] text-slate-400">
                                  {doc.author}
                                </div>
                              </td>

                              <td className="px-2 py-3">
                                <button className="text-slate-400 hover:text-[#2869e8]">
                                  <MoreHorizontal size={17} />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-3 px-5 pb-5 sm:grid-cols-2 lg:grid-cols-3">
                    {filteredDocuments.map((doc) => {
                      const Icon = doc.icon;

                      return (
                        <div
                          key={doc.name}
                          className="rounded-xl border border-[#edf1f8] bg-white p-4 transition hover:border-[#cbdcff] hover:shadow-sm"
                        >
                          <div
                            className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl"
                            style={{
                              background: doc.bg,
                              color: doc.color,
                            }}
                          >
                            <Icon size={20} />
                          </div>
                          <div className="truncate text-xs font-medium">
                            {doc.name}
                          </div>
                          <div className="mt-2 text-[11px] text-slate-400">
                            {doc.folder}
                          </div>
                          <div className="mt-4 flex justify-between text-[10px] text-slate-400">
                            <span>{doc.type}</span>
                            <span>{doc.usage} AI uses</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {filteredDocuments.length === 0 && (
                  <div className="py-16 text-center text-xs text-slate-400">
                    No documents found.
                  </div>
                )}

                <div className="flex items-center justify-between gap-3 px-5 py-5">
                  <span className="text-[10px] text-slate-400">
                    Showing {filteredDocuments.length} of 1,248 results
                  </span>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setPage(Math.max(1, page - 1))}
                      className="flex h-7 w-7 items-center justify-center text-slate-400"
                    >
                      <ChevronLeft size={15} />
                    </button>

                    {[1, 2, 3].map((number) => (
                      <button
                        key={number}
                        onClick={() => setPage(number)}
                        className={`flex h-7 w-7 items-center justify-center rounded-md text-[10px] ${
                          page === number
                            ? "border border-[#dce7ff] bg-[#edf3ff] text-[#2869e8]"
                            : "text-slate-500"
                        }`}
                      >
                        {number}
                      </button>
                    ))}

                    <span className="px-1 text-xs text-slate-400">...</span>

                    <button
                      onClick={() => setPage(page + 1)}
                      className="flex h-7 w-7 items-center justify-center text-slate-400"
                    >
                      <ChevronRight size={15} />
                    </button>
                  </div>
                </div>
              </section>
            </div>

            {/* RIGHT SIDEBAR */}

            <aside className="space-y-5">

              {/* KNOWLEDGE HEALTH */}

              <div className="rounded-[22px] border border-white bg-white/85 p-5 shadow-[0_8px_35px_rgba(50,85,155,0.035)] backdrop-blur-xl">
                <h3 className="text-[12px] font-semibold">
                  Knowledge Health
                </h3>

                <div className="mt-6 flex items-center gap-4">
                  <div
                    className="relative flex h-[104px] w-[104px] shrink-0 items-center justify-center rounded-full"
                    style={{
                      background:
                        "conic-gradient(#43bf8b 0deg 331deg,#f3b34b 331deg 353deg,#ef6874 353deg 360deg)",
                    }}
                  >
                    <div className="flex h-[88px] w-[88px] flex-col items-center justify-center rounded-full bg-white">
                      <span className="text-[23px] font-semibold tracking-[-1px]">
                        92%
                      </span>
                      <span className="text-[10px] text-slate-400">
                        Healthy
                      </span>
                    </div>
                  </div>

                  <div className="min-w-0 flex-1 space-y-3">
                    {[
                      { label: "Healthy", value: "92%", color: "#43bf8b" },
                      { label: "Needs Review", value: "6%", color: "#f3b34b" },
                      { label: "Outdated", value: "2%", color: "#ef6874" },
                    ].map((item) => (
                      <div
                        key={item.label}
                        className="flex items-center gap-2 text-[10px]"
                      >
                        <span
                          className="h-1.5 w-1.5 shrink-0 rounded-full"
                          style={{ background: item.color }}
                        />
                        <span className="flex-1 whitespace-nowrap text-slate-500">
                          {item.label}
                        </span>
                        <span className="font-medium">{item.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* TOP ACCESSED */}

              <div className="rounded-[22px] border border-white bg-white/85 p-5 shadow-[0_8px_35px_rgba(50,85,155,0.035)] backdrop-blur-xl">
                <div className="mb-5 flex items-center justify-between">
                  <h3 className="text-[12px] font-semibold">Top Accessed</h3>
                  <button
                    onClick={() => setSort("popular")}
                    className="text-[10px] font-medium text-[#2869e8]"
                  >
                    View All
                  </button>
                </div>

                <div className="space-y-5">
                  {documents.slice(0, 5).map((doc) => {
                    const Icon = doc.icon;

                    return (
                      <div key={doc.name} className="flex items-center gap-3">
                        <div
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                          style={{
                            background: doc.bg,
                            color: doc.color,
                          }}
                        >
                          <Icon size={16} />
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-[10px] font-medium">
                            {doc.name}
                          </div>
                          <div className="mt-1 text-[10px] text-slate-400">
                            {doc.usage} views
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* RECENT ACTIVITY */}

              <div className="rounded-[22px] border border-white bg-white/85 p-5 shadow-[0_8px_35px_rgba(50,85,155,0.035)] backdrop-blur-xl">
                <div className="mb-5 flex items-center justify-between">
                  <h3 className="text-[12px] font-semibold">Recent Activity</h3>
                  <button className="text-[10px] font-medium text-[#2869e8]">
                    View All
                  </button>
                </div>

                <div className="space-y-5">
                  {documents.slice(0, 5).map((doc, index) => {
                    const Icon = doc.icon;

                    return (
                      <div key={doc.name} className="flex items-start gap-3">
                        <div
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                          style={{
                            background: doc.bg,
                            color: doc.color,
                          }}
                        >
                          <Icon size={15} />
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[10px] font-medium">
                            {doc.name}
                          </div>
                          <div className="mt-1 text-[10px] text-slate-400">
                            {index % 2 === 0
                              ? "Updated by AI Agent"
                              : "Indexed successfully"}
                          </div>
                        </div>

                        <span className="whitespace-nowrap text-[9px] text-slate-400">
                          {10 - index}:42
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* AI INSIGHT */}

              <div className="rounded-[22px] border border-[#dfe9ff] bg-gradient-to-br from-[#e9f0ff] via-[#f4f7ff] to-white p-5 shadow-[0_8px_35px_rgba(50,85,155,0.035)]">
                <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-white text-[#2869e8] shadow-sm">
                  <Sparkles size={18} />
                </div>
                <h3 className="text-[12px] font-semibold">
                  AI Knowledge Insights
                </h3>
                <p className="mt-2 text-[11px] leading-[1.7] text-slate-500">
                  Discover opportunities to improve your company's knowledge.
                </p>
                <button className="mt-4 flex items-center gap-2 text-[11px] font-medium text-[#2869e8]">
                  Explore Insights <ArrowRight size={13} />
                </button>
              </div>
            </aside>
          </div>
        </main>
      </div>
    </div>
  );
}