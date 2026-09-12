import React from "react";

// =========================================================
// PORT OPERATIONS
// =========================================================

import MainDashboard from "views/admin/default";
import PortMap from "views/admin/PortMap";
import Weather from "views/admin/Weather";
import VesselManagement from "views/admin/Vessels";
import Berths from "views/admin/Berths";
import CargoOperations from "views/admin/Cargo";
import GateManagement from "views/admin/Gate";

// =========================================================
// COMMUNICATION
// =========================================================

import Notifications from "views/admin/Notification";
import PortCommunication from "views/admin/PortCommunication";

// =========================================================
// CONTROL & SAFETY
// =========================================================

import PortAlerts from "views/admin/Alerts";
import IncidentManagement from "views/admin/Incidents";
import AssetMaintenance from "views/admin/AssetMaintenance";

// =========================================================
// INTELLIGENCE & ANALYTICS
// =========================================================

import Analytics from "views/admin/Analytics";

// =========================================================
// ADMINISTRATION
// =========================================================

import DocumentManagement from "views/admin/DocumentManagement";
import AuditLogs from "views/admin/AuditLogs";
import UserManagement from "views/admin/User & Role management";

// =========================================================
// ICONS
// =========================================================

import {
  // Port Operations
  MdDashboard,
  MdMap,
  MdCloud,
  MdDirectionsBoat,
  MdAnchor,
  MdInventory,
  MdLocalShipping,

  // Communication
  MdForum,
  MdNotifications,

  // Control & Safety
  MdWarning,
  MdReportProblem,
  MdBuild,

  // Intelligence & Analytics
  MdAnalytics,

  // Administration
  MdDescription,
  MdHistory,
  MdPeople,

  // Section Icons
  MdBusiness,
  MdChat,
  MdSecurity,
  MdPsychology,
  MdAdminPanelSettings,
} from "react-icons/md";

// =========================================================
// ROUTES
// =========================================================

const routes = [
  // =======================================================
  // 1. PORT OPERATIONS
  // =======================================================

  {
    type: "section",
    name: "PORT OPERATIONS",
    icon: <MdBusiness className="h-5 w-5" />,

    children: [
      {
        name: "Port Dashboard",
        layout: "/admin",
        path: "default",
        icon: <MdDashboard className="h-6 w-6" />,
        component: <MainDashboard />,
        permission: "dashboard.view",
      },

      {
        name: "Live Port Map",
        layout: "/admin",
        path: "port-map",
        icon: <MdMap className="h-6 w-6" />,
        component: <PortMap />,
        permission: "port_map.view",
      },

      {
        name: "Weather & Marine Conditions",
        layout: "/admin",
        path: "weather",
        icon: <MdCloud className="h-6 w-6" />,
        component: <Weather />,
        permission: "weather.view",
      },

      {
        name: "Vessel Management",
        layout: "/admin",
        path: "vessels",
        icon: <MdDirectionsBoat className="h-6 w-6" />,
        component: <VesselManagement />,
        permission: "vessel.view",
      },

      {
        name: "Berth Management",
        layout: "/admin",
        path: "berths",
        icon: <MdAnchor className="h-6 w-6" />,
        component: <Berths />,
        permission: "berth.view",
      },

      {
        name: "Cargo Operations",
        layout: "/admin",
        path: "cargo",
        icon: <MdInventory className="h-6 w-6" />,
        component: <CargoOperations />,
        permission: "cargo.view",
      },

      {
        name: "Gate & Truck Management",
        layout: "/admin",
        path: "gate-management",
        icon: <MdLocalShipping className="h-6 w-6" />,
        component: <GateManagement />,
        permission: "gate.view",
      },
    ],
  },

  // =======================================================
  // 2. COMMUNICATION
  // =======================================================

  {
    type: "section",
    name: "COMMUNICATION",
    icon: <MdChat className="h-5 w-5" />,

    children: [
      {
        name: "Port Communication",
        layout: "/admin",
        path: "communication",
        icon: <MdForum className="h-6 w-6" />,
        component: <PortCommunication />,
        permission: "communication.view",
      },

      {
        name: "Notifications",
        layout: "/admin",
        path: "notifications",
        icon: <MdNotifications className="h-6 w-6" />,
        component: <Notifications />,
        permission: "notifications.view",
      },
    ],
  },

  // =======================================================
  // 3. CONTROL & SAFETY
  // =======================================================

  {
    type: "section",
    name: "CONTROL & SAFETY",
    icon: <MdSecurity className="h-5 w-5" />,

    children: [
      {
        name: "Port Alerts",
        layout: "/admin",
        path: "alerts",
        icon: <MdWarning className="h-6 w-6" />,
        component: <PortAlerts />,
        permission: "alerts.view",
      },

      {
        name: "Incident Management",
        layout: "/admin",
        path: "incidents",
        icon: <MdReportProblem className="h-6 w-6" />,
        component: <IncidentManagement />,
        permission: "incident.view",
      },

      {
        name: "Asset & Maintenance",
        layout: "/admin",
        path: "maintenance",
        icon: <MdBuild className="h-6 w-6" />,
        component: <AssetMaintenance />,
        permission: "maintenance.view",
      },
    ],
  },

  // =======================================================
  // 4. INTELLIGENCE & ANALYTICS
  // =======================================================

  {
    type: "section",
    name: "INTELLIGENCE & ANALYTICS",
    icon: <MdPsychology className="h-5 w-5" />,

    children: [
      {
        name: "Port Analytics",
        layout: "/admin",
        path: "analytics",
        icon: <MdAnalytics className="h-6 w-6" />,
        component: <Analytics />,
        permission: "analytics.view",
      },
    ],
  },

  // =======================================================
  // 5. ADMINISTRATION
  // =======================================================

  {
    type: "section",
    name: "ADMINISTRATION",
    icon: <MdAdminPanelSettings className="h-5 w-5" />,

    children: [
      {
        name: "Document Management",
        layout: "/admin",
        path: "documents",
        icon: <MdDescription className="h-6 w-6" />,
        component: <DocumentManagement />,
        permission: "document.view",
      },

      {
        name: "Audit Logs",
        layout: "/admin",
        path: "audit-logs",
        icon: <MdHistory className="h-6 w-6" />,
        component: <AuditLogs />,
        permission: "audit.view",
      },

      {
        name: "User & Role Management",
        layout: "/admin",
        path: "users",
        icon: <MdPeople className="h-6 w-6" />,
        component: <UserManagement />,
        permission: "users.view",
      },
    ],
  },
];

// =========================================================
// EXPORT
// =========================================================

export default routes;