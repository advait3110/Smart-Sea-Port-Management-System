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
// KEEPING THE LOGIN ALIVE (AUTOMATIC SIGN-OUT PROTECTION)
// =========================================================
//
// The admin layout asks the backend "is this login still
// valid?" every few seconds (refreshCurrentUser below).
//
// Before this protection, the very first "no" from the
// backend signed the person out at once, with no second try
// and no message. That is why the app seemed to sign people
// out "suddenly": the login token simply ran out while they
// were working.
//
// Now:
// 1. While the person is working, the token is renewed
//    quietly before it runs out (POST /auth/refresh).
// 2. A "no" from the backend is checked once more before
//    anybody is signed out.
// 3. If a real sign-out still has to happen, a short message
//    says why.
//

// When no "issued at" time is inside the token, renew once
// less than this much time is left.
const RENEW_FALLBACK_LEFT_MS = 10 * 60 * 1000;

// Renew once less than this share of the token's life is left.
const RENEW_LEFT_SHARE = 0.5;

// How long to wait before the second check of a "no".
const RECHECK_DELAY_MS = 2000;

// How long the "you were signed out" message stays visible.
const SIGNED_OUT_NOTICE_MS = 12000;

const SIGNED_OUT_NOTICE_ID = "port-signed-out-notice";

const wait = (milliseconds) =>
  new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });

// Reads the "expires at" and "issued at" times from the token.
// Returns null when the token cannot be read.
const readTokenTimes = (token) => {
  try {
    const payloadPart = String(token || "").split(".")[1];

    if (!payloadPart) {
      return null;
    }

    const base64 = payloadPart
      .replace(/-/g, "+")
      .replace(/_/g, "/");

    const padded =
      base64 +
      "=".repeat((4 - (base64.length % 4)) % 4);

    const payload = JSON.parse(window.atob(padded));

    if (typeof payload.exp !== "number") {
      return null;
    }

    return {
      expiresAt: payload.exp * 1000,
      issuedAt:
        typeof payload.iat === "number"
          ? payload.iat * 1000
          : null,
    };
  } catch {
    return null;
  }
};

let tokenRenewal = null;

// Gets a fresh token from the backend when the current one is
// getting old. Never signs anybody out: if renewing fails,
// the normal check that follows decides what happens.
const renewTokenIfNeeded = async () => {
  if (tokenRenewal) {
    return tokenRenewal;
  }

  const token = sessionStorage.getItem(
    ACCESS_TOKEN_KEY
  );

  const times = readTokenTimes(token);

  if (!times) {
    return null;
  }

  const timeLeft = times.expiresAt - Date.now();

  // Already run out: renewing cannot work any more.
  if (timeLeft <= 0) {
    return null;
  }

  const threshold = times.issuedAt
    ? (times.expiresAt - times.issuedAt) *
      RENEW_LEFT_SHARE
    : RENEW_FALLBACK_LEFT_MS;

  if (timeLeft > threshold) {
    return null;
  }

  tokenRenewal = (async () => {
    try {
      const response = await apiPost(
        "/auth/refresh",
        {}
      );

      const newToken = response?.access_token;

      // Only store it if this tab still holds the same login.
      if (
        newToken &&
        sessionStorage.getItem(ACCESS_TOKEN_KEY) ===
          token
      ) {
        sessionStorage.setItem(
          ACCESS_TOKEN_KEY,
          newToken
        );
      }
    } catch (error) {
      console.warn(
        "Could not renew the login token:",
        error
      );
    } finally {
      tokenRenewal = null;
    }

    return null;
  })();

  return tokenRenewal;
};

// A short message at the top of the screen. It is added to the
// page itself (not to one screen), so it stays visible while the
// app moves to the sign-in page.
const showSignedOutNotice = (message) => {
  try {
    if (typeof document === "undefined") {
      return;
    }

    const existing = document.getElementById(
      SIGNED_OUT_NOTICE_ID
    );

    if (existing) {
      existing.remove();
    }

    const box = document.createElement("div");

    box.id = SIGNED_OUT_NOTICE_ID;
    box.setAttribute("role", "alert");
    box.textContent = message;

    Object.assign(box.style, {
      position: "fixed",
      top: "16px",
      left: "50%",
      transform: "translateX(-50%)",
      zIndex: "99999",
      maxWidth: "90vw",
      padding: "12px 20px",
      borderRadius: "12px",
      background: "#1b2559",
      color: "#ffffff",
      fontSize: "14px",
      fontWeight: "600",
      lineHeight: "1.4",
      boxShadow: "0 10px 30px rgba(0, 0, 0, 0.25)",
      cursor: "pointer",
    });

    box.addEventListener("click", () => {
      box.remove();
    });

    document.body.appendChild(box);

    window.setTimeout(() => {
      box.remove();
    }, SIGNED_OUT_NOTICE_MS);
  } catch {
    // The message is a courtesy. Never let it break sign-out.
  }
};

// Turns the backend's "no" into a sentence the person can read.
const explainRejection = (error) => {
  const text = String(
    getReadableErrorMessage(error) || ""
  ).toLowerCase();

  if (text.includes("expired")) {
    return "Your login has expired, so you were signed out. Please sign in again.";
  }

  if (text.includes("inactive")) {
    return "Your account has been made inactive. Please contact the Port Administrator.";
  }

  if (text.includes("does not exist")) {
    return "Your account no longer exists. Please contact the Port Administrator.";
  }

  if (text.includes("valid role")) {
    return "Your account has no role assigned. Please contact the Port Administrator.";
  }

  return "You were signed out because the server no longer accepted your login. Please sign in again.";
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
//   session. It is asked ONE more time a moment later. If it
//   says no again, log out (fail closed) and show a message
//   that says why.
// - Network error / 5xx      -> temporary. Keep the current
//   session and its CURRENT permissions. Nothing is added.
//
// While the person is working, the login token is renewed
// quietly before it runs out, so it does not expire under
// them.
//

// The backend said "no". Ask once more before signing anybody
// out. Returns the user when the second answer is "yes";
// returns null when the person was signed out or when the
// second try failed for a temporary reason.
const confirmRejection = async (firstError) => {
  const rejectedToken = sessionStorage.getItem(
    ACCESS_TOKEN_KEY
  );

  console.warn(
    "Backend refused this login. Checking once more before signing out.",
    firstError
  );

  await wait(RECHECK_DELAY_MS);

  // The person signed out, or signed in again, in the
  // meantime. There is nothing left to decide.
  if (
    sessionStorage.getItem(ACCESS_TOKEN_KEY) !==
    rejectedToken
  ) {
    return null;
  }

  try {
    return await requestCurrentBackendUser();
  } catch (secondError) {
    if (isSessionRejected(secondError)) {
      console.warn(
        "Session rejected by backend twice. Logging out.",
        secondError
      );

      logout();
      showSignedOutNotice(
        explainRejection(secondError)
      );

      return null;
    }

    console.error(
      "Temporary failure refreshing current user:",
      secondError
    );

    return null;
  }
};

export const refreshCurrentUser = async () => {
  let backendUser = null;

  // Renew the login first if it is getting old.
  await renewTokenIfNeeded();

  try {
    backendUser = await requestCurrentBackendUser();
  } catch (error) {
    if (isSessionRejected(error)) {
      backendUser = await confirmRejection(error);

      if (!backendUser) {
        return null;
      }
    } else {
      console.error(
        "Temporary failure refreshing current user:",
        error
      );

      return null;
    }
  }

  if (!backendUser) {
    return null;
  }

  if (backendUser.is_active === false) {
    logout();

    showSignedOutNotice(
      "Your account has been made inactive. Please contact the Port Administrator."
    );

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

// The address of the FastAPI backend (the same one services/api.js
// uses).
const PRESENCE_API_BASE_URL = (() => {
  try {
    return (
      process.env.REACT_APP_API_BASE_URL ||
      "http://127.0.0.1:8000"
    );
  } catch {
    return "http://127.0.0.1:8000";
  }
})();

// Tells the server that this account has logged out, so User & Role
// Management shows it as Offline at once (instead of after about
// 90 seconds). It is sent with the login of this tab BEFORE that
// login is removed. "keepalive" lets it finish even though the page
// moves on to the login screen. If it fails, the account still turns
// Offline by itself after about 90 seconds.
const tellServerLoggedOut = () => {
  try {
    const token = sessionStorage.getItem(ACCESS_TOKEN_KEY);

    if (!token || typeof fetch !== "function") {
      return;
    }

    fetch(`${PRESENCE_API_BASE_URL}/presence/logout`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      keepalive: true,
    }).catch(() => {
      // Not important: see above.
    });
  } catch {
    // Not important: see above.
  }
};

export const logout = () => {
  try {
    tellServerLoggedOut();

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