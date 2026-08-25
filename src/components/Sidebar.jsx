import { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutGrid,
  FileSpreadsheet,
  FilePlus2,
  FileStack,
  ClipboardList,
  CalendarRange,
  ChevronDown,
} from "lucide-react";
import "./Sidebar.css";

const REPORT_PATHS = ["/abs", "/reports/po-wise", "/reports/date-wise"];

export default function Sidebar() {
  const location = useLocation();
  const reportsActiveByRoute = REPORT_PATHS.some((p) =>
    location.pathname.startsWith(p)
  );
  const [reportsOpen, setReportsOpen] = useState(reportsActiveByRoute);

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-brand">
          <svg width="22" height="22" viewBox="0 0 32 32" className="sidebar-brand-icon">
            <path d="M4 8H28V12H18V20H28V24H4V20H14V12H4Z" fill="currentColor" />
          </svg>
          <span className="sidebar-title">SIEC LEDGER</span>
        </div>
        <div className="sidebar-subtitle">PO &amp; Billing System</div>
      </div>

      <nav className="sidebar-nav">
        <NavLink
          to="/"
          end
          className={({ isActive }) => `sidebar-link${isActive ? " active" : ""}`}
        >
          <LayoutGrid size={17} />
          PO Sheets
        </NavLink>
        <NavLink
          to="/po/new"
          className={({ isActive }) => `sidebar-link${isActive ? " active" : ""}`}
        >
          <FilePlus2 size={17} />
          PO Creation
        </NavLink>
        <button
          type="button"
          className={`sidebar-link sidebar-link-toggle${
            reportsActiveByRoute ? " active" : ""
          }`}
          onClick={() => setReportsOpen((open) => !open)}
          aria-expanded={reportsOpen}
        >
          <FileSpreadsheet size={17} />
          Reports
          <ChevronDown
            size={15}
            className={`sidebar-chevron${reportsOpen ? " open" : ""}`}
          />
        </button>

        {reportsOpen && (
          <div className="sidebar-submenu">
            <NavLink
              to="/abs"
              className={({ isActive }) =>
                `sidebar-link sidebar-sublink${isActive ? " active" : ""}`
              }
            >
              <ClipboardList size={15} />
              ABS Report
            </NavLink>
            <NavLink
              to="/reports/date-wise"
              className={({ isActive }) =>
                `sidebar-link sidebar-sublink${isActive ? " active" : ""}`
              }
            >
              <CalendarRange size={15} />
              Date Wise Report
            </NavLink>
            <NavLink
              to="/reports/po-wise"
              className={({ isActive }) =>
                `sidebar-link sidebar-sublink${isActive ? " active" : ""}`
              }
            >
              <FileStack size={15} />
              PO Wise Report
            </NavLink>
          </div>
        )}
      </nav>
    </aside>
  );
}