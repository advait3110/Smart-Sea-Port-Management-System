import React from "react";

// =========================================================
// PORT OPERATIONS
// =========================================================

import MainDashboard from "views/admin/default";
import PortMap from "views/admin/PortMap";
import Weather from "views/admin/Weather";
import VesselManagement from "views/admin/Vessels";
import Berths from "views/admin/Berths";
import CargoOperations from "views/admin/CargoOperations";
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

// One page for all four ML predictions, as tabs: Predict Vessel
// Delay (built), Berth Congestion, Cargo Throughput and Equipment
// Failure (not built yet; the page says so).
import DelayPrediction from "views/admin/DelayPrediction";

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
  MdSchedule,

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
//
// IMPORTANT:
// `moduleKey` is the authoritative backend RBAC module.
// Both the sidebar and the admin route guard check it
// first, so a route WITHOUT a moduleKey is visible to every
// logged-in user. Every real module route must have one.
//
// These values MUST match PostgreSQL permission keys:
//
// dashboard
// port_map
// weather
// vessels
// berths
// cargo
// gate_trucks
// port_communication
// notifications
// port_alerts
// incidents
// asset_maintenance
// analytics
// documents
// audit_logs
// user_role_management
//
// The Delay Prediction page (the four ML predictions as tabs)
// belongs to Intelligence & Analytics and uses the existing
// `analytics` module key. Whoever may open Port Analytics may
// open it. A separate key would first have to be added to the
// backend and to the PostgreSQL permission table.
//
// `permission` is a LEGACY granular key. It is only used by
// the admin layout when a route has no `moduleKey`. Every
// route below has a moduleKey, so it is currently unused.
// It is kept for compatibility.
//
// Frontend route checks only control the UI. The FastAPI
// backend must enforce authorization on every endpoint.
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

        moduleKey: "dashboard",
        permission: "dashboard.view",
      },

      {
        name: "Live Port Map",
        layout: "/admin",
        path: "port-map",
        icon: <MdMap className="h-6 w-6" />,
        component: <PortMap />,

        moduleKey: "port_map",
        permission: "port_map.view",
      },

      {
        name: "Weather & Marine Conditions",
        layout: "/admin",
        path: "weather",
        icon: <MdCloud className="h-6 w-6" />,
        component: <Weather />,

        moduleKey: "weather",
        permission: "weather.view",
      },

      {
        name: "Vessel Management",
        layout: "/admin",
        path: "vessels",
        icon: <MdDirectionsBoat className="h-6 w-6" />,
        component: <VesselManagement />,

        moduleKey: "vessels",
        permission: "vessel.view",
      },

      {
        name: "Berth Management",
        layout: "/admin",
        path: "berths",
        icon: <MdAnchor className="h-6 w-6" />,
        component: <Berths />,

        moduleKey: "berths",
        permission: "berth.view",
      },

      {
        name: "Cargo Operations",
        layout: "/admin",
        path: "cargo",
        icon: <MdInventory className="h-6 w-6" />,
        component: <CargoOperations />,

        moduleKey: "cargo",
        permission: "cargo.view",
      },

      {
        name: "Gate & Truck Management",
        layout: "/admin",
        path: "gate-management",
        icon: <MdLocalShipping className="h-6 w-6" />,
        component: <GateManagement />,

        moduleKey: "gate_trucks",
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

        moduleKey: "port_communication",
        permission: "communication.view",
      },

      {
        name: "Notifications",
        layout: "/admin",
        path: "notifications",
        icon: <MdNotifications className="h-6 w-6" />,
        component: <Notifications />,

        moduleKey: "notifications",
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

        moduleKey: "port_alerts",
        permission: "alerts.view",
      },

      {
        name: "Incident Management",
        layout: "/admin",
        path: "incidents",
        icon: <MdReportProblem className="h-6 w-6" />,
        component: <IncidentManagement />,

        moduleKey: "incidents",
        permission: "incident.view",
      },

      {
        name: "Asset & Maintenance",
        layout: "/admin",
        path: "maintenance",
        icon: <MdBuild className="h-6 w-6" />,
        component: <AssetMaintenance />,

        moduleKey: "asset_maintenance",
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

        moduleKey: "analytics",
        permission: "analytics.view",
      },

      // ---------------------------------------------------
      // ML PREDICTIONS (all four, as tabs on one page)
      // ---------------------------------------------------

      {
        name: "Delay Prediction",
        layout: "/admin",
        path: "delay-prediction",
        icon: <MdSchedule className="h-6 w-6" />,
        component: <DelayPrediction />,

        moduleKey: "analytics",
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

        moduleKey: "documents",
        permission: "document.view",
      },

      {
        name: "Audit Logs",
        layout: "/admin",
        path: "audit-logs",
        icon: <MdHistory className="h-6 w-6" />,
        component: <AuditLogs />,

        moduleKey: "audit_logs",
        permission: "audit.view",
      },

      {
        name: "User & Role Management",
        layout: "/admin",
        path: "users",
        icon: <MdPeople className="h-6 w-6" />,
        component: <UserManagement />,

        moduleKey: "user_role_management",
        permission: "users.view",
      },
    ],
  },
];

// =========================================================
// EXPORT
// =========================================================

export default routes;