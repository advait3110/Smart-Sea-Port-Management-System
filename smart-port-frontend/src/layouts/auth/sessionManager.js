// =========================================================
// KARWAR PORT
// SESSION MANAGER
// =========================================================

const ACTIVE_SESSIONS_KEY = "karwarPortActiveSessions";
const CURRENT_SESSION_KEY = "karwarPortCurrentSession";

// Current session is tab-specific.
// Shared active-session registry is kept in localStorage.

const HEARTBEAT_INTERVAL = 10000;
const SESSION_TIMEOUT = 30000;

let heartbeatTimer = null;
let storageListenerAttached = false;

// =========================================================
// STORAGE HELPERS
// =========================================================

const getStorage = (storageType) => {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return storageType === "session"
      ? window.sessionStorage
      : window.localStorage;
  } catch (error) {
    console.error(
      "Unable to access browser storage:",
      error
    );

    return null;
  }
};

// =========================================================
// CREATE SESSION ID
// =========================================================

const createSessionId = () => {
  return `${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
};

// =========================================================
// READ ACTIVE SESSIONS
// =========================================================

const readSessions = () => {
  try {
    const storage = getStorage("local");

    if (!storage) {
      return [];
    }

    const stored = storage.getItem(
      ACTIVE_SESSIONS_KEY
    );

    if (!stored) {
      return [];
    }

    const sessions = JSON.parse(stored);

    return Array.isArray(sessions)
      ? sessions
      : [];
  } catch (error) {
    console.error(
      "Unable to read active sessions:",
      error
    );

    return [];
  }
};

// =========================================================
// WRITE ACTIVE SESSIONS
// =========================================================

const writeSessions = (sessions) => {
  try {
    const storage = getStorage("local");

    if (!storage) {
      return;
    }

    storage.setItem(
      ACTIVE_SESSIONS_KEY,
      JSON.stringify(
        Array.isArray(sessions)
          ? sessions
          : []
      )
    );
  } catch (error) {
    console.error(
      "Unable to write active sessions:",
      error
    );
  }
};

// =========================================================
// REMOVE EXPIRED SESSIONS
// =========================================================

const removeExpiredSessions = (
  sessions = readSessions()
) => {
  const now = Date.now();

  const activeSessions = sessions.filter(
    (session) => {
      const lastActivity = Number(
        session?.lastActivity || 0
      );

      return (
        lastActivity > 0 &&
        now - lastActivity <=
          SESSION_TIMEOUT
      );
    }
  );

  if (
    activeSessions.length !==
    sessions.length
  ) {
    writeSessions(activeSessions);
  }

  return activeSessions;
};

// =========================================================
// CREATE SESSION
// =========================================================

export const createSession = (user = {}) => {
  try {
    const now = Date.now();

    const session = {
      sessionId: createSessionId(),

      id: user.id,

      userId: user.id,

      user_id: user.id,

      adminId:
        user.adminId ||
        user.username ||
        "",

      username:
        user.username ||
        user.adminId ||
        "",

      email: user.email || "",

      name:
        user.name ||
        user.full_name ||
        user.username ||
        "",

      full_name:
        user.full_name ||
        user.name ||
        "",

      role:
        user.role ||
        user.employeeRole ||
        "",

      department:
        user.department || "",

      permissions: Array.isArray(
        user.permissions
      )
        ? [...user.permissions]
        : [],

      createdAt: now,

      lastActivity: now,
    };

    const sessions =
      removeExpiredSessions();

    // -------------------------------------------------------
    // Remove older session belonging to the SAME USER.
    //
    // Do NOT remove sessions belonging to another user.
    // -------------------------------------------------------

    const filteredSessions =
      sessions.filter((item) => {
        const existingUsername =
          String(
            item?.username ||
              item?.adminId ||
              ""
          )
            .trim()
            .toLowerCase();

        const newUsername =
          String(
            session?.username ||
              session?.adminId ||
              ""
          )
            .trim()
            .toLowerCase();

        const existingUserId =
          String(
            item?.userId ??
              item?.user_id ??
              item?.id ??
              ""
          ).trim();

        const newUserId =
          String(
            session?.userId ??
              session?.user_id ??
              session?.id ??
              ""
          ).trim();

        const sameUsername =
          existingUsername &&
          newUsername &&
          existingUsername ===
            newUsername;

        const sameUserId =
          existingUserId &&
          newUserId &&
          existingUserId === newUserId;

        return !(
          sameUsername ||
          sameUserId
        );
      });

    const updatedSessions = [
      ...filteredSessions,
      session,
    ];

    writeSessions(updatedSessions);

    // -------------------------------------------------------
    // Current session belongs ONLY to this browser tab.
    // -------------------------------------------------------

    const sessionStorage =
      getStorage("session");

    if (sessionStorage) {
      sessionStorage.setItem(
        CURRENT_SESSION_KEY,
        JSON.stringify(session)
      );
    }

    return session;
  } catch (error) {
    console.error(
      "Unable to create session:",
      error
    );

    return null;
  }
};

// =========================================================
// GET CURRENT SESSION
// =========================================================

export const getCurrentSession = () => {
  try {
    const storage = getStorage("session");

    if (!storage) {
      return null;
    }

    const stored =
      storage.getItem(
        CURRENT_SESSION_KEY
      );

    if (!stored) {
      return null;
    }

    const session = JSON.parse(stored);

    if (!session?.sessionId) {
      storage.removeItem(
        CURRENT_SESSION_KEY
      );

      return null;
    }

    return session;
  } catch (error) {
    console.error(
      "Unable to retrieve current session:",
      error
    );

    return null;
  }
};

// =========================================================
// UPDATE CURRENT SESSION
// =========================================================
//
// Updates the active registry AND this tab's
// sessionStorage copy.
//
// Optional updates are used when backend RBAC
// permissions are refreshed.
// =========================================================

export const updateCurrentSession = (
  updates = {}
) => {
  const currentSession =
    getCurrentSession();

  if (!currentSession?.sessionId) {
    return null;
  }

  const sessions =
    removeExpiredSessions();

  const sessionIndex =
    sessions.findIndex(
      (session) =>
        session?.sessionId ===
        currentSession.sessionId
    );

  // -------------------------------------------------------
  // Current session no longer exists in registry.
  // -------------------------------------------------------

  if (sessionIndex === -1) {
    const sessionStorage =
      getStorage("session");

    if (sessionStorage) {
      sessionStorage.removeItem(
        CURRENT_SESSION_KEY
      );
    }

    return null;
  }

  const updatedSession = {
    ...sessions[sessionIndex],

    ...(updates &&
    typeof updates === "object"
      ? updates
      : {}),

    // Never allow an update to replace
    // the identity of the current session.
    sessionId:
      sessions[sessionIndex].sessionId,

    createdAt:
      sessions[sessionIndex].createdAt,

    lastActivity: Date.now(),
  };

  // Keep identity fields synchronized.
  if (
    updatedSession.id === undefined &&
    updatedSession.userId !== undefined
  ) {
    updatedSession.id =
      updatedSession.userId;
  }

  if (
    updatedSession.userId === undefined &&
    updatedSession.id !== undefined
  ) {
    updatedSession.userId =
      updatedSession.id;
  }

  if (
    updatedSession.user_id === undefined &&
    updatedSession.id !== undefined
  ) {
    updatedSession.user_id =
      updatedSession.id;
  }

  if (!Array.isArray(updatedSession.permissions)) {
    updatedSession.permissions = [];
  }

  sessions[sessionIndex] =
    updatedSession;

  writeSessions(sessions);

  // Update only this browser tab.
  const sessionStorage =
    getStorage("session");

  if (sessionStorage) {
    sessionStorage.setItem(
      CURRENT_SESSION_KEY,
      JSON.stringify(updatedSession)
    );
  }

  return updatedSession;
};

// =========================================================
// DESTROY SESSION
// =========================================================

export const destroySession = () => {
  try {
    const currentSession =
      getCurrentSession();

    const currentSessionId =
      currentSession?.sessionId;

    const sessions = readSessions();

    const remainingSessions =
      currentSessionId
        ? sessions.filter(
            (session) =>
              session?.sessionId !==
              currentSessionId
          )
        : sessions;

    writeSessions(
      remainingSessions
    );

    // Remove only this tab's session.
    const sessionStorage =
      getStorage("session");

    if (sessionStorage) {
      sessionStorage.removeItem(
        CURRENT_SESSION_KEY
      );
    }

    stopSessionHeartbeat();

    return true;
  } catch (error) {
    console.error(
      "Unable to destroy session:",
      error
    );

    return false;
  }
};

// =========================================================
// START SESSION HEARTBEAT
// =========================================================

export const startSessionHeartbeat = () => {
  stopSessionHeartbeat();

  updateCurrentSession();

  if (
    typeof window === "undefined"
  ) {
    return;
  }

  heartbeatTimer =
    window.setInterval(() => {
      updateCurrentSession();
    }, HEARTBEAT_INTERVAL);
};

// =========================================================
// STOP SESSION HEARTBEAT
// =========================================================

export const stopSessionHeartbeat = () => {
  if (
    heartbeatTimer !== null &&
    typeof window !== "undefined"
  ) {
    window.clearInterval(
      heartbeatTimer
    );

    heartbeatTimer = null;
  }
};

// =========================================================
// GET ACTIVE SESSIONS
// =========================================================

export const getActiveSessionsList = () => {
  return removeExpiredSessions();
};

// =========================================================
// GET USER ACTIVE SESSIONS
// =========================================================
//
// Compatibility export used by:
// src/views/admin/Security/index.jsx
// =========================================================

export const getUserActiveSessions = () => {
  return getActiveSessionsList();
};

// =========================================================
// CHECK WHETHER USER IS ACTIVE
// =========================================================

export const isUserActive = (
  userIdentifier
) => {
  if (
    userIdentifier === undefined ||
    userIdentifier === null ||
    String(userIdentifier).trim() === ""
  ) {
    return false;
  }

  const target = String(
    userIdentifier
  )
    .trim()
    .toLowerCase();

  const activeSessions =
    getActiveSessionsList();

  return activeSessions.some(
    (session) => {
      const identifiers = [
        session?.id,
        session?.userId,
        session?.user_id,
        session?.adminId,
        session?.username,
        session?.email,
        session?.name,
        session?.full_name,
      ]
        .filter(
          (value) =>
            value !== undefined &&
            value !== null &&
            String(value).trim() !== ""
        )
        .map((value) =>
          String(value)
            .trim()
            .toLowerCase()
        );

      return identifiers.includes(
        target
      );
    }
  );
};

// =========================================================
// INITIALIZE SESSION MANAGER
// =========================================================

export const initializeSessionManager = () => {
  if (
    typeof window === "undefined"
  ) {
    return;
  }

  removeExpiredSessions();

  if (storageListenerAttached) {
    return;
  }

  const handleStorage = (event) => {
    if (
      event.key ===
      ACTIVE_SESSIONS_KEY
    ) {
      removeExpiredSessions();
    }
  };

  window.addEventListener(
    "storage",
    handleStorage
  );

  storageListenerAttached = true;
};

// =========================================================
// DEFAULT EXPORT
// =========================================================

const sessionManager = {
  createSession,

  getCurrentSession,

  updateCurrentSession,

  destroySession,

  startSessionHeartbeat,

  stopSessionHeartbeat,

  initializeSessionManager,

  getActiveSessionsList,

  getUserActiveSessions,

  isUserActive,
};

export default sessionManager;