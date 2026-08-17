import { NavLink } from "react-router-dom";
import { LayoutGrid, FileSpreadsheet, FilePlus2 } from "lucide-react";
import "./Sidebar.css";

export default function Sidebar() {
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
        <NavLink
          to="/abs"
          className={({ isActive }) => `sidebar-link${isActive ? " active" : ""}`}
        >
          <FileSpreadsheet size={17} />
          ABS Report
        </NavLink>
      </nav>
    </aside>
  );
}