import users from "./users";

import {
  getRolePermissions,
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
} from "./sessionManager";

const AUTH_STORAGE_KEY = "karwarPortAuthenticated";
const CURRENT_USER_KEY = "karwarPortCurrentUser";

// ---------------------------------------------------------
// Find User
// ---------------------------------------------------------

export const findUser = (identifier) => {
  const value = String(identifier || "")
    .trim()
    .toLowerCase();

  if (!value) {
    return null;
  }

  return (
    users.find((user) => {
      const adminId = String(user.adminId || "")
        .trim()
        .toLowerCase();

      const email = String(user.email || "")
        .trim()
        .toLowerCase();

      return adminId === value || email === value;
    }) || null
  );
};

// ---------------------------------------------------------
// Build Session User
// ---------------------------------------------------------

const buildSessionUser = (user, session) => {
  if (!user || !session) {
    return null;
  }

  return {
    id: user.id,
    adminId: user.adminId,
    name: user.name,
    email: user.email,
    role: user.role,
    department: user.department,
    status: "Active",
    sessionId: session.sessionId,
  };
};

// ---------------------------------------------------------
// Login
// ---------------------------------------------------------

export const login = (identifier, password) => {
  const user = findUser(identifier);

  if (!user) {
    return {
      success: false,
      message: "Invalid Admin ID or Password.",
      user: null,
    };
  }

  // -------------------------------------------------------
  // Account status
  // -------------------------------------------------------

  if (user.enabled !== true) {
    return {
      success: false,
      message: "This account is currently inactive.",
      user: null,
    };
  }

  // -------------------------------------------------------
  // Password
  // -------------------------------------------------------

  if (
    String(user.password || "") !==
    String(password || "")
  ) {
    return {
      success: false,
      message: "Invalid Admin ID or Password.",
      user: null,
    };
  }

  // -------------------------------------------------------
  // Create tab-specific session
  // -------------------------------------------------------

  const session = createSession(user);

  if (!session) {
    return {
      success: false,
      message: "Unable to create user session.",
      user: null,
    };
  }

  const sessionUser = buildSessionUser(user, session);

  // -------------------------------------------------------
  // Authentication compatibility flag
  // -------------------------------------------------------

  localStorage.setItem(
    AUTH_STORAGE_KEY,
    "true"
  );

  // -------------------------------------------------------
  // Current user belongs only to this browser tab
  // -------------------------------------------------------

  sessionStorage.setItem(
    CURRENT_USER_KEY,
    JSON.stringify(sessionUser)
  );

  // -------------------------------------------------------
  // Start session heartbeat
  // -------------------------------------------------------

  startSessionHeartbeat();

  return {
    success: true,
    message: "Login successful.",
    user: sessionUser,
  };
};

// ---------------------------------------------------------
// Logout
// ---------------------------------------------------------

export const logout = () => {
  // Remove only this browser tab's session.
  destroySession();

  // Stop heartbeat for this tab.
  stopSessionHeartbeat();

  // Remove current user information from this tab.
  sessionStorage.removeItem(CURRENT_USER_KEY);

  // Authentication flag is only for compatibility.
  localStorage.removeItem(AUTH_STORAGE_KEY);
};

// ---------------------------------------------------------
// Authentication Check
// ---------------------------------------------------------

export const isAuthenticated = () => {
  const session = getCurrentSession();

  if (!session) {
    // Clean stale browser state.
    sessionStorage.removeItem(CURRENT_USER_KEY);
    localStorage.removeItem(AUTH_STORAGE_KEY);

    return false;
  }

  return true;
};

// ---------------------------------------------------------
// Current User
// ---------------------------------------------------------

export const getCurrentUser = () => {
  const session = getCurrentSession();

  if (!session) {
    sessionStorage.removeItem(CURRENT_USER_KEY);
    return null;
  }

  // -------------------------------------------------------
  // Try existing tab-specific user
  // -------------------------------------------------------

  const storedUser =
    sessionStorage.getItem(CURRENT_USER_KEY);

  if (storedUser) {
    try {
      const parsedUser = JSON.parse(storedUser);

      // Make sure the stored user belongs to
      // the current session.
      if (
        parsedUser &&
        parsedUser.sessionId === session.sessionId
      ) {
        return {
          ...parsedUser,
          status: "Active",
        };
      }

      // Remove stale user data.
      sessionStorage.removeItem(CURRENT_USER_KEY);
    } catch (error) {
      sessionStorage.removeItem(CURRENT_USER_KEY);
    }
  }

  // -------------------------------------------------------
  // Rebuild user from current session
  // -------------------------------------------------------

  const user = findUser(session.adminId);

  if (!user || user.enabled !== true) {
    return null;
  }

  const sessionUser = buildSessionUser(user, session);

  sessionStorage.setItem(
    CURRENT_USER_KEY,
    JSON.stringify(sessionUser)
  );

  return sessionUser;
};

// ---------------------------------------------------------
// Current Role
// ---------------------------------------------------------

export const getCurrentUserRole = () => {
  const user = getCurrentUser();

  return user?.role || null;
};

// ---------------------------------------------------------
// Current Department
// ---------------------------------------------------------

export const getCurrentUserDepartment = () => {
  const user = getCurrentUser();

  return user?.department || null;
};

// ---------------------------------------------------------
// Current Permissions
// ---------------------------------------------------------

export const getCurrentUserPermissions = () => {
  const user = getCurrentUser();

  if (!user) {
    return [];
  }

  return getRolePermissions(user.role);
};

// ---------------------------------------------------------
// Permission Check
// ---------------------------------------------------------

export const can = (permission) => {
  const user = getCurrentUser();

  if (!user) {
    return false;
  }

  return userHasPermission(
    user,
    permission
  );
};

// ---------------------------------------------------------
// ALL Permissions
// ---------------------------------------------------------

export const canAll = (permissions = []) => {
  const user = getCurrentUser();

  if (!user) {
    return false;
  }

  return userHasPermissions(
    user,
    permissions,
    "ALL"
  );
};

// ---------------------------------------------------------
// ANY Permission
// ---------------------------------------------------------

export const canAny = (permissions = []) => {
  const user = getCurrentUser();

  if (!user) {
    return false;
  }

  return userHasPermissions(
    user,
    permissions,
    "ANY"
  );
};

// ---------------------------------------------------------
// Role Check
// ---------------------------------------------------------

export const hasRole = (role) => {
  return getCurrentUserRole() === role;
};

// ---------------------------------------------------------
// Multiple Role Check
// ---------------------------------------------------------

export const hasAnyRole = (roles = []) => {
  const currentRole = getCurrentUserRole();

  return Array.isArray(roles)
    ? roles.includes(currentRole)
    : false;
};

// ---------------------------------------------------------
// Update Current User
// ---------------------------------------------------------

export const updateCurrentUser = (updates = {}) => {
  const currentUser = getCurrentUser();

  if (!currentUser) {
    return null;
  }

  const safeUpdates = {
    ...updates,
  };

  // Never allow password information to enter
  // the current browser session.
  delete safeUpdates.password;

  const updatedUser = {
    ...currentUser,
    ...safeUpdates,
    status: "Active",
    sessionId: currentUser.sessionId,
  };

  sessionStorage.setItem(
    CURRENT_USER_KEY,
    JSON.stringify(updatedUser)
  );

  return updatedUser;
};

// ---------------------------------------------------------
// Clear Session
// ---------------------------------------------------------

export const clearSession = () => {
  logout();
};

// ---------------------------------------------------------
// Initialize Authentication
// ---------------------------------------------------------

export const initializeAuth = () => {
  initializeSessionManager();

  const session = getCurrentSession();

  if (!session) {
    sessionStorage.removeItem(CURRENT_USER_KEY);
    localStorage.removeItem(AUTH_STORAGE_KEY);
    stopSessionHeartbeat();
    return;
  }

  // Restore authentication state for this tab.
  localStorage.setItem(
    AUTH_STORAGE_KEY,
    "true"
  );

  // Restore the current user if necessary.
  getCurrentUser();

  // Restore heartbeat.
  startSessionHeartbeat();
};

// ---------------------------------------------------------
// Default Export
// ---------------------------------------------------------

const authService = {
  login,
  logout,
  isAuthenticated,
  getCurrentUser,
  getCurrentUserRole,
  getCurrentUserDepartment,
  getCurrentUserPermissions,
  findUser,
  can,
  canAll,
  canAny,
  hasRole,
  hasAnyRole,
  updateCurrentUser,
  clearSession,
  initializeAuth,
};

export default authService;