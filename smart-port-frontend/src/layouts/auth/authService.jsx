import {
  getUserPermissions,
  userHasPermission,
  userHasPermissions,
} from "./permissions";

import {
  createSession,
  getCurrentSession,
  destroySession,
  startSessionHeartbeat,
  stopSessionHeartbeat,
  initializeSessionManager,
  updateCurrentSession,
} from "./sessionManager";

import { apiPost, apiGet } from "../../services/api";

// =========================================================
// PORT OF SINGAPORE
// AUTHENTICATION SERVICE
// =========================================================

const AUTH_STORAGE_KEY = "karwarPortAuthenticated";
const CURRENT_USER_KEY = "karwarPortCurrentUser";
const ACCESS_TOKEN_KEY = "karwarPortAccessToken";

// =========================================================
// ROLE NAMES
// =========================================================
//
// The backend sends the role name exactly as it is stored in
// PostgreSQL, for example "Cargo Officer".
//
// There are 8 FIXED roles. Any other role was created by the
// Port Administrator and must keep the name it was given.
//
// The role name is for DISPLAY only. It never grants access.
// Access comes from the permissions (features) of the role.
//

const FIXED_ROLES = [
  "Port Administrator",
  "Port Operations Manager",
  "Vessel Management Officer",
  "Cargo Officer",
  "Gate & Truck Officer",
  "Security Officer",
  "Maintenance Officer",
  "Port Executive",
];

const roleKey = (value) =>
  String(value)
    .toLowerCase()
    .trim()
    .replace(/[\s_-]+/g, "_");

const FIXED_ROLE_LOOKUP = new Map(
  FIXED_ROLES.map((name) => [roleKey(name), name])
);

const extractRoleValue = (role) => {
  if (!role) {
    return null;
  }

  if (typeof role === "string") {
    return role.trim();
  }

  if (typeof role === "object") {
    if (typeof role.name === "string") {
      return role.name.trim();
    }

    if (typeof role.key === "string") {
      return role.key.trim();
    }

    if (typeof role.role === "string") {
      return role.role.trim();
    }
  }

  return null;
};

// A fixed role is shown with its official spelling.
// Every other role is shown exactly as the administrator
// named it. No role is renamed or treated as another role.
const normalizeRole = (backendRole) => {
  const roleValue = extractRoleValue(backendRole);

  if (!roleValue) {
    return null;
  }

  return (
    FIXED_ROLE_LOOKUP.get(roleKey(roleValue)) ||
    roleValue
  );
};

// =========================================================
// BACKEND PERMISSION NORMALIZATION
// =========================================================
//
// PostgreSQL role_permissions is authoritative.
//
// IMPORTANT:
// - [] means ZERO permissions.
// - An explicitly supplied backend permission array must NEVER
//   fall back to static frontend role permissions.
// - A missing permission field also yields [] (fail closed).
//   No static role fallback is applied here, and the role
//   name never grants access by itself.
//

const normalizePermissions = (user) => {
  if (!user) {
    return [];
  }

  let backendPermissions = null;

  if (Array.isArray(user.role_permissions)) {
    backendPermissions = user.role_permissions;
  } else if (Array.isArray(user.permissions)) {
    backendPermissions = user.permissions;
  } else if (
    user.role &&
    typeof user.role === "object" &&
    Array.isArray(user.role.permissions)
  ) {
    backendPermissions = user.role.permissions;
  }

  // Backend explicitly supplied permissions.
  // Preserve [] exactly as zero permissions.
  if (backendPermissions !== null) {
    return [
      ...new Set(
        backendPermissions
          .map((permission) => {
            if (typeof permission === "string") {
              return permission.trim().toLowerCase();
            }

            if (
              permission &&
              typeof permission === "object" &&
              typeof permission.key === "string"
            ) {
              return permission.key.trim().toLowerCase();
            }

            if (
              permission &&
              typeof permission === "object" &&
              typeof permission.permission === "string"
            ) {
              return permission.permission.trim().toLowerCase();
            }

            if (
              permission &&
              typeof permission === "object" &&
              typeof permission.name === "string"
            ) {
              return permission.name.trim().toLowerCase();
            }

            return null;
          })
          .filter(Boolean)
      ),
    ];
  }

  return [];
};

// =========================================================
// BUILD FRONTEND SESSION USER
// =========================================================

const buildSessionUser = (user, session) => {
  if (!user || !session) {
    return null;
  }

  const normalizedRole = normalizeRole(
    user.role || user.backendRole || user.employeeRole
  );

  const permissions = normalizePermissions(user);

  const username =
    user.username ||
    user.admin_id ||
    user.adminId ||
    "";

  const fullName =
    user.full_name ||
    user.name ||
    user.employee_name ||
    username;

  return {
    id: user.id,

    adminId: username,

    username,

    name: fullName,

    full_name: fullName,

    email: user.email || "",

    role: normalizedRole,

    backendRole:
      extractRoleValue(user.role) ||
      user.backendRole ||
      normalizedRole,

    permissions,

    status:
      user.is_active === false
        ? "Inactive"
        : "Active",

    is_active: user.is_active !== false,

    sessionId: session.sessionId,
  };
};

// =========================================================
// READABLE ERROR
// =========================================================

const getReadableErrorMessage = (error) => {
  if (!error) {
    return "Authentication failed.";
  }

  if (typeof error === "string") {
    return error;
  }

  if (
    typeof error.message === "string" &&
    error.message.trim()
  ) {
    return error.message;
  }

  if (
    typeof error.detail === "string" &&
    error.detail.trim()
  ) {
    return error.detail;
  }

  if (Array.isArray(error.detail)) {
    const messages = error.detail
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }

        if (
          item &&
          typeof item.msg === "string"
        ) {
          return item.msg;
        }

        if (
          item &&
          typeof item.message === "string"
        ) {
          return item.message;
        }

        return null;
      })
      .filter(Boolean);

    if (messages.length > 0) {
      return messages.join(", ");
    }
  }

  if (
    error.response &&
    typeof error.response === "object"
  ) {
    return getReadableErrorMessage(error.response);
  }

  if (
    error.data &&
    typeof error.data === "object"
  ) {
    return getReadableErrorMessage(error.data);
  }

  try {
    const serialized = JSON.stringify(error);

    if (
      serialized &&
      serialized !== "{}"
    ) {
      return serialized;
    }
  } catch {
    // Ignore serialization errors.
  }

  return "Authentication failed.";
};

// =========================================================
// SESSION REJECTED BY BACKEND
// =========================================================
//
// api.js throws errors that carry `status`.
//
// 401 = JWT missing, invalid, expired or revoked.
// 403 = authenticated identity refused (for example a
//       disabled account). /auth/me should not need any
//       module permission, so 403 here means "not allowed
//       to hold a session".
//
// Network failures (status 0) and server errors (5xx) are
// NOT rejections. The session is kept and no new
// permissions are granted.
//

const isSessionRejected = (error) => {
  if (!error) {
    return false;
  }

  return (
    error.status === 401 ||
    error.status === 403 ||
    error.isUnauthorized === true ||
    error.isForbidden === true
  );
};

// =========================================================
// REQUEST CURRENT BACKEND USER (THROWS ON FAILURE)
// =========================================================
//
// Always retrieve /auth/me through the centralized API
// service so the same API configuration and JWT handling
// are used throughout the application.
//
// Returns null only when there is no token or the response
// is empty. API errors are thrown so callers can tell a
// rejected token apart from a temporary failure.
//

const requestCurrentBackendUser = async () => {
  const token = sessionStorage.getItem(
    ACCESS_TOKEN_KEY
  );

  if (!token) {
    return null;
  }

  const response = await apiGet("/auth/me");

  if (!response) {
    console.error(
      "GET /auth/me returned an empty response."
    );

    return null;
  }

  return response;
};

// =========================================================
// GET CURRENT BACKEND USER (NULL ON FAILURE)
// =========================================================
//
// Used by login(), which only needs success or failure.
//

const fetchCurrentBackendUser = async () => {
  try {
    return await requestCurrentBackendUser();
  } catch (error) {
    console.error(
      "Unable to retrieve current backend user:",
      error
    );

    return null;
  }
};

// =========================================================
// LOGIN
// =========================================================

export const login = async (
  identifier,
  password
) => {
  const value = String(identifier || "").trim();

  if (!value || !password) {
    return {
      success: false,
      message: "Please enter Admin ID and Password.",
      user: null,
    };
  }

  try {
    // -------------------------------------------------------
    // 1. Authenticate with backend
    // -------------------------------------------------------

    const tokenResponse = await apiPost(
      "/auth/login",
      {
        username: value,
        password: String(password),
      }
    );

    if (
      !tokenResponse ||
      !tokenResponse.access_token
    ) {
      return {
        success: false,
        message: "Authentication token was not returned.",
        user: null,
      };
    }

    // -------------------------------------------------------
    // 2. Store JWT in this browser tab
    // -------------------------------------------------------

    sessionStorage.setItem(
      ACCESS_TOKEN_KEY,
      tokenResponse.access_token
    );

    // -------------------------------------------------------
    // 3. Retrieve authoritative backend user
    // -------------------------------------------------------

    const currentUser =
      await fetchCurrentBackendUser();

    if (!currentUser) {
      sessionStorage.removeItem(
        ACCESS_TOKEN_KEY
      );

      return {
        success: false,
        message:
          "Unable to retrieve authenticated user.",
        user: null,
      };
    }

    // -------------------------------------------------------
    // 4. Reject disabled accounts
    // -------------------------------------------------------

    if (currentUser.is_active === false) {
      sessionStorage.removeItem(
        ACCESS_TOKEN_KEY
      );

      return {
        success: false,
        message:
          "This employee account is inactive.",
        user: null,
      };
    }

    // -------------------------------------------------------
    // 5. Normalize backend user
    // -------------------------------------------------------

    const normalizedRole = normalizeRole(
      currentUser.role
    );

    const frontendUser = {
      id: currentUser.id,

      username:
        currentUser.username ||
        currentUser.admin_id ||
        currentUser.adminId ||
        value,

      email: currentUser.email || "",

      full_name:
        currentUser.full_name ||
        currentUser.name ||
        currentUser.employee_name ||
        currentUser.username ||
        value,

      role: normalizedRole,

      backendRole:
        extractRoleValue(currentUser.role),

      // Backend permissions are authoritative.
      permissions:
        normalizePermissions(currentUser),

      is_active:
        currentUser.is_active !== false,
    };

    // -------------------------------------------------------
    // 6. Create tab-specific session
    // -------------------------------------------------------

    const session = createSession({
      id: frontendUser.id,

      adminId: frontendUser.username,

      username: frontendUser.username,

      name: frontendUser.full_name,

      email: frontendUser.email,

      role: frontendUser.role,

      permissions: frontendUser.permissions,
    });

    if (!session) {
      sessionStorage.removeItem(
        ACCESS_TOKEN_KEY
      );

      return {
        success: false,
        message: "Unable to create user session.",
        user: null,
      };
    }

    // -------------------------------------------------------
    // 7. Build final session user
    // -------------------------------------------------------

    const sessionUser = buildSessionUser(
      frontendUser,
      session
    );

    if (!sessionUser) {
      destroySession();

      sessionStorage.removeItem(
        ACCESS_TOKEN_KEY
      );

      return {
        success: false,
        message:
          "Unable to create authenticated user.",
        user: null,
      };
    }

    // -------------------------------------------------------
    // 8. Compatibility authentication flag
    // -------------------------------------------------------

    localStorage.setItem(
      AUTH_STORAGE_KEY,
      "true"
    );

    // -------------------------------------------------------
    // 9. Store current user in this browser tab
    // -------------------------------------------------------

    sessionStorage.setItem(
      CURRENT_USER_KEY,
      JSON.stringify(sessionUser)
    );

    // -------------------------------------------------------
    // 10. Start heartbeat
    // -------------------------------------------------------

    startSessionHeartbeat();

    return {
      success: true,
      message: "Login successful.",
      user: sessionUser,
    };
  } catch (error) {
    console.error(
      "Backend login failed:",
      error
    );

    sessionStorage.removeItem(
      ACCESS_TOKEN_KEY
    );

    const readableMessage =
      getReadableErrorMessage(error);

    return {
      success: false,
      message: readableMessage,
      user: null,
    };
  }
};

// =========================================================
// REFRESH CURRENT USER FROM BACKEND
// =========================================================
//
// Used by AdminLayout to synchronize dynamic RBAC.
//
// If Port Administrator changes a role's permissions,
// the next refresh retrieves the new PostgreSQL
// role_permissions values.
//
// Failure policy:
// - 401 / 403 from /auth/me  -> the backend rejected this
//   session. Log out (fail closed).
// - Network error / 5xx      -> temporary. Keep the current
//   session and its CURRENT permissions. Nothing is added.
//

export const refreshCurrentUser = async () => {
  let backendUser = null;

  try {
    backendUser = await requestCurrentBackendUser();
  } catch (error) {
    if (isSessionRejected(error)) {
      console.warn(
        "Session rejected by backend. Logging out."
      );

      logout();
      return null;
    }

    console.error(
      "Temporary failure refreshing current user:",
      error
    );

    return null;
  }

  if (!backendUser) {
    return null;
  }

  if (backendUser.is_active === false) {
    logout();
    return null;
  }

  const existingSession =
    getCurrentSession();

  if (!existingSession) {
    return null;
  }

  const normalizedRole = normalizeRole(
    backendUser.role
  );

  const refreshedUser = {
    id: backendUser.id,

    username:
      backendUser.username ||
      backendUser.admin_id ||
      backendUser.adminId ||
      "",

    email: backendUser.email || "",

    full_name:
      backendUser.full_name ||
      backendUser.name ||
      backendUser.employee_name ||
      backendUser.username ||
      "",

    role: normalizedRole,

    backendRole:
      extractRoleValue(backendUser.role),

    // IMPORTANT:
    // An explicit [] remains [].
    permissions:
      normalizePermissions(backendUser),

    is_active:
      backendUser.is_active !== false,
  };

  const sessionUser = buildSessionUser(
    refreshedUser,
    existingSession
  );

  if (!sessionUser) {
    return null;
  }

  // Update only this tab's stored user.
  sessionStorage.setItem(
    CURRENT_USER_KEY,
    JSON.stringify(sessionUser)
  );

  // Keep active-session registry synchronized.
  updateCurrentSession({
    id: sessionUser.id,
    adminId: sessionUser.adminId,
    username: sessionUser.username,
    name: sessionUser.name,
    email: sessionUser.email,
    role: sessionUser.role,
    permissions: sessionUser.permissions,
  });

  return sessionUser;
};

// =========================================================
// LOGOUT
// =========================================================

export const logout = () => {
  try {
    stopSessionHeartbeat();

    // Removes only this browser tab's session.
    destroySession();

    sessionStorage.removeItem(
      CURRENT_USER_KEY
    );

    sessionStorage.removeItem(
      ACCESS_TOKEN_KEY
    );

    // Compatibility flag only.
    //
    // Authentication itself is determined by this tab's
    // sessionStorage JWT + current user.
    localStorage.removeItem(
      AUTH_STORAGE_KEY
    );

    return true;
  } catch (error) {
    console.error(
      "Logout failed:",
      error
    );

    return false;
  }
};

// =========================================================
// AUTHENTICATION STATUS
// =========================================================

export const isAuthenticated = () => {
  const token =
    sessionStorage.getItem(
      ACCESS_TOKEN_KEY
    );

  const currentUser =
    sessionStorage.getItem(
      CURRENT_USER_KEY
    );

  return !!token && !!currentUser;
};

// =========================================================
// CURRENT USER
// =========================================================

export const getCurrentUser = () => {
  try {
    const storedUser =
      sessionStorage.getItem(
        CURRENT_USER_KEY
      );

    if (!storedUser) {
      return null;
    }

    return JSON.parse(storedUser);
  } catch (error) {
    console.error(
      "Unable to retrieve current user:",
      error
    );

    return null;
  }
};

// =========================================================
// CURRENT SESSION
// =========================================================

export const getSession = () => {
  try {
    return getCurrentSession();
  } catch (error) {
    console.error(
      "Unable to retrieve session:",
      error
    );

    return null;
  }
};

// =========================================================
// ACCESS TOKEN
// =========================================================

export const getAccessToken = () => {
  return sessionStorage.getItem(
    ACCESS_TOKEN_KEY
  );
};

// =========================================================
// CURRENT USER PERMISSIONS
// =========================================================

export const getCurrentUserPermissions = () => {
  const user = getCurrentUser();

  if (!user) {
    return [];
  }

  return getUserPermissions(user);
};

// =========================================================
// PERMISSION CHECK
// =========================================================

export const hasPermission = (
  permission
) => {
  const user = getCurrentUser();

  if (!user) {
    return false;
  }

  return userHasPermission(
    user,
    permission
  );
};

// =========================================================
// MULTIPLE PERMISSION CHECK
// =========================================================

export const hasPermissions = (
  permissions,
  mode = "ALL"
) => {
  const user = getCurrentUser();

  if (!user) {
    return false;
  }

  return userHasPermissions(
    user,
    permissions,
    mode
  );
};

// =========================================================
// INITIALIZE AUTHENTICATION
// =========================================================

export const initializeAuth = () => {
  try {
    initializeSessionManager();

    const authenticated =
      isAuthenticated();

    if (authenticated) {
      startSessionHeartbeat();
    }

    return authenticated;
  } catch (error) {
    console.error(
      "Authentication initialization failed:",
      error
    );

    return false;
  }
};

// =========================================================
// DEFAULT EXPORT
// =========================================================

const authService = {
  login,
  logout,
  isAuthenticated,
  getCurrentUser,
  getSession,
  getAccessToken,
  getCurrentUserPermissions,
  hasPermission,
  hasPermissions,
  refreshCurrentUser,
  initializeAuth,
};

export default authService;