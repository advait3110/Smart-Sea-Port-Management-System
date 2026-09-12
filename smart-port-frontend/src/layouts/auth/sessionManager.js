const SESSION_KEY = "karwarPortSession";
const ACTIVE_SESSIONS_KEY = "karwarPortActiveSessions";

const SESSION_TIMEOUT = 60 * 1000; // 1 minute
const HEARTBEAT_INTERVAL = 20 * 1000; // 20 seconds

// ---------------------------------------------------------
// Generate unique session ID
// ---------------------------------------------------------

const generateSessionId = () => {
  return `KP-${Date.now()}-${Math.random()
    .toString(36)
    .substring(2, 10)}`;
};

// ---------------------------------------------------------
// Get current tab's session
// ---------------------------------------------------------

export const getCurrentSession = () => {
  const storedSession = sessionStorage.getItem(SESSION_KEY);

  if (!storedSession) {
    return null;
  }

  try {
    const session = JSON.parse(storedSession);

    if (
      !session ||
      !session.sessionId ||
      !session.userId
    ) {
      sessionStorage.removeItem(SESSION_KEY);
      return null;
    }

    return session;
  } catch (error) {
    console.error(
      "Unable to restore Karwar Port session:",
      error
    );

    sessionStorage.removeItem(SESSION_KEY);
    return null;
  }
};

// ---------------------------------------------------------
// Save current tab's session
// ---------------------------------------------------------

const saveCurrentSession = (session) => {
  if (!session) {
    sessionStorage.removeItem(SESSION_KEY);
    return;
  }

  sessionStorage.setItem(
    SESSION_KEY,
    JSON.stringify(session)
  );
};

// ---------------------------------------------------------
// Get all active sessions
// ---------------------------------------------------------

const getActiveSessions = () => {
  const storedSessions =
    localStorage.getItem(ACTIVE_SESSIONS_KEY);

  if (!storedSessions) {
    return [];
  }

  try {
    const sessions = JSON.parse(storedSessions);

    if (!Array.isArray(sessions)) {
      return [];
    }

    return sessions.filter(
      (session) =>
        session &&
        session.sessionId &&
        session.userId &&
        typeof session.lastActivity === "number"
    );
  } catch (error) {
    console.error(
      "Unable to read active Karwar Port sessions:",
      error
    );

    return [];
  }
};

// ---------------------------------------------------------
// Save active sessions
// ---------------------------------------------------------

const saveActiveSessions = (sessions) => {
  localStorage.setItem(
    ACTIVE_SESSIONS_KEY,
    JSON.stringify(sessions)
  );
};

// ---------------------------------------------------------
// Remove expired sessions
// ---------------------------------------------------------

const removeExpiredSessions = () => {
  const now = Date.now();
  const sessions = getActiveSessions();

  const activeSessions = sessions.filter(
    (session) =>
      now - session.lastActivity < SESSION_TIMEOUT
  );

  // Avoid unnecessary localStorage writes.
  if (activeSessions.length !== sessions.length) {
    saveActiveSessions(activeSessions);
  }

  return activeSessions;
};

// ---------------------------------------------------------
// Create a session
// ---------------------------------------------------------

export const createSession = (user) => {
  if (!user?.id) {
    return null;
  }

  const now = Date.now();

  const session = {
    sessionId: generateSessionId(),
    userId: user.id,
    adminId: user.adminId,
    name: user.name,
    role: user.role,
    department: user.department,
    loginTime: now,
    lastActivity: now,
  };

  // Store this session only in the current browser tab.
  saveCurrentSession(session);

  // Remove expired sessions first.
  const sessions = removeExpiredSessions();

  // Add the new session.
  saveActiveSessions([
    ...sessions,
    session,
  ]);

  return session;
};

// ---------------------------------------------------------
// Update heartbeat / activity
// ---------------------------------------------------------

export const updateSessionActivity = () => {
  const currentSession = getCurrentSession();

  if (!currentSession) {
    return null;
  }

  const updatedSession = {
    ...currentSession,
    lastActivity: Date.now(),
  };

  // Update current tab.
  saveCurrentSession(updatedSession);

  // Update shared active-session registry.
  const sessions = removeExpiredSessions();

  const sessionExists = sessions.some(
    (session) =>
      session.sessionId === updatedSession.sessionId
  );

  if (!sessionExists) {
    // The session expired from the shared registry.
    // Re-register it because this tab is still active.
    saveActiveSessions([
      ...sessions,
      updatedSession,
    ]);
  } else {
    const updatedSessions = sessions.map(
      (session) =>
        session.sessionId === updatedSession.sessionId
          ? updatedSession
          : session
    );

    saveActiveSessions(updatedSessions);
  }

  return updatedSession;
};

// ---------------------------------------------------------
// Remove current session
// ---------------------------------------------------------

export const destroySession = () => {
  const currentSession = getCurrentSession();

  // Always clear the current tab.
  sessionStorage.removeItem(SESSION_KEY);

  if (!currentSession) {
    return;
  }

  const sessions = getActiveSessions();

  const remainingSessions = sessions.filter(
    (session) =>
      session.sessionId !== currentSession.sessionId
  );

  saveActiveSessions(remainingSessions);
};

// ---------------------------------------------------------
// Check whether a user is currently active
// ---------------------------------------------------------

export const isUserActive = (userId) => {
  if (!userId) {
    return false;
  }

  const sessions = removeExpiredSessions();

  return sessions.some(
    (session) => session.userId === userId
  );
};

// ---------------------------------------------------------
// Get active sessions for a particular user
// ---------------------------------------------------------

export const getUserActiveSessions = (userId) => {
  if (!userId) {
    return [];
  }

  const sessions = removeExpiredSessions();

  return sessions.filter(
    (session) => session.userId === userId
  );
};

// ---------------------------------------------------------
// Get all currently active sessions
// ---------------------------------------------------------

export const getActiveSessionsList = () => {
  return removeExpiredSessions();
};

// ---------------------------------------------------------
// Heartbeat
// ---------------------------------------------------------

let heartbeatTimer = null;

export const startSessionHeartbeat = () => {
  // Prevent multiple heartbeat timers.
  if (heartbeatTimer) {
    return;
  }

  const currentSession = getCurrentSession();

  if (!currentSession) {
    return;
  }

  // Update immediately.
  updateSessionActivity();

  // Then update every 20 seconds.
  heartbeatTimer = setInterval(() => {
    const session = getCurrentSession();

    if (!session) {
      stopSessionHeartbeat();
      return;
    }

    updateSessionActivity();
  }, HEARTBEAT_INTERVAL);
};

// ---------------------------------------------------------
// Stop heartbeat
// ---------------------------------------------------------

export const stopSessionHeartbeat = () => {
  if (!heartbeatTimer) {
    return;
  }

  clearInterval(heartbeatTimer);
  heartbeatTimer = null;
};

// ---------------------------------------------------------
// Session manager initialization
// ---------------------------------------------------------

let sessionManagerInitialized = false;

export const initializeSessionManager = () => {
  // Prevent duplicate event listeners.
  if (sessionManagerInitialized) {
    return;
  }

  sessionManagerInitialized = true;

  // -------------------------------------------------------
  // Browser/tab closing
  // -------------------------------------------------------

  window.addEventListener("beforeunload", () => {
    destroySession();
    stopSessionHeartbeat();
  });

  // -------------------------------------------------------
  // Synchronize active sessions between browser tabs
  // -------------------------------------------------------

  window.addEventListener("storage", (event) => {
    if (event.key === ACTIVE_SESSIONS_KEY) {
      removeExpiredSessions();
    }
  });

  // -------------------------------------------------------
  // Start heartbeat if a session already exists
  // -------------------------------------------------------

  if (getCurrentSession()) {
    startSessionHeartbeat();
  }
};

// ---------------------------------------------------------
// Default export
// ---------------------------------------------------------

const sessionManager = {
  getCurrentSession,
  createSession,
  updateSessionActivity,
  destroySession,
  isUserActive,
  getUserActiveSessions,
  getActiveSessionsList,
  startSessionHeartbeat,
  stopSessionHeartbeat,
  initializeSessionManager,
};

export default sessionManager;