// =========================================================
// KARWAR PORT
// ROLE-BASED ACCESS CONTROL (RBAC)
// =========================================================
//
// This file defines the permissions available in the
// Karwar Port Smart Sea Port Management System.
//
// IMPORTANT:
// - Users are stored separately in users.js.
// - Roles determine which permissions a user receives.
// - Permissions determine what the user can VIEW, CREATE,
//   EDIT, DELETE, APPROVE or MANAGE.
//
// DEVELOPMENT:
//   Permissions are defined locally for the frontend.
//
// PRODUCTION:
//   These permissions should eventually be stored in
//   PostgreSQL and managed through FastAPI.
//
// =========================================================


// =========================================================
// PERMISSION DEFINITIONS
// =========================================================
//
// Naming convention:
//
// module.action
//
// Examples:
// vessel.view
// vessel.create
// vessel.edit
// vessel.delete
//
// =========================================================

export const PERMISSIONS = {

  // -------------------------------------------------------
  // PORT DASHBOARD
  // -------------------------------------------------------

  DASHBOARD_VIEW: "dashboard.view",


  // -------------------------------------------------------
  // LIVE PORT MAP
  // -------------------------------------------------------

  PORT_MAP_VIEW: "port_map.view",
  PORT_MAP_MANAGE: "port_map.manage",


  // -------------------------------------------------------
  // WEATHER & MARINE CONDITIONS
  // -------------------------------------------------------

  WEATHER_VIEW: "weather.view",
  WEATHER_MANAGE: "weather.manage",


  // -------------------------------------------------------
  // VESSEL MANAGEMENT
  // -------------------------------------------------------

  VESSEL_VIEW: "vessel.view",
  VESSEL_CREATE: "vessel.create",
  VESSEL_EDIT: "vessel.edit",
  VESSEL_DELETE: "vessel.delete",
  VESSEL_APPROVE: "vessel.approve",


  // -------------------------------------------------------
  // BERTH MANAGEMENT
  // -------------------------------------------------------

  BERTH_VIEW: "berth.view",
  BERTH_CREATE: "berth.create",
  BERTH_EDIT: "berth.edit",
  BERTH_DELETE: "berth.delete",
  BERTH_ALLOCATE: "berth.allocate",


  // -------------------------------------------------------
  // CARGO OPERATIONS
  // -------------------------------------------------------

  CARGO_VIEW: "cargo.view",
  CARGO_CREATE: "cargo.create",
  CARGO_EDIT: "cargo.edit",
  CARGO_DELETE: "cargo.delete",
  CARGO_APPROVE: "cargo.approve",


  // -------------------------------------------------------
  // GATE & TRUCK MANAGEMENT
  // -------------------------------------------------------

  GATE_VIEW: "gate.view",
  GATE_CREATE: "gate.create",
  GATE_EDIT: "gate.edit",
  GATE_DELETE: "gate.delete",
  GATE_APPROVE: "gate.approve",


  // -------------------------------------------------------
  // PORT COMMUNICATION
  // -------------------------------------------------------

  COMMUNICATION_VIEW: "communication.view",
  COMMUNICATION_SEND: "communication.send",
  COMMUNICATION_MANAGE: "communication.manage",


  // -------------------------------------------------------
  // NOTIFICATIONS
  // -------------------------------------------------------

  NOTIFICATIONS_VIEW: "notifications.view",
  NOTIFICATIONS_MANAGE: "notifications.manage",


  // -------------------------------------------------------
  // PORT ALERTS
  // -------------------------------------------------------

  ALERTS_VIEW: "alerts.view",
  ALERTS_CREATE: "alerts.create",
  ALERTS_EDIT: "alerts.edit",
  ALERTS_DELETE: "alerts.delete",
  ALERTS_ACKNOWLEDGE: "alerts.acknowledge",


  // -------------------------------------------------------
  // INCIDENT MANAGEMENT
  // -------------------------------------------------------

  INCIDENT_VIEW: "incident.view",
  INCIDENT_CREATE: "incident.create",
  INCIDENT_EDIT: "incident.edit",
  INCIDENT_DELETE: "incident.delete",
  INCIDENT_ASSIGN: "incident.assign",
  INCIDENT_CLOSE: "incident.close",


  // -------------------------------------------------------
  // ASSET & MAINTENANCE
  // -------------------------------------------------------

  MAINTENANCE_VIEW: "maintenance.view",
  MAINTENANCE_CREATE: "maintenance.create",
  MAINTENANCE_EDIT: "maintenance.edit",
  MAINTENANCE_DELETE: "maintenance.delete",
  MAINTENANCE_ASSIGN: "maintenance.assign",
  MAINTENANCE_APPROVE: "maintenance.approve",


  // -------------------------------------------------------
  // PORT ANALYTICS
  // -------------------------------------------------------

  ANALYTICS_VIEW: "analytics.view",
  ANALYTICS_EXPORT: "analytics.export",
  ANALYTICS_MANAGE: "analytics.manage",


  // -------------------------------------------------------
  // DOCUMENT MANAGEMENT
  // -------------------------------------------------------

  DOCUMENT_VIEW: "document.view",
  DOCUMENT_UPLOAD: "document.upload",
  DOCUMENT_EDIT: "document.edit",
  DOCUMENT_DELETE: "document.delete",
  DOCUMENT_APPROVE: "document.approve",
  DOCUMENT_DOWNLOAD: "document.download",


  // -------------------------------------------------------
  // AUDIT LOGS
  // -------------------------------------------------------

  AUDIT_VIEW: "audit.view",
  AUDIT_EXPORT: "audit.export",
  AUDIT_MANAGE: "audit.manage",


  // -------------------------------------------------------
  // USER & ROLE MANAGEMENT
  // -------------------------------------------------------

  USERS_VIEW: "users.view",
  USERS_CREATE: "users.create",
  USERS_EDIT: "users.edit",
  USERS_DELETE: "users.delete",
  USERS_ENABLE: "users.enable",
  USERS_DISABLE: "users.disable",
  USERS_ASSIGN_ROLE: "users.assign_role",

  ROLES_VIEW: "roles.view",
  ROLES_CREATE: "roles.create",
  ROLES_EDIT: "roles.edit",
  ROLES_DELETE: "roles.delete",
  ROLES_ASSIGN_PERMISSIONS: "roles.assign_permissions",

};


// =========================================================
// ROLE PERMISSIONS
// =========================================================
//
// Each role receives a specific set of permissions.
//
// IMPORTANT:
// Do NOT give every role every permission.
//
// This is the foundation of RBAC.
//
// =========================================================


export const ROLE_PERMISSIONS = {

  // =======================================================
  // PORT ADMINISTRATOR
  // =======================================================
  //
  // Highest administrative access.
  //
  // Responsible for system administration, users, roles,
  // security, audit and operational oversight.
  // =======================================================

  "Port Administrator": [

    // Dashboard
    PERMISSIONS.DASHBOARD_VIEW,

    // Port Map
    PERMISSIONS.PORT_MAP_VIEW,
    PERMISSIONS.PORT_MAP_MANAGE,

    // Weather
    PERMISSIONS.WEATHER_VIEW,
    PERMISSIONS.WEATHER_MANAGE,

    // Vessels
    PERMISSIONS.VESSEL_VIEW,
    PERMISSIONS.VESSEL_CREATE,
    PERMISSIONS.VESSEL_EDIT,
    PERMISSIONS.VESSEL_DELETE,
    PERMISSIONS.VESSEL_APPROVE,

    // Berths
    PERMISSIONS.BERTH_VIEW,
    PERMISSIONS.BERTH_CREATE,
    PERMISSIONS.BERTH_EDIT,
    PERMISSIONS.BERTH_DELETE,
    PERMISSIONS.BERTH_ALLOCATE,

    // Cargo
    PERMISSIONS.CARGO_VIEW,
    PERMISSIONS.CARGO_CREATE,
    PERMISSIONS.CARGO_EDIT,
    PERMISSIONS.CARGO_DELETE,
    PERMISSIONS.CARGO_APPROVE,

    // Gate
    PERMISSIONS.GATE_VIEW,
    PERMISSIONS.GATE_CREATE,
    PERMISSIONS.GATE_EDIT,
    PERMISSIONS.GATE_DELETE,
    PERMISSIONS.GATE_APPROVE,

    // Communication
    PERMISSIONS.COMMUNICATION_VIEW,
    PERMISSIONS.COMMUNICATION_SEND,
    PERMISSIONS.COMMUNICATION_MANAGE,

    // Notifications
    PERMISSIONS.NOTIFICATIONS_VIEW,
    PERMISSIONS.NOTIFICATIONS_MANAGE,

    // Alerts
    PERMISSIONS.ALERTS_VIEW,
    PERMISSIONS.ALERTS_CREATE,
    PERMISSIONS.ALERTS_EDIT,
    PERMISSIONS.ALERTS_DELETE,
    PERMISSIONS.ALERTS_ACKNOWLEDGE,

    // Incidents
    PERMISSIONS.INCIDENT_VIEW,
    PERMISSIONS.INCIDENT_CREATE,
    PERMISSIONS.INCIDENT_EDIT,
    PERMISSIONS.INCIDENT_DELETE,
    PERMISSIONS.INCIDENT_ASSIGN,
    PERMISSIONS.INCIDENT_CLOSE,

    // Maintenance
    PERMISSIONS.MAINTENANCE_VIEW,
    PERMISSIONS.MAINTENANCE_CREATE,
    PERMISSIONS.MAINTENANCE_EDIT,
    PERMISSIONS.MAINTENANCE_DELETE,
    PERMISSIONS.MAINTENANCE_ASSIGN,
    PERMISSIONS.MAINTENANCE_APPROVE,

    // Analytics
    PERMISSIONS.ANALYTICS_VIEW,
    PERMISSIONS.ANALYTICS_EXPORT,
    PERMISSIONS.ANALYTICS_MANAGE,

    // Documents
    PERMISSIONS.DOCUMENT_VIEW,
    PERMISSIONS.DOCUMENT_UPLOAD,
    PERMISSIONS.DOCUMENT_EDIT,
    PERMISSIONS.DOCUMENT_DELETE,
    PERMISSIONS.DOCUMENT_APPROVE,
    PERMISSIONS.DOCUMENT_DOWNLOAD,

    // Audit
    PERMISSIONS.AUDIT_VIEW,
    PERMISSIONS.AUDIT_EXPORT,
    PERMISSIONS.AUDIT_MANAGE,

    // Users
    PERMISSIONS.USERS_VIEW,
    PERMISSIONS.USERS_CREATE,
    PERMISSIONS.USERS_EDIT,
    PERMISSIONS.USERS_DELETE,
    PERMISSIONS.USERS_ENABLE,
    PERMISSIONS.USERS_DISABLE,
    PERMISSIONS.USERS_ASSIGN_ROLE,

    // Roles
    PERMISSIONS.ROLES_VIEW,
    PERMISSIONS.ROLES_CREATE,
    PERMISSIONS.ROLES_EDIT,
    PERMISSIONS.ROLES_DELETE,
    PERMISSIONS.ROLES_ASSIGN_PERMISSIONS,

  ],


  // =======================================================
  // PORT MANAGER
  // =======================================================

  "Port Manager": [

    PERMISSIONS.DASHBOARD_VIEW,

    PERMISSIONS.PORT_MAP_VIEW,

    PERMISSIONS.WEATHER_VIEW,

    // Vessels
    PERMISSIONS.VESSEL_VIEW,
    PERMISSIONS.VESSEL_CREATE,
    PERMISSIONS.VESSEL_EDIT,
    PERMISSIONS.VESSEL_APPROVE,

    // Berths
    PERMISSIONS.BERTH_VIEW,
    PERMISSIONS.BERTH_CREATE,
    PERMISSIONS.BERTH_EDIT,
    PERMISSIONS.BERTH_ALLOCATE,

    // Cargo
    PERMISSIONS.CARGO_VIEW,
    PERMISSIONS.CARGO_CREATE,
    PERMISSIONS.CARGO_EDIT,
    PERMISSIONS.CARGO_APPROVE,

    // Gate
    PERMISSIONS.GATE_VIEW,

    // Communication
    PERMISSIONS.COMMUNICATION_VIEW,
    PERMISSIONS.COMMUNICATION_SEND,

    PERMISSIONS.NOTIFICATIONS_VIEW,

    // Safety
    PERMISSIONS.ALERTS_VIEW,
    PERMISSIONS.ALERTS_ACKNOWLEDGE,

    PERMISSIONS.INCIDENT_VIEW,
    PERMISSIONS.INCIDENT_CREATE,
    PERMISSIONS.INCIDENT_EDIT,
    PERMISSIONS.INCIDENT_ASSIGN,
    PERMISSIONS.INCIDENT_CLOSE,

    // Maintenance - oversight
    PERMISSIONS.MAINTENANCE_VIEW,

    // Analytics
    PERMISSIONS.ANALYTICS_VIEW,
    PERMISSIONS.ANALYTICS_EXPORT,

    // Documents
    PERMISSIONS.DOCUMENT_VIEW,
    PERMISSIONS.DOCUMENT_DOWNLOAD,

  ],


  // =======================================================
  // MARINE OFFICER
  // =======================================================

  "Marine Officer": [

    PERMISSIONS.DASHBOARD_VIEW,

    PERMISSIONS.PORT_MAP_VIEW,

    PERMISSIONS.WEATHER_VIEW,

    // Vessels
    PERMISSIONS.VESSEL_VIEW,
    PERMISSIONS.VESSEL_CREATE,
    PERMISSIONS.VESSEL_EDIT,
    PERMISSIONS.VESSEL_APPROVE,

    // Berths
    PERMISSIONS.BERTH_VIEW,
    PERMISSIONS.BERTH_EDIT,
    PERMISSIONS.BERTH_ALLOCATE,

    // Communication
    PERMISSIONS.COMMUNICATION_VIEW,
    PERMISSIONS.COMMUNICATION_SEND,

    PERMISSIONS.NOTIFICATIONS_VIEW,

    // Safety
    PERMISSIONS.ALERTS_VIEW,
    PERMISSIONS.ALERTS_ACKNOWLEDGE,

    PERMISSIONS.INCIDENT_VIEW,
    PERMISSIONS.INCIDENT_CREATE,
    PERMISSIONS.INCIDENT_EDIT,

    // Analytics
    PERMISSIONS.ANALYTICS_VIEW,

    // Documents
    PERMISSIONS.DOCUMENT_VIEW,
    PERMISSIONS.DOCUMENT_UPLOAD,
    PERMISSIONS.DOCUMENT_DOWNLOAD,

  ],


  // =======================================================
  // CARGO OFFICER
  // =======================================================

  "Cargo Officer": [

    PERMISSIONS.DASHBOARD_VIEW,

    PERMISSIONS.PORT_MAP_VIEW,

    // Vessel information - read only
    PERMISSIONS.VESSEL_VIEW,

    // Berth information - read only
    PERMISSIONS.BERTH_VIEW,

    // Cargo
    PERMISSIONS.CARGO_VIEW,
    PERMISSIONS.CARGO_CREATE,
    PERMISSIONS.CARGO_EDIT,
    PERMISSIONS.CARGO_APPROVE,

    // Gate information
    PERMISSIONS.GATE_VIEW,

    // Communication
    PERMISSIONS.COMMUNICATION_VIEW,
    PERMISSIONS.COMMUNICATION_SEND,

    PERMISSIONS.NOTIFICATIONS_VIEW,

    // Alerts
    PERMISSIONS.ALERTS_VIEW,
    PERMISSIONS.ALERTS_ACKNOWLEDGE,

    // Incidents
    PERMISSIONS.INCIDENT_VIEW,
    PERMISSIONS.INCIDENT_CREATE,

    // Analytics
    PERMISSIONS.ANALYTICS_VIEW,

    // Documents
    PERMISSIONS.DOCUMENT_VIEW,
    PERMISSIONS.DOCUMENT_UPLOAD,
    PERMISSIONS.DOCUMENT_DOWNLOAD,

  ],


  // =======================================================
  // GATE & SECURITY OFFICER
  // =======================================================

  "Gate & Security Officer": [

    PERMISSIONS.DASHBOARD_VIEW,

    PERMISSIONS.PORT_MAP_VIEW,

    // Gate
    PERMISSIONS.GATE_VIEW,
    PERMISSIONS.GATE_CREATE,
    PERMISSIONS.GATE_EDIT,
    PERMISSIONS.GATE_APPROVE,

    // Vessel information
    PERMISSIONS.VESSEL_VIEW,

    // Communication
    PERMISSIONS.COMMUNICATION_VIEW,
    PERMISSIONS.COMMUNICATION_SEND,

    PERMISSIONS.NOTIFICATIONS_VIEW,

    // Security / Alerts
    PERMISSIONS.ALERTS_VIEW,
    PERMISSIONS.ALERTS_CREATE,
    PERMISSIONS.ALERTS_ACKNOWLEDGE,

    // Incidents
    PERMISSIONS.INCIDENT_VIEW,
    PERMISSIONS.INCIDENT_CREATE,
    PERMISSIONS.INCIDENT_EDIT,
    PERMISSIONS.INCIDENT_ASSIGN,
    PERMISSIONS.INCIDENT_CLOSE,

    // Documents
    PERMISSIONS.DOCUMENT_VIEW,
    PERMISSIONS.DOCUMENT_UPLOAD,
    PERMISSIONS.DOCUMENT_DOWNLOAD,

    // Audit - restricted operational view
    PERMISSIONS.AUDIT_VIEW,

  ],


  // =======================================================
  // MAINTENANCE OFFICER
  // =======================================================

  "Maintenance Officer": [

    PERMISSIONS.DASHBOARD_VIEW,

    PERMISSIONS.PORT_MAP_VIEW,

    PERMISSIONS.WEATHER_VIEW,

    // Maintenance
    PERMISSIONS.MAINTENANCE_VIEW,
    PERMISSIONS.MAINTENANCE_CREATE,
    PERMISSIONS.MAINTENANCE_EDIT,
    PERMISSIONS.MAINTENANCE_DELETE,
    PERMISSIONS.MAINTENANCE_ASSIGN,
    PERMISSIONS.MAINTENANCE_APPROVE,

    // Incidents
    PERMISSIONS.INCIDENT_VIEW,
    PERMISSIONS.INCIDENT_CREATE,
    PERMISSIONS.INCIDENT_EDIT,

    // Alerts
    PERMISSIONS.ALERTS_VIEW,
    PERMISSIONS.ALERTS_ACKNOWLEDGE,

    // Communication
    PERMISSIONS.COMMUNICATION_VIEW,
    PERMISSIONS.COMMUNICATION_SEND,

    PERMISSIONS.NOTIFICATIONS_VIEW,

    // Analytics
    PERMISSIONS.ANALYTICS_VIEW,

    // Documents
    PERMISSIONS.DOCUMENT_VIEW,
    PERMISSIONS.DOCUMENT_UPLOAD,
    PERMISSIONS.DOCUMENT_DOWNLOAD,

  ],


  // =======================================================
  // EXECUTIVE
  // =======================================================

  "Executive": [

    // Executive is primarily an oversight/read-only role.

    PERMISSIONS.DASHBOARD_VIEW,

    PERMISSIONS.PORT_MAP_VIEW,

    PERMISSIONS.WEATHER_VIEW,

    PERMISSIONS.VESSEL_VIEW,

    PERMISSIONS.BERTH_VIEW,

    PERMISSIONS.CARGO_VIEW,

    PERMISSIONS.GATE_VIEW,

    PERMISSIONS.COMMUNICATION_VIEW,

    PERMISSIONS.NOTIFICATIONS_VIEW,

    PERMISSIONS.ALERTS_VIEW,

    PERMISSIONS.INCIDENT_VIEW,

    PERMISSIONS.MAINTENANCE_VIEW,

    // Analytics
    PERMISSIONS.ANALYTICS_VIEW,
    PERMISSIONS.ANALYTICS_EXPORT,

    // Documents
    PERMISSIONS.DOCUMENT_VIEW,
    PERMISSIONS.DOCUMENT_DOWNLOAD,

  ],

};


// =========================================================
// GET PERMISSIONS FOR A ROLE
// =========================================================

export const getRolePermissions = (role) => {

  return ROLE_PERMISSIONS[role] || [];

};


// =========================================================
// CHECK WHETHER A ROLE HAS A PERMISSION
// =========================================================

export const roleHasPermission = (
  role,
  permission
) => {

  const permissions =
    getRolePermissions(role);

  return permissions.includes(permission);

};


// =========================================================
// CHECK WHETHER A USER HAS A PERMISSION
// =========================================================

export const userHasPermission = (
  user,
  permission
) => {

  if (!user?.role) {
    return false;
  }

  return roleHasPermission(
    user.role,
    permission
  );

};


// =========================================================
// CHECK MULTIPLE PERMISSIONS
// =========================================================
//
// ALL = user must have every permission.
//
// ANY = user only needs one of the permissions.
//
// =========================================================

export const userHasPermissions = (
  user,
  permissions = [],
  mode = "ALL"
) => {

  if (!user?.role) {
    return false;
  }

  const rolePermissions =
    getRolePermissions(user.role);


  if (!permissions.length) {
    return true;
  }


  if (mode === "ANY") {

    return permissions.some(
      (permission) =>
        rolePermissions.includes(permission)
    );

  }


  return permissions.every(
    (permission) =>
      rolePermissions.includes(permission)
  );

};


// =========================================================
// GET ALL ROLES
// =========================================================

export const getRoles = () => {

  return Object.keys(
    ROLE_PERMISSIONS
  );

};


// =========================================================
// GET ALL AVAILABLE PERMISSIONS
// =========================================================

export const getAllPermissions = () => {

  return Object.values(
    PERMISSIONS
  );

};


// =========================================================
// GET PERMISSION GROUPS
// =========================================================
//
// Useful later for the User & Role Management screen.
//
// Port officials can eventually see permissions grouped
// by module instead of seeing a huge flat list.
// =========================================================

export const PERMISSION_GROUPS = {

  "Port Dashboard": [
    PERMISSIONS.DASHBOARD_VIEW,
  ],

  "Live Port Map": [
    PERMISSIONS.PORT_MAP_VIEW,
    PERMISSIONS.PORT_MAP_MANAGE,
  ],

  "Weather & Marine Conditions": [
    PERMISSIONS.WEATHER_VIEW,
    PERMISSIONS.WEATHER_MANAGE,
  ],

  "Vessel Management": [
    PERMISSIONS.VESSEL_VIEW,
    PERMISSIONS.VESSEL_CREATE,
    PERMISSIONS.VESSEL_EDIT,
    PERMISSIONS.VESSEL_DELETE,
    PERMISSIONS.VESSEL_APPROVE,
  ],

  "Berth Management": [
    PERMISSIONS.BERTH_VIEW,
    PERMISSIONS.BERTH_CREATE,
    PERMISSIONS.BERTH_EDIT,
    PERMISSIONS.BERTH_DELETE,
    PERMISSIONS.BERTH_ALLOCATE,
  ],

  "Cargo Operations": [
    PERMISSIONS.CARGO_VIEW,
    PERMISSIONS.CARGO_CREATE,
    PERMISSIONS.CARGO_EDIT,
    PERMISSIONS.CARGO_DELETE,
    PERMISSIONS.CARGO_APPROVE,
  ],

  "Gate & Truck Management": [
    PERMISSIONS.GATE_VIEW,
    PERMISSIONS.GATE_CREATE,
    PERMISSIONS.GATE_EDIT,
    PERMISSIONS.GATE_DELETE,
    PERMISSIONS.GATE_APPROVE,
  ],

  "Port Communication": [
    PERMISSIONS.COMMUNICATION_VIEW,
    PERMISSIONS.COMMUNICATION_SEND,
    PERMISSIONS.COMMUNICATION_MANAGE,
  ],

  "Notifications": [
    PERMISSIONS.NOTIFICATIONS_VIEW,
    PERMISSIONS.NOTIFICATIONS_MANAGE,
  ],

  "Port Alerts": [
    PERMISSIONS.ALERTS_VIEW,
    PERMISSIONS.ALERTS_CREATE,
    PERMISSIONS.ALERTS_EDIT,
    PERMISSIONS.ALERTS_DELETE,
    PERMISSIONS.ALERTS_ACKNOWLEDGE,
  ],

  "Incident Management": [
    PERMISSIONS.INCIDENT_VIEW,
    PERMISSIONS.INCIDENT_CREATE,
    PERMISSIONS.INCIDENT_EDIT,
    PERMISSIONS.INCIDENT_DELETE,
    PERMISSIONS.INCIDENT_ASSIGN,
    PERMISSIONS.INCIDENT_CLOSE,
  ],

  "Asset & Maintenance": [
    PERMISSIONS.MAINTENANCE_VIEW,
    PERMISSIONS.MAINTENANCE_CREATE,
    PERMISSIONS.MAINTENANCE_EDIT,
    PERMISSIONS.MAINTENANCE_DELETE,
    PERMISSIONS.MAINTENANCE_ASSIGN,
    PERMISSIONS.MAINTENANCE_APPROVE,
  ],

  "Port Analytics": [
    PERMISSIONS.ANALYTICS_VIEW,
    PERMISSIONS.ANALYTICS_EXPORT,
    PERMISSIONS.ANALYTICS_MANAGE,
  ],

  "Document Management": [
    PERMISSIONS.DOCUMENT_VIEW,
    PERMISSIONS.DOCUMENT_UPLOAD,
    PERMISSIONS.DOCUMENT_EDIT,
    PERMISSIONS.DOCUMENT_DELETE,
    PERMISSIONS.DOCUMENT_APPROVE,
    PERMISSIONS.DOCUMENT_DOWNLOAD,
  ],

  "Audit Logs": [
    PERMISSIONS.AUDIT_VIEW,
    PERMISSIONS.AUDIT_EXPORT,
    PERMISSIONS.AUDIT_MANAGE,
  ],

  "User Management": [
    PERMISSIONS.USERS_VIEW,
    PERMISSIONS.USERS_CREATE,
    PERMISSIONS.USERS_EDIT,
    PERMISSIONS.USERS_DELETE,
    PERMISSIONS.USERS_ENABLE,
    PERMISSIONS.USERS_DISABLE,
    PERMISSIONS.USERS_ASSIGN_ROLE,
  ],

  "Role Management": [
    PERMISSIONS.ROLES_VIEW,
    PERMISSIONS.ROLES_CREATE,
    PERMISSIONS.ROLES_EDIT,
    PERMISSIONS.ROLES_DELETE,
    PERMISSIONS.ROLES_ASSIGN_PERMISSIONS,
  ],

};


// =========================================================
// EXPORT
// =========================================================

export default {
  PERMISSIONS,
  ROLE_PERMISSIONS,
  PERMISSION_GROUPS,
};