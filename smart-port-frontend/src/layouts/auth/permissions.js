// ============================================================
// PORT OF SINGAPORE
// ROLE-BASED ACCESS CONTROL (RBAC)
// ============================================================
//
// PostgreSQL / FastAPI permissions are authoritative.
//
// Backend module permissions:
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
// IMPORTANT:
// If backend explicitly returns:
//     permissions: []
// the user has ZERO permissions.
// There is NO static-role fallback in that case,
// and NO role name (including administrator) grants
// access on its own.
// ============================================================

// ============================================================
// PERMISSION DEFINITIONS
// ============================================================

export const PERMISSIONS = {
  DASHBOARD_VIEW: "dashboard.view",

  PORT_MAP_VIEW: "port_map.view",
  PORT_MAP_MANAGE: "port_map.manage",

  WEATHER_VIEW: "weather.view",
  WEATHER_MANAGE: "weather.manage",

  VESSEL_VIEW: "vessel.view",
  VESSEL_CREATE: "vessel.create",
  VESSEL_EDIT: "vessel.edit",
  VESSEL_DELETE: "vessel.delete",
  VESSEL_APPROVE: "vessel.approve",

  BERTH_VIEW: "berth.view",
  BERTH_CREATE: "berth.create",
  BERTH_EDIT: "berth.edit",
  BERTH_DELETE: "berth.delete",
  BERTH_ALLOCATE: "berth.allocate",

  CARGO_VIEW: "cargo.view",
  CARGO_CREATE: "cargo.create",
  CARGO_EDIT: "cargo.edit",
  CARGO_DELETE: "cargo.delete",
  CARGO_APPROVE: "cargo.approve",

  GATE_VIEW: "gate.view",
  GATE_CREATE: "gate.create",
  GATE_EDIT: "gate.edit",
  GATE_DELETE: "gate.delete",
  GATE_APPROVE: "gate.approve",

  COMMUNICATION_VIEW: "communication.view",
  COMMUNICATION_SEND: "communication.send",
  COMMUNICATION_MANAGE: "communication.manage",

  NOTIFICATIONS_VIEW: "notifications.view",
  NOTIFICATIONS_MANAGE: "notifications.manage",

  ALERTS_VIEW: "alerts.view",
  ALERTS_CREATE: "alerts.create",
  ALERTS_EDIT: "alerts.edit",
  ALERTS_DELETE: "alerts.delete",
  ALERTS_ACKNOWLEDGE: "alerts.acknowledge",

  INCIDENT_VIEW: "incident.view",
  INCIDENT_CREATE: "incident.create",
  INCIDENT_EDIT: "incident.edit",
  INCIDENT_DELETE: "incident.delete",
  INCIDENT_ASSIGN: "incident.assign",
  INCIDENT_CLOSE: "incident.close",

  MAINTENANCE_VIEW: "maintenance.view",
  MAINTENANCE_CREATE: "maintenance.create",
  MAINTENANCE_EDIT: "maintenance.edit",
  MAINTENANCE_DELETE: "maintenance.delete",
  MAINTENANCE_ASSIGN: "maintenance.assign",
  MAINTENANCE_APPROVE: "maintenance.approve",

  ANALYTICS_VIEW: "analytics.view",
  ANALYTICS_EXPORT: "analytics.export",
  ANALYTICS_MANAGE: "analytics.manage",

  DOCUMENT_VIEW: "document.view",
  DOCUMENT_UPLOAD: "document.upload",
  DOCUMENT_EDIT: "document.edit",
  DOCUMENT_DELETE: "document.delete",
  DOCUMENT_APPROVE: "document.approve",
  DOCUMENT_DOWNLOAD: "document.download",

  AUDIT_VIEW: "audit.view",
  AUDIT_EXPORT: "audit.export",
  AUDIT_MANAGE: "audit.manage",

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

// ============================================================
// BACKEND MODULE PERMISSIONS
// ============================================================

export const BACKEND_MODULE_PERMISSIONS = [
  "dashboard",
  "port_map",
  "weather",
  "vessels",
  "berths",
  "cargo",
  "gate_trucks",
  "port_communication",
  "notifications",
  "port_alerts",
  "incidents",
  "asset_maintenance",
  "analytics",
  "documents",
  "audit_logs",
  "user_role_management",
];

// ============================================================
// MODULE → GRANULAR PERMISSION MAPPING
// ============================================================

export const MODULE_PERMISSIONS = {
  dashboard: [
    PERMISSIONS.DASHBOARD_VIEW,
  ],

  port_map: [
    PERMISSIONS.PORT_MAP_VIEW,
    PERMISSIONS.PORT_MAP_MANAGE,
  ],

  weather: [
    PERMISSIONS.WEATHER_VIEW,
    PERMISSIONS.WEATHER_MANAGE,
  ],

  vessels: [
    PERMISSIONS.VESSEL_VIEW,
    PERMISSIONS.VESSEL_CREATE,
    PERMISSIONS.VESSEL_EDIT,
    PERMISSIONS.VESSEL_DELETE,
    PERMISSIONS.VESSEL_APPROVE,
  ],

  berths: [
    PERMISSIONS.BERTH_VIEW,
    PERMISSIONS.BERTH_CREATE,
    PERMISSIONS.BERTH_EDIT,
    PERMISSIONS.BERTH_DELETE,
    PERMISSIONS.BERTH_ALLOCATE,
  ],

  cargo: [
    PERMISSIONS.CARGO_VIEW,
    PERMISSIONS.CARGO_CREATE,
    PERMISSIONS.CARGO_EDIT,
    PERMISSIONS.CARGO_DELETE,
    PERMISSIONS.CARGO_APPROVE,
  ],

  gate_trucks: [
    PERMISSIONS.GATE_VIEW,
    PERMISSIONS.GATE_CREATE,
    PERMISSIONS.GATE_EDIT,
    PERMISSIONS.GATE_DELETE,
    PERMISSIONS.GATE_APPROVE,
  ],

  port_communication: [
    PERMISSIONS.COMMUNICATION_VIEW,
    PERMISSIONS.COMMUNICATION_SEND,
    PERMISSIONS.COMMUNICATION_MANAGE,
  ],

  notifications: [
    PERMISSIONS.NOTIFICATIONS_VIEW,
    PERMISSIONS.NOTIFICATIONS_MANAGE,
  ],

  port_alerts: [
    PERMISSIONS.ALERTS_VIEW,
    PERMISSIONS.ALERTS_CREATE,
    PERMISSIONS.ALERTS_EDIT,
    PERMISSIONS.ALERTS_DELETE,
    PERMISSIONS.ALERTS_ACKNOWLEDGE,
  ],

  incidents: [
    PERMISSIONS.INCIDENT_VIEW,
    PERMISSIONS.INCIDENT_CREATE,
    PERMISSIONS.INCIDENT_EDIT,
    PERMISSIONS.INCIDENT_DELETE,
    PERMISSIONS.INCIDENT_ASSIGN,
    PERMISSIONS.INCIDENT_CLOSE,
  ],

  asset_maintenance: [
    PERMISSIONS.MAINTENANCE_VIEW,
    PERMISSIONS.MAINTENANCE_CREATE,
    PERMISSIONS.MAINTENANCE_EDIT,
    PERMISSIONS.MAINTENANCE_DELETE,
    PERMISSIONS.MAINTENANCE_ASSIGN,
    PERMISSIONS.MAINTENANCE_APPROVE,
  ],

  analytics: [
    PERMISSIONS.ANALYTICS_VIEW,
    PERMISSIONS.ANALYTICS_EXPORT,
    PERMISSIONS.ANALYTICS_MANAGE,
  ],

  documents: [
    PERMISSIONS.DOCUMENT_VIEW,
    PERMISSIONS.DOCUMENT_UPLOAD,
    PERMISSIONS.DOCUMENT_EDIT,
    PERMISSIONS.DOCUMENT_DELETE,
    PERMISSIONS.DOCUMENT_APPROVE,
    PERMISSIONS.DOCUMENT_DOWNLOAD,
  ],

  audit_logs: [
    PERMISSIONS.AUDIT_VIEW,
    PERMISSIONS.AUDIT_EXPORT,
    PERMISSIONS.AUDIT_MANAGE,
  ],

  user_role_management: [
    PERMISSIONS.USERS_VIEW,
    PERMISSIONS.USERS_CREATE,
    PERMISSIONS.USERS_EDIT,
    PERMISSIONS.USERS_DELETE,
    PERMISSIONS.USERS_ENABLE,
    PERMISSIONS.USERS_DISABLE,
    PERMISSIONS.USERS_ASSIGN_ROLE,

    PERMISSIONS.ROLES_VIEW,
    PERMISSIONS.ROLES_CREATE,
    PERMISSIONS.ROLES_EDIT,
    PERMISSIONS.ROLES_DELETE,
    PERMISSIONS.ROLES_ASSIGN_PERMISSIONS,
  ],
};

// ============================================================
// MODULE VIEW PERMISSION
// ============================================================

const MODULE_VIEW_PERMISSION = {
  dashboard: PERMISSIONS.DASHBOARD_VIEW,
  port_map: PERMISSIONS.PORT_MAP_VIEW,
  weather: PERMISSIONS.WEATHER_VIEW,
  vessels: PERMISSIONS.VESSEL_VIEW,
  berths: PERMISSIONS.BERTH_VIEW,
  cargo: PERMISSIONS.CARGO_VIEW,
  gate_trucks: PERMISSIONS.GATE_VIEW,
  port_communication: PERMISSIONS.COMMUNICATION_VIEW,
  notifications: PERMISSIONS.NOTIFICATIONS_VIEW,
  port_alerts: PERMISSIONS.ALERTS_VIEW,
  incidents: PERMISSIONS.INCIDENT_VIEW,
  asset_maintenance: PERMISSIONS.MAINTENANCE_VIEW,
  analytics: PERMISSIONS.ANALYTICS_VIEW,
  documents: PERMISSIONS.DOCUMENT_VIEW,
  audit_logs: PERMISSIONS.AUDIT_VIEW,
  user_role_management: PERMISSIONS.USERS_VIEW,
};

// ============================================================
// MODULE ALIASES
// ============================================================

const MODULE_ALIASES = {
  dashboard: "dashboard",
  "dashboard.view": "dashboard",

  port_map: "port_map",
  "port-map": "port_map",
  "port_map.view": "port_map",
  "port_map.manage": "port_map",

  weather: "weather",
  "weather.view": "weather",
  "weather.manage": "weather",

  vessels: "vessels",
  vessel: "vessels",
  "vessel.view": "vessels",
  "vessel.create": "vessels",
  "vessel.edit": "vessels",
  "vessel.delete": "vessels",
  "vessel.approve": "vessels",

  berths: "berths",
  berth: "berths",
  "berth.view": "berths",
  "berth.create": "berths",
  "berth.edit": "berths",
  "berth.delete": "berths",
  "berth.allocate": "berths",

  cargo: "cargo",
  "cargo.view": "cargo",
  "cargo.create": "cargo",
  "cargo.edit": "cargo",
  "cargo.delete": "cargo",
  "cargo.approve": "cargo",

  gate: "gate_trucks",
  gate_trucks: "gate_trucks",
  "gate-trucks": "gate_trucks",
  "gate.view": "gate_trucks",
  "gate.create": "gate_trucks",
  "gate.edit": "gate_trucks",
  "gate.delete": "gate_trucks",
  "gate.approve": "gate_trucks",

  port_communication: "port_communication",
  "port-communication": "port_communication",
  communication: "port_communication",
  "communication.view": "port_communication",
  "communication.send": "port_communication",
  "communication.manage": "port_communication",

  notifications: "notifications",
  notification: "notifications",
  "notifications.view": "notifications",
  "notifications.manage": "notifications",

  alerts: "port_alerts",
  port_alerts: "port_alerts",
  "port-alerts": "port_alerts",
  "alerts.view": "port_alerts",
  "alerts.create": "port_alerts",
  "alerts.edit": "port_alerts",
  "alerts.delete": "port_alerts",
  "alerts.acknowledge": "port_alerts",

  incidents: "incidents",
  incident: "incidents",
  "incident.view": "incidents",
  "incident.create": "incidents",
  "incident.edit": "incidents",
  "incident.delete": "incidents",
  "incident.assign": "incidents",
  "incident.close": "incidents",

  asset_maintenance: "asset_maintenance",
  maintenance: "asset_maintenance",
  "asset-maintenance": "asset_maintenance",
  "maintenance.view": "asset_maintenance",
  "maintenance.create": "asset_maintenance",
  "maintenance.edit": "asset_maintenance",
  "maintenance.delete": "asset_maintenance",
  "maintenance.assign": "asset_maintenance",
  "maintenance.approve": "asset_maintenance",

  analytics: "analytics",
  "analytics.view": "analytics",
  "analytics.export": "analytics",
  "analytics.manage": "analytics",

  documents: "documents",
  document: "documents",
  "documents.view": "documents",
  "document.view": "documents",
  "document.upload": "documents",
  "document.edit": "documents",
  "document.delete": "documents",
  "document.approve": "documents",
  "document.download": "documents",

  audit_logs: "audit_logs",
  "audit-logs": "audit_logs",
  audit: "audit_logs",
  "audit.logs": "audit_logs",
  "audit.view": "audit_logs",
  "audit.export": "audit_logs",
  "audit.manage": "audit_logs",

  user_role_management: "user_role_management",
  "user-role-management": "user_role_management",
  users: "user_role_management",
  roles: "user_role_management",
};

// ============================================================
// FIXED ROLE PERMISSIONS
// ============================================================
//
// Compatibility only.
// Runtime authorization comes from backend permissions.
//
// ============================================================

export const ROLE_PERMISSIONS = {
  "Port Administrator":
    Object.values(PERMISSIONS),

  "Port Operations Manager": [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.PORT_MAP_VIEW,
    PERMISSIONS.WEATHER_VIEW,

    PERMISSIONS.VESSEL_VIEW,
    PERMISSIONS.VESSEL_CREATE,
    PERMISSIONS.VESSEL_EDIT,
    PERMISSIONS.VESSEL_APPROVE,

    PERMISSIONS.BERTH_VIEW,
    PERMISSIONS.BERTH_CREATE,
    PERMISSIONS.BERTH_EDIT,
    PERMISSIONS.BERTH_ALLOCATE,

    PERMISSIONS.CARGO_VIEW,
    PERMISSIONS.CARGO_CREATE,
    PERMISSIONS.CARGO_EDIT,
    PERMISSIONS.CARGO_APPROVE,

    PERMISSIONS.GATE_VIEW,

    PERMISSIONS.COMMUNICATION_VIEW,
    PERMISSIONS.COMMUNICATION_SEND,

    PERMISSIONS.NOTIFICATIONS_VIEW,

    PERMISSIONS.ALERTS_VIEW,
    PERMISSIONS.ALERTS_ACKNOWLEDGE,

    PERMISSIONS.INCIDENT_VIEW,
    PERMISSIONS.INCIDENT_CREATE,
    PERMISSIONS.INCIDENT_EDIT,
    PERMISSIONS.INCIDENT_ASSIGN,
    PERMISSIONS.INCIDENT_CLOSE,

    PERMISSIONS.MAINTENANCE_VIEW,

    PERMISSIONS.ANALYTICS_VIEW,
    PERMISSIONS.ANALYTICS_EXPORT,

    PERMISSIONS.DOCUMENT_VIEW,
    PERMISSIONS.DOCUMENT_DOWNLOAD,
  ],

  "Vessel Management Officer": [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.PORT_MAP_VIEW,
    PERMISSIONS.WEATHER_VIEW,

    PERMISSIONS.VESSEL_VIEW,
    PERMISSIONS.VESSEL_CREATE,
    PERMISSIONS.VESSEL_EDIT,
    PERMISSIONS.VESSEL_APPROVE,

    PERMISSIONS.BERTH_VIEW,
    PERMISSIONS.BERTH_EDIT,
    PERMISSIONS.BERTH_ALLOCATE,

    PERMISSIONS.COMMUNICATION_VIEW,
    PERMISSIONS.COMMUNICATION_SEND,

    PERMISSIONS.NOTIFICATIONS_VIEW,

    PERMISSIONS.ALERTS_VIEW,
    PERMISSIONS.ALERTS_ACKNOWLEDGE,

    PERMISSIONS.INCIDENT_VIEW,
    PERMISSIONS.INCIDENT_CREATE,
    PERMISSIONS.INCIDENT_EDIT,

    PERMISSIONS.ANALYTICS_VIEW,

    PERMISSIONS.DOCUMENT_VIEW,
    PERMISSIONS.DOCUMENT_UPLOAD,
    PERMISSIONS.DOCUMENT_DOWNLOAD,
  ],

  "Cargo Officer": [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.PORT_MAP_VIEW,

    PERMISSIONS.VESSEL_VIEW,

    PERMISSIONS.BERTH_VIEW,

    PERMISSIONS.CARGO_VIEW,
    PERMISSIONS.CARGO_CREATE,
    PERMISSIONS.CARGO_EDIT,
    PERMISSIONS.CARGO_APPROVE,

    PERMISSIONS.GATE_VIEW,

    PERMISSIONS.COMMUNICATION_VIEW,
    PERMISSIONS.COMMUNICATION_SEND,

    PERMISSIONS.NOTIFICATIONS_VIEW,

    PERMISSIONS.ALERTS_VIEW,
    PERMISSIONS.ALERTS_ACKNOWLEDGE,

    PERMISSIONS.INCIDENT_VIEW,
    PERMISSIONS.INCIDENT_CREATE,

    PERMISSIONS.ANALYTICS_VIEW,

    PERMISSIONS.DOCUMENT_VIEW,
    PERMISSIONS.DOCUMENT_UPLOAD,
    PERMISSIONS.DOCUMENT_DOWNLOAD,
  ],

  "Gate & Truck Officer": [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.PORT_MAP_VIEW,

    PERMISSIONS.GATE_VIEW,
    PERMISSIONS.GATE_CREATE,
    PERMISSIONS.GATE_EDIT,
    PERMISSIONS.GATE_APPROVE,

    PERMISSIONS.VESSEL_VIEW,

    PERMISSIONS.CARGO_VIEW,

    PERMISSIONS.COMMUNICATION_VIEW,
    PERMISSIONS.COMMUNICATION_SEND,

    PERMISSIONS.NOTIFICATIONS_VIEW,

    PERMISSIONS.ALERTS_VIEW,
    PERMISSIONS.ALERTS_ACKNOWLEDGE,

    PERMISSIONS.INCIDENT_VIEW,
    PERMISSIONS.INCIDENT_CREATE,
    PERMISSIONS.INCIDENT_EDIT,

    PERMISSIONS.DOCUMENT_VIEW,
    PERMISSIONS.DOCUMENT_UPLOAD,
    PERMISSIONS.DOCUMENT_DOWNLOAD,
  ],

  "Security Officer": [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.PORT_MAP_VIEW,

    PERMISSIONS.VESSEL_VIEW,

    PERMISSIONS.GATE_VIEW,

    PERMISSIONS.COMMUNICATION_VIEW,
    PERMISSIONS.COMMUNICATION_SEND,

    PERMISSIONS.NOTIFICATIONS_VIEW,

    PERMISSIONS.ALERTS_VIEW,
    PERMISSIONS.ALERTS_CREATE,
    PERMISSIONS.ALERTS_EDIT,
    PERMISSIONS.ALERTS_ACKNOWLEDGE,

    PERMISSIONS.INCIDENT_VIEW,
    PERMISSIONS.INCIDENT_CREATE,
    PERMISSIONS.INCIDENT_EDIT,
    PERMISSIONS.INCIDENT_ASSIGN,
    PERMISSIONS.INCIDENT_CLOSE,

    PERMISSIONS.DOCUMENT_VIEW,
    PERMISSIONS.DOCUMENT_UPLOAD,
    PERMISSIONS.DOCUMENT_DOWNLOAD,

    PERMISSIONS.AUDIT_VIEW,
  ],

  "Maintenance Officer": [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.PORT_MAP_VIEW,
    PERMISSIONS.WEATHER_VIEW,

    PERMISSIONS.MAINTENANCE_VIEW,
    PERMISSIONS.MAINTENANCE_CREATE,
    PERMISSIONS.MAINTENANCE_EDIT,
    PERMISSIONS.MAINTENANCE_DELETE,
    PERMISSIONS.MAINTENANCE_ASSIGN,
    PERMISSIONS.MAINTENANCE_APPROVE,

    PERMISSIONS.INCIDENT_VIEW,
    PERMISSIONS.INCIDENT_CREATE,
    PERMISSIONS.INCIDENT_EDIT,

    PERMISSIONS.ALERTS_VIEW,
    PERMISSIONS.ALERTS_ACKNOWLEDGE,

    PERMISSIONS.COMMUNICATION_VIEW,
    PERMISSIONS.COMMUNICATION_SEND,

    PERMISSIONS.NOTIFICATIONS_VIEW,

    PERMISSIONS.ANALYTICS_VIEW,

    PERMISSIONS.DOCUMENT_VIEW,
    PERMISSIONS.DOCUMENT_UPLOAD,
    PERMISSIONS.DOCUMENT_DOWNLOAD,
  ],

  "Port Executive": [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.PORT_MAP_VIEW,

    PERMISSIONS.VESSEL_VIEW,
    PERMISSIONS.BERTH_VIEW,
    PERMISSIONS.CARGO_VIEW,
    PERMISSIONS.GATE_VIEW,

    PERMISSIONS.COMMUNICATION_VIEW,

    PERMISSIONS.NOTIFICATIONS_VIEW,

    PERMISSIONS.ALERTS_VIEW,

    PERMISSIONS.INCIDENT_VIEW,

    PERMISSIONS.ANALYTICS_VIEW,
    PERMISSIONS.ANALYTICS_EXPORT,

    PERMISSIONS.DOCUMENT_VIEW,
    PERMISSIONS.DOCUMENT_DOWNLOAD,
  ],
};

// ============================================================
// NORMALIZE PERMISSION VALUE
// ============================================================

export const normalizePermissionValue = (
  value
) => {
  if (!value) {
    return null;
  }

  if (typeof value === "object") {
    if (
      typeof value.key === "string"
    ) {
      return normalizePermissionValue(
        value.key
      );
    }

    if (
      typeof value.permission ===
      "string"
    ) {
      return normalizePermissionValue(
        value.permission
      );
    }

    if (
      typeof value.name === "string"
    ) {
      return normalizePermissionValue(
        value.name
      );
    }

    return null;
  }

  if (typeof value !== "string") {
    return null;
  }

  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
};

// ============================================================
// NORMALIZE USER PERMISSIONS
// ============================================================

export const normalizeUserPermissions = (
  permissions
) => {
  if (!Array.isArray(permissions)) {
    return [];
  }

  return [
    ...new Set(
      permissions
        .map(
          normalizePermissionValue
        )
        .filter(Boolean)
    ),
  ];
};

// ============================================================
// GET ROLE PERMISSIONS
// ============================================================
//
// Compatibility only.
// ============================================================

export const getRolePermissions = (
  role
) => {
  if (!role) {
    return [];
  }

  return ROLE_PERMISSIONS[role] || [];
};

// ============================================================
// CHECK PORT ADMINISTRATOR
// ============================================================
//
// Informational only (for example, to show a role badge).
//
// SECURITY: this must NEVER be used to grant access.
// Access comes only from the backend permission list.
// ============================================================

export const isPortAdministrator = (
  user
) => {
  if (!user) {
    return false;
  }

  const role =
    user.role ||
    user.backendRole ||
    user.employeeRole;

  if (typeof role !== "string") {
    return false;
  }

  const normalizedRole = role
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

  return (
    normalizedRole ===
      "port_administrator" ||
    normalizedRole === "admin" ||
    normalizedRole ===
      "port_administration"
  );
};

// ============================================================
// EXTRACT BACKEND PERMISSIONS
// ============================================================

const extractBackendPermissions = (
  user
) => {
  if (!user) {
    return null;
  }

  /*
   * role_permissions has priority.
   */
  if (
    Array.isArray(
      user.role_permissions
    )
  ) {
    return normalizeUserPermissions(
      user.role_permissions
    );
  }

  /*
   * Compatibility with permissions.
   */
  if (
    Array.isArray(
      user.permissions
    )
  ) {
    return normalizeUserPermissions(
      user.permissions
    );
  }

  return null;
};

// ============================================================
// GET USER PERMISSIONS
// ============================================================
//
// PostgreSQL is authoritative.
//
// backend permissions present
//      ↓
// use them exactly
//
// backend permissions []
//      ↓
// ZERO permissions
//
// backend permissions missing
//      ↓
// compatibility fallback (granular permissions only,
// which never grant module access)
//
// The user's role name never grants anything by itself.
// ============================================================

export const getUserPermissions = (
  user
) => {
  if (!user) {
    return [];
  }

  const backendPermissions =
    extractBackendPermissions(user);

  /*
   * CRITICAL:
   *
   * [] is a valid backend permission set.
   * Do NOT fall back to the role when [] is returned.
   */
  if (
    Array.isArray(
      backendPermissions
    )
  ) {
    return backendPermissions;
  }

  /*
   * Compatibility fallback only when
   * backend supplied no permission field.
   */
  const role =
    user.role ||
    user.backendRole ||
    user.employeeRole;

  return normalizeUserPermissions(
    getRolePermissions(role)
  );
};

// ============================================================
// CHECK EXACT USER PERMISSION
// ============================================================

export const userHasPermission = (
  user,
  permission
) => {
  if (!user) {
    return false;
  }

  const requested =
    normalizePermissionValue(
      permission
    );

  if (!requested) {
    return false;
  }

  const permissions =
    getUserPermissions(user);

  /*
   * Exact permission.
   */
  if (
    permissions.includes(
      requested
    )
  ) {
    return true;
  }

  /*
   * Backend module permission may satisfy
   * ONLY the corresponding view permission.
   */
  for (
    const moduleKey of
      BACKEND_MODULE_PERMISSIONS
  ) {
    if (
      !permissions.includes(
        moduleKey
      )
    ) {
      continue;
    }

    if (
      MODULE_VIEW_PERMISSION[
        moduleKey
      ] === requested
    ) {
      return true;
    }
  }

  /*
   * A module permission cannot satisfy
   * an action permission.
   */
  return false;
};

// ============================================================
// CHECK MULTIPLE PERMISSIONS
// ============================================================

export const userHasPermissions = (
  user,
  permissions = [],
  mode = "ALL"
) => {
  if (!user) {
    return false;
  }

  /*
   * No requested permissions means
   * no restriction.
   */
  if (
    !Array.isArray(permissions) ||
    permissions.length === 0
  ) {
    return true;
  }

  const normalizedPermissions =
    permissions
      .map(
        normalizePermissionValue
      )
      .filter(Boolean);

  if (
    normalizedPermissions.length === 0
  ) {
    return true;
  }

  if (mode === "ANY") {
    return normalizedPermissions.some(
      (permission) =>
        userHasPermission(
          user,
          permission
        )
    );
  }

  return normalizedPermissions.every(
    (permission) =>
      userHasPermission(
        user,
        permission
      )
  );
};

// ============================================================
// CHECK MODULE ACCESS
// ============================================================
//
// THIS IS THE PRIMARY SIDEBAR RBAC CHECK.
//
// ONLY the backend module permission itself
// grants module access.
//
// Example:
//
// permissions = ["dashboard", "cargo"]
//
// dashboard  -> TRUE
// cargo      -> TRUE
// vessels    -> FALSE
//
// cargo.edit without cargo -> FALSE
// permissions = []         -> FALSE for every module
// ============================================================

export const hasModuleAccess = (
  user,
  moduleKey
) => {
  if (
    !user ||
    !moduleKey
  ) {
    return false;
  }

  const normalizedModule =
    normalizePermissionValue(
      moduleKey
    );

  if (!normalizedModule) {
    return false;
  }

  /*
   * Resolve aliases to the canonical
   * backend module key.
   */
  const resolvedModule =
    MODULE_ALIASES[
      normalizedModule
    ] || normalizedModule;

  /*
   * Get backend-authoritative permissions.
   */
  const userPermissions =
    getUserPermissions(user);

  /*
   * ONLY a direct backend module permission
   * grants module access.
   */
  return userPermissions.includes(
    resolvedModule
  );
};

// ============================================================
// CHECK ROLE PERMISSION
// ============================================================
//
// Compatibility helper for old UI code.
// Not used for runtime authorization.
// ============================================================

export const roleHasPermission = (
  role,
  permission
) => {
  const normalized =
    normalizePermissionValue(
      permission
    );

  if (!normalized) {
    return false;
  }

  return getRolePermissions(
    role
  ).some(
    (rolePermission) =>
      normalizePermissionValue(
        rolePermission
      ) === normalized
  );
};

// ============================================================
// GET ALL ROLES
// ============================================================

export const getRoles = () => {
  return Object.keys(
    ROLE_PERMISSIONS
  );
};

// ============================================================
// GET ALL PERMISSIONS
// ============================================================

export const getAllPermissions = () => {
  return Object.values(
    PERMISSIONS
  );
};

// ============================================================
// PERMISSION GROUPS
// ============================================================

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

  Notifications: [
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

// ============================================================
// DEFAULT EXPORT
// ============================================================

const permissionsConfig = {
  PERMISSIONS,
  BACKEND_MODULE_PERMISSIONS,
  MODULE_PERMISSIONS,
  ROLE_PERMISSIONS,
  PERMISSION_GROUPS,

  getRolePermissions,
  getUserPermissions,
  normalizeUserPermissions,
  normalizePermissionValue,

  userHasPermission,
  userHasPermissions,
  hasModuleAccess,

  roleHasPermission,

  getRoles,
  getAllPermissions,

  isPortAdministrator,
};

export default permissionsConfig;