import React from "react";

import { createPortal } from "react-dom";

import {
  MdPeople,
  MdAdd,
  MdSearch,
  MdEdit,
  MdDelete,
  MdAdminPanelSettings,
  MdSecurity,
  MdClose,
  MdCheck,
  MdSave,
  MdLock,
  MdManageAccounts,
  MdVisibility,
  MdVisibilityOff,
  MdKey,
  MdBlock,
  MdCheckCircle,
} from "react-icons/md";

import authService from "../../../layouts/auth/authService.jsx";

import {
  apiGet,
  apiPost,
  apiPut,
  apiDelete,
} from "../../../services/api";

// =========================================================
// FIXED SYSTEM ROLES
// =========================================================

const FIXED_SYSTEM_ROLE_NAMES = [
  "Port Administrator",
  "Port Operations Manager",
  "Vessel Management Officer",
  "Cargo Officer",
  "Gate & Truck Officer",
  "Security Officer",
  "Maintenance Officer",
  "Port Executive",
];

// =========================================================
// SYSTEM PERMISSIONS
// =========================================================

const SYSTEM_PERMISSIONS = [
  {
    key: "dashboard",
    name: "Port Dashboard",
    description: "View the main port operational dashboard.",
  },
  {
    key: "port_map",
    name: "Live Port Map",
    description:
      "View the interactive port map and operational locations.",
  },
  {
    key: "weather",
    name: "Weather & Marine Conditions",
    description:
      "View weather, marine and environmental conditions.",
  },
  {
    key: "vessels",
    name: "Vessel Management",
    description:
      "Manage vessel records and vessel operations.",
  },
  {
    key: "berths",
    name: "Berth Management",
    description:
      "Manage berth information and berth operations.",
  },
  {
    key: "cargo",
    name: "Cargo Operations",
    description:
      "Manage cargo records and cargo operations.",
  },
  {
    key: "gate_trucks",
    name: "Gate & Truck Management",
    description:
      "Manage truck entry, exit and gate operations.",
  },
  {
    key: "port_communication",
    name: "Port Communication",
    description:
      "Access internal port communication functions.",
  },
  {
    key: "notifications",
    name: "Notifications",
    description:
      "View and manage port notifications.",
  },
  {
    key: "port_alerts",
    name: "Port Alerts",
    description:
      "View and manage operational port alerts.",
  },
  {
    key: "incidents",
    name: "Incident Management",
    description:
      "Report and manage port incidents.",
  },
  {
    key: "asset_maintenance",
    name: "Asset & Maintenance",
    description:
      "Manage assets, maintenance and maintenance activities.",
  },
  {
    key: "analytics",
    name: "Port Analytics",
    description:
      "View operational analytics and statistics.",
  },
  {
    key: "documents",
    name: "Document Management",
    description:
      "Manage port documents and records.",
  },
  {
    key: "audit_logs",
    name: "Audit Logs",
    description:
      "View system activity and audit records.",
  },
  {
    key: "user_role_management",
    name: "User & Role Management",
    description:
      "Manage users, roles and permissions.",
  },
];

const ALL_PERMISSION_KEYS = SYSTEM_PERMISSIONS.map(
  (permission) => permission.key
);

// =========================================================
// HELPERS
// =========================================================

// The only Port Administrator role. The backend checks this
// again on every request, so this is only for what the page shows.

const isAdministratorRole = (roleName) =>
  String(roleName || "")
    .trim()
    .toLowerCase() === "port administrator";

// How many employees can be shown on one page of the list.
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

// One employee as sent by FastAPI (GET /users):
// { id, name, admin_id, role, is_active, ... }

const normalizeBackendUser = (user) => ({
  id: user.id,
  name: user.name || "",
  adminId: user.admin_id || "",
  role: user.role || "",
  isActive: user.is_active !== false,
});

// =========================================================
// MODAL PORTAL
// =========================================================

const ModalPortal = ({ children }) => {
  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(children, document.body);
};

// =========================================================
// COMPONENT
// =========================================================

const UserManagement = () => {
  const [users, setUsers] = React.useState([]);

  const [usersLoading, setUsersLoading] =
    React.useState(false);

  const [savingUser, setSavingUser] =
    React.useState(false);

  const [busyUserId, setBusyUserId] =
    React.useState(null);

  // Errors shown INSIDE the open window. The page-level message
  // would be hidden behind the dark background of the window.

  const [userFormError, setUserFormError] =
    React.useState("");

  const [roleFormError, setRoleFormError] =
    React.useState("");

  const [roles, setRoles] = React.useState([]);

  const [rolePermissions, setRolePermissions] =
    React.useState({});

  const [rolesLoading, setRolesLoading] =
    React.useState(true);

  const [permissionsLoading, setPermissionsLoading] =
    React.useState(false);

  const [savingPermissions, setSavingPermissions] =
    React.useState(false);

  const [savingRole, setSavingRole] =
    React.useState(false);

  const [actionMessage, setActionMessage] =
    React.useState("");

  const [actionError, setActionError] =
    React.useState("");

  const [search, setSearch] = React.useState("");

  // Filters and pages of the Employees list, so that a long list of
  // employees stays easy to use.
  const [roleFilter, setRoleFilter] = React.useState("all");

  const [statusFilter, setStatusFilter] =
    React.useState("all");

  const [pageSize, setPageSize] = React.useState(25);

  const [page, setPage] = React.useState(1);

  const [activeTab, setActiveTab] =
    React.useState("users");

  const [showUserModal, setShowUserModal] =
    React.useState(false);

  const [showRoleModal, setShowRoleModal] =
    React.useState(false);

  const [editingUser, setEditingUser] =
    React.useState(null);

  const [editingRole, setEditingRole] =
    React.useState(null);

  const [selectedRoleId, setSelectedRoleId] =
    React.useState(null);

  const [showPassword, setShowPassword] =
    React.useState(false);

  const [showAuthorizationModal, setShowAuthorizationModal] =
    React.useState(false);

  const [userForm, setUserForm] = React.useState({
    name: "",
    adminId: "",
    password: "",
    role: "",
  });

  const [roleForm, setRoleForm] = React.useState({
    name: "",
    description: "",
  });

  const [currentUser, setCurrentUser] =
    React.useState(() =>
      authService.getCurrentUser()
    );

  // The ids of the accounts that are logged in and in use right now.
  // The SERVER knows this (GET /users/online), so two accounts can
  // never be mixed up, even when they have the same name.
  const [onlineIds, setOnlineIds] = React.useState([]);

  // =======================================================
  // SESSION REFRESH
  // =======================================================

  const refreshSessions = React.useCallback(() => {
    setCurrentUser(authService.getCurrentUser());
  }, []);

  React.useEffect(() => {
    refreshSessions();

    const handleStorage = (event) => {
      if (event.key === "karwarPortCurrentUser") {
        refreshSessions();
      }
    };

    window.addEventListener(
      "storage",
      handleStorage
    );

    const interval = window.setInterval(() => {
      refreshSessions();
    }, 3000);

    return () => {
      window.removeEventListener(
        "storage",
        handleStorage
      );

      window.clearInterval(interval);
    };
  }, [refreshSessions]);

  // =======================================================
  // BACKEND RBAC HELPERS
  // =======================================================

  const getErrorMessage = React.useCallback(
    (error, fallback) => {
      if (
        error instanceof Error &&
        error.message
      ) {
        return error.message;
      }

      if (
        typeof error === "string" &&
        error.trim()
      ) {
        return error;
      }

      if (error?.detail) {
        if (
          typeof error.detail === "string"
        ) {
          return error.detail;
        }

        try {
          return JSON.stringify(
            error.detail
          );
        } catch {
          return fallback;
        }
      }

      return fallback;
    },
    []
  );

  const isFixedSystemRole =
    React.useCallback((role) => {
      return FIXED_SYSTEM_ROLE_NAMES.includes(
        role?.name
      );
    }, []);

  const normalizeBackendRole =
    React.useCallback(
      (role) => ({
        id: role.id,
        name: role.name,
        description: role.description || "",
        protected:
          role.name === "Port Administrator",
        fixedSystemRole:
          FIXED_SYSTEM_ROLE_NAMES.includes(
            role.name
          ),
      }),
      []
    );

  // Loads the features of every role once, so the "n/16" count in
  // the role list is correct without clicking each role first.
  // Features already loaded or being edited are never overwritten.

  const loadAllRolePermissions = React.useCallback(
    async (roleList) => {
      const results = await Promise.all(
        roleList.map(async (role) => {
          try {
            const response = await apiGet(
              `/roles/${role.id}/permissions`
            );

            return [
              role.id,
              Array.isArray(response?.permissions)
                ? response.permissions
                : [],
            ];
          } catch {
            return [role.id, null];
          }
        })
      );

      setRolePermissions((previous) => {
        const next = { ...previous };

        results.forEach(([roleId, permissions]) => {
          if (
            permissions !== null &&
            !Object.prototype.hasOwnProperty.call(
              next,
              roleId
            )
          ) {
            next[roleId] = permissions;
          }
        });

        return next;
      });
    },
    []
  );

  const loadRoles = React.useCallback(
    async () => {
      setRolesLoading(true);
      setActionError("");

      try {
        const response = await apiGet(
          "/roles"
        );

        const backendRoles = Array.isArray(
          response
        )
          ? response
          : [];

        const normalizedRoles =
          backendRoles.map(
            normalizeBackendRole
          );

        setRoles(normalizedRoles);

        loadAllRolePermissions(normalizedRoles);

        setSelectedRoleId((previous) => {
          if (
            previous !== null &&
            normalizedRoles.some(
              (role) => role.id === previous
            )
          ) {
            return previous;
          }

          return (
            normalizedRoles[0]?.id ?? null
          );
        });
      } catch (error) {
        console.error(
          "Unable to load roles:",
          error
        );

        setRoles([]);
        setSelectedRoleId(null);

        setActionError(
          getErrorMessage(
            error,
            "Unable to load roles from the backend."
          )
        );
      } finally {
        setRolesLoading(false);
      }
    },
    [
      getErrorMessage,
      normalizeBackendRole,
      loadAllRolePermissions,
    ]
  );

  const loadRolePermissions =
    React.useCallback(
      async (roleId) => {
        if (
          roleId === null ||
          roleId === undefined
        ) {
          return;
        }

        // Keep already-loaded permissions cached so selecting/refreshing
        // the page does not cause a visible loading flash.
        if (
          Object.prototype.hasOwnProperty.call(
            rolePermissions,
            roleId
          )
        ) {
          return;
        }

        setPermissionsLoading(true);
        setActionError("");

        try {
          const response = await apiGet(
            `/roles/${roleId}/permissions`
          );

          const permissions =
            Array.isArray(
              response?.permissions
            )
              ? response.permissions
              : [];

          setRolePermissions(
            (previous) => ({
              ...previous,
              [roleId]: permissions,
            })
          );
        } catch (error) {
          console.error(
            "Unable to load role permissions:",
            error
          );

          setRolePermissions(
            (previous) => ({
              ...previous,
              [roleId]: [],
            })
          );

          setActionError(
            getErrorMessage(
              error,
              "Unable to load role permissions from the backend."
            )
          );
        } finally {
          setPermissionsLoading(false);
        }
      },
      [getErrorMessage, rolePermissions]
    );

  // Employee accounts from PostgreSQL (GET /users).
  // Returns the list, or null when it could not be loaded.

  const loadUsers = React.useCallback(
    async () => {
      setUsersLoading(true);

      try {
        const response = await apiGet("/users");

        const list = Array.isArray(response)
          ? response.map(normalizeBackendUser)
          : [];

        setUsers(list);

        return list;
      } catch (error) {
        console.error(
          "Unable to load employees:",
          error
        );

        setActionError(
          getErrorMessage(
            error,
            "Unable to load employees from the backend."
          )
        );

        return null;
      } finally {
        setUsersLoading(false);
      }
    },
    [getErrorMessage]
  );

  // Who is Online right now (Port Administrator only). If the answer
  // cannot be read, the last known list is kept.

  const loadOnlineUsers = React.useCallback(async () => {
    try {
      const response = await apiGet("/users/online");

      setOnlineIds(
        Array.isArray(response?.online_user_ids)
          ? response.online_user_ids.map(Number)
          : []
      );
    } catch (error) {
      console.error(
        "Unable to read who is online:",
        error
      );
    }
  }, []);

  // Load roles (and employees, for the Port Administrator) once on
  // page mount. Do not depend on the currentUser object because the
  // session heartbeat refreshes it periodically and would otherwise
  // restart the loaders.
  React.useEffect(() => {
    if (!currentUser) {
      return;
    }

    loadRoles();

    // Only the Port Administrator may list employees.
    if (isAdministratorRole(currentUser.role)) {
      loadUsers();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    if (
      selectedRoleId === null ||
      selectedRoleId === undefined
    ) {
      return;
    }

    loadRolePermissions(
      selectedRoleId
    );
  }, [
    selectedRoleId,
    loadRolePermissions,
  ]);

  React.useEffect(() => {
    if (
      !actionMessage &&
      !actionError
    ) {
      return undefined;
    }

    const timeout =
      window.setTimeout(() => {
        setActionMessage("");
        setActionError("");
      }, 5000);

    return () =>
      window.clearTimeout(timeout);
  }, [
    actionMessage,
    actionError,
  ]);

  // Keep the Online / Offline column fresh while the page is open.

  const canSeeOnline = isAdministratorRole(
    currentUser?.role
  );

  React.useEffect(() => {
    if (!canSeeOnline) {
      return undefined;
    }

    loadOnlineUsers();

    const timer = window.setInterval(() => {
      if (document.visibilityState !== "hidden") {
        loadOnlineUsers();
      }
    }, 10000);

    const handleVisible = () => {
      if (document.visibilityState === "visible") {
        loadOnlineUsers();
      }
    };

    document.addEventListener(
      "visibilitychange",
      handleVisible
    );

    return () => {
      window.clearInterval(timer);

      document.removeEventListener(
        "visibilitychange",
        handleVisible
      );
    };
  }, [canSeeOnline, loadOnlineUsers]);

  // =======================================================
  // ESCAPE KEY
  // =======================================================

  React.useEffect(() => {
    if (
      !showUserModal &&
      !showRoleModal &&
      !showAuthorizationModal
    ) {
      return undefined;
    }

    const handleEscape = (event) => {
      if (event.key !== "Escape") {
        return;
      }

      if (showAuthorizationModal) {
        setShowAuthorizationModal(false);
        return;
      }

      setShowUserModal(false);
      setShowRoleModal(false);
      setEditingUser(null);
      setEditingRole(null);
    };

    document.addEventListener(
      "keydown",
      handleEscape
    );

    return () => {
      document.removeEventListener(
        "keydown",
        handleEscape
      );
    };
  }, [
    showUserModal,
    showRoleModal,
    showAuthorizationModal,
  ]);

  // =======================================================
  // CURRENT SESSION
  // =======================================================

  const currentSessionRole =
    currentUser?.role || "";

  const currentSessionName =
    currentUser?.name ||
    currentUser?.full_name ||
    currentUser?.username ||
    "";

  // Only the role decides. No fixed user name, no fixed e-mail.
  // (The backend checks the role again on every request.)
  const isCurrentUserPortAdmin =
    isAdministratorRole(currentSessionRole);

  // =======================================================
  // USER ACTIONS
  // =======================================================
  // Every action below is saved in PostgreSQL through the
  // FastAPI /users endpoints. Nothing is kept only in the browser.

  // Strict check (ID or Admin ID only) used to protect the
  // logged-in administrator from locking themselves out.
  const isSelf = React.useCallback(
    (user) => {
      if (!currentUser || !user) {
        return false;
      }

      if (
        currentUser.id !== undefined &&
        currentUser.id !== null &&
        user.id !== undefined &&
        user.id !== null &&
        String(currentUser.id) === String(user.id)
      ) {
        return true;
      }

      const mine = String(
        currentUser.adminId ||
          currentUser.username ||
          ""
      )
        .trim()
        .toLowerCase();

      return (
        mine !== "" &&
        mine ===
          String(user.adminId || "")
            .trim()
            .toLowerCase()
      );
    },
    [currentUser]
  );

  // The roles an employee can be given. "Port Administrator" is only
  // listed for an account that already has it, because there can be
  // only one Port Administrator (the backend checks this too).
  const assignableRoles = roles.filter(
    (role) =>
      !isAdministratorRole(role.name) ||
      Boolean(
        editingUser &&
          isAdministratorRole(editingUser.role)
      )
  );

  // =======================================================
  // USER STATUS
  // =======================================================
  // Online = the account is enabled AND (it is the account of the
  // person looking at this page, or the server saw it recently).
  // Only the account id is compared: names are never used, so two
  // accounts with the same name can never both show "Online".

  const isUserOnline = (user) =>
    Boolean(user) &&
    user.isActive &&
    (isSelf(user) ||
      onlineIds.includes(Number(user.id)));

  // =======================================================
  // SEARCH, FILTERS AND PAGES
  // =======================================================
  // The port can have many employees, so the list can be filtered
  // by role and by status, and it is shown one page at a time.

  // A role that was renamed or deleted can no longer be a filter.
  const activeRoleFilter =
    roleFilter === "all" ||
    roles.some((role) => role.name === roleFilter)
      ? roleFilter
      : "all";

  const searchText = search.toLowerCase().trim();

  const filteredUsers = users.filter((user) => {
    if (
      activeRoleFilter !== "all" &&
      user.role !== activeRoleFilter
    ) {
      return false;
    }

    if (statusFilter !== "all") {
      const online = isUserOnline(user);

      if (statusFilter === "disabled" && user.isActive) {
        return false;
      }

      if (statusFilter === "online" && !online) {
        return false;
      }

      if (
        statusFilter === "offline" &&
        (!user.isActive || online)
      ) {
        return false;
      }
    }

    if (!searchText) {
      return true;
    }

    return (
      String(user.name || "")
        .toLowerCase()
        .includes(searchText) ||
      String(user.adminId || "")
        .toLowerCase()
        .includes(searchText) ||
      String(user.role || "")
        .toLowerCase()
        .includes(searchText)
    );
  });

  const onlineCount = users.filter((user) =>
    isUserOnline(user)
  ).length;

  const disabledCount = users.filter(
    (user) => !user.isActive
  ).length;

  const pageCount = Math.max(
    1,
    Math.ceil(filteredUsers.length / pageSize)
  );

  // After a delete or a new filter the page can no longer exist.
  const currentPage = Math.min(page, pageCount);

  const firstIndex = (currentPage - 1) * pageSize;

  const pageUsers = filteredUsers.slice(
    firstIndex,
    firstIndex + pageSize
  );

  // How many employees each role has (shown in Roles & Permissions).
  const employeeCountByRole = users.reduce(
    (counts, user) => {
      counts[user.role] = (counts[user.role] || 0) + 1;

      return counts;
    },
    {}
  );

  const handleAddUser = () => {
    if (!isCurrentUserPortAdmin) {
      return;
    }

    setEditingUser(null);
    setShowPassword(false);
    setUserFormError("");

    // No default role: the administrator must choose one on
    // purpose, so nobody becomes a Port Administrator by accident.
    setUserForm({
      name: "",
      adminId: "",
      password: "",
      role: "",
    });

    setShowUserModal(true);
  };

  const handleEditUser = (user) => {
    if (!isCurrentUserPortAdmin) {
      return;
    }

    setEditingUser(user);
    setShowPassword(false);
    setUserFormError("");

    setUserForm({
      name: user.name || "",
      adminId: user.adminId || "",
      password: "",
      role: user.role || "",
    });

    setShowUserModal(true);
  };

  const handleToggleUserActive = async (user) => {
    if (
      !user ||
      !isCurrentUserPortAdmin ||
      busyUserId !== null
    ) {
      return;
    }

    if (isSelf(user)) {
      window.alert(
        "You cannot disable your own account."
      );
      return;
    }

    const enable = !user.isActive;

    const question = enable
      ? `Enable the account "${user.adminId}"? The employee will be able to sign in again.`
      : `Disable the account "${user.adminId}"? The employee will no longer be able to sign in. The account is kept and can be enabled again.`;

    if (!window.confirm(question)) {
      return;
    }

    setBusyUserId(user.id);
    setActionError("");

    try {
      await apiPut(`/users/${user.id}`, {
        is_active: enable,
      });

      await loadUsers();

      setActionMessage(
        enable
          ? `Account "${user.adminId}" enabled.`
          : `Account "${user.adminId}" disabled.`
      );
    } catch (error) {
      console.error(
        "Unable to change account status:",
        error
      );

      setActionError(
        getErrorMessage(
          error,
          "Unable to change the account status."
        )
      );
    } finally {
      setBusyUserId(null);
    }
  };

  const handleDeleteUser = async (user) => {
    if (
      !user ||
      !isCurrentUserPortAdmin ||
      busyUserId !== null
    ) {
      return;
    }

    if (isSelf(user)) {
      window.alert(
        "You cannot delete your own account."
      );
      return;
    }

    const extra = isAdministratorRole(user.role)
      ? `"${user.adminId}" is a Port Administrator account. `
      : "";

    if (
      !window.confirm(
        `${extra}Delete the account "${user.adminId}"? This cannot be undone. To keep the account but stop it signing in, use Disable instead.`
      )
    ) {
      return;
    }

    setBusyUserId(user.id);
    setActionError("");

    try {
      await apiDelete(`/users/${user.id}`);

      await loadUsers();

      setActionMessage(
        `Employee "${user.adminId}" deleted.`
      );
    } catch (error) {
      console.error(
        "Unable to delete employee:",
        error
      );

      // A successful delete has an empty reply. If it could not be
      // read, the fresh list tells what really happened.
      const fresh = await loadUsers();

      if (
        fresh &&
        !fresh.some((item) => item.id === user.id)
      ) {
        setActionMessage(
          `Employee "${user.adminId}" deleted.`
        );
      } else {
        setActionError(
          `${getErrorMessage(
            error,
            "Unable to delete the employee."
          )} You can disable the account instead.`
        );
      }
    } finally {
      setBusyUserId(null);
    }
  };

  const handleSaveUser = async (event) => {
    event.preventDefault();

    if (!isCurrentUserPortAdmin || savingUser) {
      return;
    }

    const name = userForm.name.trim();
    const adminId = userForm.adminId.trim();
    const password = userForm.password;
    const role = userForm.role.trim();

    if (!name || !adminId || !role) {
      setUserFormError(
        "Please complete all required fields, including the employee role."
      );
      return;
    }

    if (!editingUser && !password) {
      setUserFormError(
        "Please create a password for the new account."
      );
      return;
    }

    if (password && password.length < 8) {
      setUserFormError(
        "The password must contain at least 8 characters."
      );
      return;
    }

    const duplicateAdminId = users.find(
      (user) =>
        String(user.adminId || "").toLowerCase() ===
          adminId.toLowerCase() &&
        user.id !== editingUser?.id
    );

    if (duplicateAdminId) {
      setUserFormError(
        "This Admin ID is already assigned to another employee."
      );
      return;
    }

    setSavingUser(true);
    setUserFormError("");

    try {
      if (editingUser) {
        // Send only what really changed.
        const changes = {};

        if (name !== editingUser.name) {
          changes.name = name;
        }

        if (
          adminId.toLowerCase() !==
          String(editingUser.adminId || "").toLowerCase()
        ) {
          changes.admin_id = adminId;
        }

        if (role !== editingUser.role) {
          changes.role = role;
        }

        if (password) {
          changes.password = password;
        }

        if (Object.keys(changes).length === 0) {
          setShowUserModal(false);
          setEditingUser(null);
          setShowPassword(false);
          setActionMessage("No changes were made.");
          return;
        }

        await apiPut(
          `/users/${editingUser.id}`,
          changes
        );

        await loadUsers();

        setActionMessage(
          `Employee "${adminId}" updated.`
        );
      } else {
        await apiPost("/users", {
          name,
          admin_id: adminId,
          password,
          role,
        });

        await loadUsers();

        setActionMessage(
          `Employee account "${adminId}" created.`
        );
      }

      setShowUserModal(false);
      setEditingUser(null);
      setShowPassword(false);
    } catch (error) {
      console.error(
        "Unable to save employee:",
        error
      );

      setUserFormError(
        getErrorMessage(
          error,
          "Unable to save the employee."
        )
      );
    } finally {
      setSavingUser(false);
    }
  };

  // =======================================================
  // ROLE ACTIONS
  // =======================================================

  const handleSelectRole = (roleId) => {
    setSelectedRoleId(roleId);
    setActionError("");
    setActionMessage("");
  };

  const handleOpenCreateRole = () => {
    if (!isCurrentUserPortAdmin) {
      return;
    }

    setEditingRole(null);
    setRoleFormError("");

    setRoleForm({
      name: "",
      description: "",
    });

    setShowRoleModal(true);
  };

  const handleOpenEditRole = (role) => {
    if (
      !role ||
      !isCurrentUserPortAdmin
    ) {
      return;
    }

    setEditingRole(role);
    setRoleFormError("");

    setRoleForm({
      name: role.name,
      description:
        role.description || "",
    });

    setShowRoleModal(true);
  };

  const handleDeleteRole = async (
    role
  ) => {
    if (
      !role ||
      !isCurrentUserPortAdmin
    ) {
      return;
    }

    if (isFixedSystemRole(role)) {
      window.alert(
        `"${role.name}" is a protected system role and cannot be deleted.`
      );
      return;
    }

    if (
      !window.confirm(
        `Delete the "${role.name}" role?`
      )
    ) {
      return;
    }

    setSavingRole(true);
    setActionError("");

    try {
      await apiDelete(
        `/roles/${role.id}`
      );

      setRolePermissions(
        (previous) => {
          const updated = {
            ...previous,
          };

          delete updated[role.id];

          return updated;
        }
      );

      await loadRoles();
      await loadUsers();

      setActionMessage(
        `Role "${role.name}" deleted successfully.`
      );
    } catch (error) {
      console.error(
        "Unable to delete role:",
        error
      );

      setActionError(
        getErrorMessage(
          error,
          "Unable to delete the role."
        )
      );
    } finally {
      setSavingRole(false);
    }
  };

  const handleSaveRole = async (
    event
  ) => {
    event.preventDefault();

    if (!isCurrentUserPortAdmin) {
      return;
    }

    const name =
      roleForm.name.trim();

    const description =
      roleForm.description.trim();

    if (!name) {
      setRoleFormError(
        "Please enter a role name."
      );
      return;
    }

    if (name.length < 2) {
      setRoleFormError(
        "The role name must have at least 2 characters."
      );
      return;
    }

    setSavingRole(true);
    setRoleFormError("");

    try {
      if (editingRole) {
        const payload = {
          description,
        };

        if (
          !isFixedSystemRole(
            editingRole
          )
        ) {
          payload.name = name;
        }

        const updatedRole =
          await apiPut(
            `/roles/${editingRole.id}`,
            payload
          );

        const normalizedRole =
          normalizeBackendRole(
            updatedRole
          );

        setRoles((previous) =>
          previous.map((role) =>
            role.id ===
            editingRole.id
              ? normalizedRole
              : role
          )
        );

        setShowRoleModal(false);
        setEditingRole(null);

        // Employees show their role name, so refresh the list.
        loadUsers();

        setActionMessage(
          `Role "${normalizedRole.name}" updated successfully.`
        );
      } else {
        const createdRole =
          await apiPost(
            "/roles",
            {
              name,
              description,
            }
          );

        const normalizedRole =
          normalizeBackendRole(
            createdRole
          );

        setRoles((previous) => [
          ...previous,
          normalizedRole,
        ]);

        setRolePermissions(
          (previous) => ({
            ...previous,
            [normalizedRole.id]:
              [],
          })
        );

        setSelectedRoleId(
          normalizedRole.id
        );

        setShowRoleModal(false);
        setEditingRole(null);

        setActionMessage(
          `Role "${normalizedRole.name}" created. It has no features yet: tick the features it needs and press Save Permissions.`
        );
      }
    } catch (error) {
      console.error(
        "Unable to save role:",
        error
      );

      setRoleFormError(
        getErrorMessage(
          error,
          "Unable to save the role."
        )
      );
    } finally {
      setSavingRole(false);
    }
  };

  // =======================================================
  // PERMISSION MANAGEMENT
  // =======================================================

  const selectedRole =
    roles.find(
      (role) =>
        role.id === selectedRoleId
    ) || null;

  const selectedPermissions =
    rolePermissions[
      selectedRole?.id
    ] || [];

  const hasPermission = (
    permissionKey
  ) => {
    return selectedPermissions.includes(
      permissionKey
    );
  };

  const togglePermission = (
    permissionKey
  ) => {
    if (
      !selectedRole ||
      !isCurrentUserPortAdmin
    ) {
      return;
    }

    if (
      selectedRole.name ===
      "Port Administrator"
    ) {
      return;
    }

    setRolePermissions(
      (previous) => {
        const current =
          previous[
            selectedRole.id
          ] || [];

        const updated =
          current.includes(
            permissionKey
          )
            ? current.filter(
                (key) =>
                  key !==
                  permissionKey
              )
            : [
                ...current,
                permissionKey,
              ];

        return {
          ...previous,
          [selectedRole.id]:
            updated,
        };
      }
    );

    setActionMessage("");
    setActionError("");
  };

  const enableAllPermissions =
    () => {
      if (
        !selectedRole ||
        !isCurrentUserPortAdmin
      ) {
        return;
      }

      setRolePermissions(
        (previous) => ({
          ...previous,
          [selectedRole.id]:
            [...ALL_PERMISSION_KEYS],
        })
      );
    };

  const disableAllPermissions =
    () => {
      if (
        !selectedRole ||
        !isCurrentUserPortAdmin
      ) {
        return;
      }

      if (
        selectedRole.name ===
        "Port Administrator"
      ) {
        window.alert(
          "The Port Administrator role must retain its administrative permissions."
        );
        return;
      }

      setRolePermissions(
        (previous) => ({
          ...previous,
          [selectedRole.id]: [],
        })
      );
    };

  const handleSavePermissions =
    () => {
      if (
        !selectedRole ||
        !isCurrentUserPortAdmin ||
        savingPermissions
      ) {
        return;
      }

      setShowAuthorizationModal(
        true
      );
    };

  const confirmSavePermissions =
    async () => {
      if (
        !selectedRole ||
        !isCurrentUserPortAdmin ||
        savingPermissions
      ) {
        setShowAuthorizationModal(
          false
        );
        return;
      }

      setSavingPermissions(true);
      setActionError("");

      try {
        const response =
          await apiPut(
            `/roles/${selectedRole.id}/permissions`,
            {
              permissions:
                selectedPermissions,
            }
          );

        const savedPermissions =
          Array.isArray(
            response?.permissions
          )
            ? response.permissions
            : [];

        setRolePermissions(
          (previous) => ({
            ...previous,
            [selectedRole.id]:
              savedPermissions,
          })
        );

        setShowAuthorizationModal(
          false
        );

        setActionMessage(
          `Permissions saved for "${selectedRole.name}".`
        );
      } catch (error) {
        console.error(
          "Unable to save role permissions:",
          error
        );

        setShowAuthorizationModal(
          false
        );

        setActionError(
          getErrorMessage(
            error,
            "Unable to save role permissions."
          )
        );
      } finally {
        setSavingPermissions(
          false
        );
      }
    };

  const closeAuthorizationModal =
    () => {
      if (savingPermissions) {
        return;
      }

      setShowAuthorizationModal(
        false
      );
    };

  // =======================================================
  // CLOSE MODALS
  // =======================================================

  const closeUserModal = () => {
    setShowUserModal(false);
    setEditingUser(null);
    setShowPassword(false);
    setUserFormError("");
  };

  const closeRoleModal = () => {
    setShowRoleModal(false);
    setEditingRole(null);
    setRoleFormError("");

    setRoleForm({
      name: "",
      description: "",
    });
  };

  // =======================================================
  // RENDER
  // =======================================================

  return (
    <div className="mt-3">
      {/* =================================================
          RBAC BANNER
          ================================================= */}

      <div className="mb-5 flex items-center gap-3 rounded-2xl border border-indigo-100 bg-indigo-50 p-4 dark:border-indigo-500/20 dark:bg-navy-800">
        <MdAdminPanelSettings className="h-6 w-6 text-indigo-500" />

        <div>
          <p className="text-sm font-bold text-indigo-700 dark:text-indigo-300">
            RBAC Administration
          </p>

          <p className="text-xs text-indigo-600 dark:text-gray-400">
            Manage employees, roles and feature-level access
            for the port management system.
          </p>
        </div>
      </div>

      {/* =================================================
          CURRENT SESSION
          ================================================= */}

      <div className="mb-5 rounded-xl bg-white px-4 py-3 shadow-sm dark:bg-navy-800">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
              Current Session
            </p>

            <p className="mt-1 text-sm font-bold text-navy-700 dark:text-white">
              {currentSessionName ||
                "No active session"}
            </p>

            {currentSessionRole && (
              <p className="mt-0.5 text-xs text-gray-400">
                {currentSessionRole}
              </p>
            )}
          </div>

          <span
            className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${
              currentUser
                ? "bg-green-50 text-green-600 dark:bg-green-500/10 dark:text-green-400"
                : "bg-gray-100 text-gray-500 dark:bg-navy-700 dark:text-gray-400"
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                currentUser
                  ? "bg-green-500"
                  : "bg-gray-400"
              }`}
            />

            {currentUser
              ? "Authenticated"
              : "Not Authenticated"}
          </span>
        </div>
      </div>

      {/* =================================================
          TABS
          ================================================= */}

      <div className="mb-5 flex gap-2 rounded-2xl bg-white p-2 shadow-sm dark:bg-navy-800">
        <button
          type="button"
          onClick={() =>
            setActiveTab("users")
          }
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
            activeTab === "users"
              ? "bg-indigo-600 text-white"
              : "text-gray-500 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-navy-700"
          }`}
        >
          <MdPeople className="text-lg" />
          Employees
        </button>

        <button
          type="button"
          onClick={() =>
            setActiveTab("roles")
          }
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
            activeTab === "roles"
              ? "bg-indigo-600 text-white"
              : "text-gray-500 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-navy-700"
          }`}
        >
          <MdSecurity className="text-lg" />
          Roles & Permissions
        </button>
      </div>

      {(actionMessage || actionError) && (
        <div
          className={`mb-5 rounded-xl border px-4 py-3 text-sm ${
            actionError
              ? "border-red-200 bg-red-50 text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300"
              : "border-green-200 bg-green-50 text-green-600 dark:border-green-500/20 dark:bg-green-500/10 dark:text-green-300"
          }`}
        >
          {actionError ||
            actionMessage}
        </div>
      )}

      {/* =================================================
          EMPLOYEES TAB
          ================================================= */}

      {activeTab === "users" && (
        <>
          <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-1 items-center rounded-xl bg-white px-4 py-3 shadow-sm dark:bg-navy-800">
              <MdSearch className="mr-3 h-5 w-5 shrink-0 text-gray-400" />

              <input
                type="text"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder="Search employee name, Admin ID or role..."
                autoComplete="off"
                spellCheck={false}
                className="!m-0 !w-full !border-0 !bg-transparent !p-0 !text-sm !text-navy-700 !outline-none !shadow-none !ring-0 placeholder:!text-gray-400 focus:!border-0 focus:!bg-transparent focus:!outline-none focus:!shadow-none focus:!ring-0 dark:!bg-transparent dark:!text-white"
                style={{
                  background:
                    "transparent",
                  backgroundColor:
                    "transparent",
                  boxShadow: "none",
                  border: "none",
                  outline: "none",
                }}
              />
            </div>

            {isCurrentUserPortAdmin && (
              <button
                type="button"
                onClick={handleAddUser}
                className="flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
              >
                <MdAdd className="text-lg" />
                Add Employee
              </button>
            )}
          </div>

          {isCurrentUserPortAdmin && (
            <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-300">
                {users.length}{" "}
                {users.length === 1
                  ? "employee"
                  : "employees"}
                {" · "}
                {onlineCount} online
                {" · "}
                {disabledCount} disabled
              </p>

              <div className="flex flex-col gap-2 sm:flex-row">
                <select
                  aria-label="Filter employees by role"
                  value={activeRoleFilter}
                  onChange={(event) => {
                    setRoleFilter(event.target.value);
                    setPage(1);
                  }}
                  className="rounded-xl bg-white px-4 py-2.5 text-xs font-semibold text-navy-700 shadow-sm outline-none transition focus:ring-2 focus:ring-indigo-500 dark:bg-navy-800 dark:text-white"
                >
                  <option value="all">All roles</option>

                  {roles.map((role) => (
                    <option
                      key={role.id}
                      value={role.name}
                    >
                      {role.name}
                      {employeeCountByRole[role.name]
                        ? ` (${employeeCountByRole[role.name]})`
                        : ""}
                    </option>
                  ))}
                </select>

                <select
                  aria-label="Filter employees by status"
                  value={statusFilter}
                  onChange={(event) => {
                    setStatusFilter(event.target.value);
                    setPage(1);
                  }}
                  className="rounded-xl bg-white px-4 py-2.5 text-xs font-semibold text-navy-700 shadow-sm outline-none transition focus:ring-2 focus:ring-indigo-500 dark:bg-navy-800 dark:text-white"
                >
                  <option value="all">All statuses</option>
                  <option value="online">Online</option>
                  <option value="offline">Offline</option>
                  <option value="disabled">Disabled</option>
                </select>
              </div>
            </div>
          )}

          <div className="overflow-hidden rounded-2xl bg-white shadow-sm dark:bg-navy-800">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-white/10">
                    <th className="px-5 py-4 text-left text-xs font-bold uppercase text-gray-400">
                      Employee
                    </th>

                    <th className="px-5 py-4 text-left text-xs font-bold uppercase text-gray-400">
                      Admin ID
                    </th>

                    <th className="px-5 py-4 text-left text-xs font-bold uppercase text-gray-400">
                      Employee Role
                    </th>

                    <th className="px-5 py-4 text-left text-xs font-bold uppercase text-gray-400">
                      Status
                    </th>

                    <th className="px-5 py-4 text-right text-xs font-bold uppercase text-gray-400">
                      Actions
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {pageUsers.map((user) => {
                    const isOnline = isUserOnline(user);

                    const isSelfRow = isSelf(user);

                    const isBusy =
                      busyUserId === user.id;

                    const initials = String(
                      user.name || ""
                    )
                      .split(" ")
                      .filter(Boolean)
                      .map((word) => word[0])
                      .slice(0, 2)
                      .join("")
                      .toUpperCase();

                    return (
                      <tr
                        key={user.id}
                        className="border-b border-gray-50 transition hover:bg-gray-50 dark:border-white/5 dark:hover:bg-navy-700"
                      >
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div
                              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                                isOnline
                                  ? "bg-indigo-500/10 text-indigo-500"
                                  : "bg-gray-100 text-gray-400 dark:bg-navy-700 dark:text-gray-500"
                              }`}
                            >
                              {initials}
                            </div>

                            <div>
                              <p className="text-sm font-bold text-navy-700 dark:text-white">
                                {user.name}
                                {isSelfRow && (
                                  <span className="ml-2 rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300">
                                    You
                                  </span>
                                )}
                              </p>

                              <p className="text-xs text-gray-400">
                                Employee account
                              </p>
                            </div>
                          </div>
                        </td>

                        <td className="px-5 py-4">
                          <span className="inline-flex items-center gap-2 rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-600 dark:bg-navy-700 dark:text-gray-300">
                            <MdKey className="text-sm" />
                            {user.adminId}
                          </span>
                        </td>

                        <td className="px-5 py-4">
                          <span
                            className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${
                              user.isActive
                                ? "bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300"
                                : "bg-gray-100 text-gray-500 dark:bg-navy-700 dark:text-gray-400"
                            }`}
                          >
                            <MdSecurity />
                            {user.role || "(no role)"}
                          </span>
                        </td>

                        <td className="px-5 py-4">
                          <span
                            className={`inline-flex items-center gap-2 text-xs font-semibold ${
                              !user.isActive
                                ? "text-red-500"
                                : isOnline
                                  ? "text-green-500"
                                  : "text-gray-400"
                            }`}
                          >
                            <span
                              className={`h-2 w-2 rounded-full ${
                                !user.isActive
                                  ? "bg-red-500"
                                  : isOnline
                                    ? "bg-green-500"
                                    : "bg-gray-400"
                              }`}
                            />

                            {!user.isActive
                              ? "Disabled"
                              : isOnline
                                ? "Online"
                                : "Offline"}
                          </span>
                        </td>

                        <td className="px-5 py-4">
                          <div className="flex justify-end gap-1">
                            {isCurrentUserPortAdmin && (
                              <>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleEditUser(user)
                                  }
                                  disabled={isBusy}
                                  className="rounded-lg p-2 text-gray-400 transition hover:bg-indigo-50 hover:text-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                                  title="Edit employee"
                                >
                                  <MdEdit />
                                </button>

                                {!isSelfRow && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleToggleUserActive(
                                        user
                                      )
                                    }
                                    disabled={isBusy}
                                    className="rounded-lg p-2 text-gray-400 transition hover:bg-amber-50 hover:text-amber-500 disabled:cursor-not-allowed disabled:opacity-50"
                                    title={
                                      user.isActive
                                        ? "Disable account"
                                        : "Enable account"
                                    }
                                  >
                                    {user.isActive ? (
                                      <MdBlock />
                                    ) : (
                                      <MdCheckCircle />
                                    )}
                                  </button>
                                )}

                                {!isSelfRow && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleDeleteUser(
                                        user
                                      )
                                    }
                                    disabled={isBusy}
                                    className="rounded-lg p-2 text-gray-400 transition hover:bg-red-50 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-50"
                                    title="Delete employee"
                                  >
                                    <MdDelete />
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {usersLoading && users.length === 0 ? (
                <div className="px-6 py-12 text-center text-sm text-gray-400">
                  Loading employees...
                </div>
              ) : !isCurrentUserPortAdmin ? (
                <div className="px-6 py-12 text-center text-sm text-gray-400">
                  Only a Port Administrator can view and manage employee accounts.
                </div>
              ) : filteredUsers.length === 0 ? (
                <div className="px-6 py-12 text-center text-sm text-gray-400">
                  No employees found.
                </div>
              ) : null}
            </div>

            {isCurrentUserPortAdmin &&
              filteredUsers.length > 0 && (
                <div className="flex flex-col gap-3 border-t border-gray-100 px-5 py-4 dark:border-white/10 md:flex-row md:items-center md:justify-between">
                  <p className="text-xs text-gray-500 dark:text-gray-300">
                    Showing {firstIndex + 1} to{" "}
                    {Math.min(
                      firstIndex + pageSize,
                      filteredUsers.length
                    )}{" "}
                    of {filteredUsers.length}{" "}
                    {filteredUsers.length === 1
                      ? "employee"
                      : "employees"}
                  </p>

                  <div className="flex flex-wrap items-center gap-3">
                    <label className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-300">
                      Per page

                      <select
                        aria-label="Employees per page"
                        value={pageSize}
                        onChange={(event) => {
                          setPageSize(
                            Number(event.target.value)
                          );
                          setPage(1);
                        }}
                        className="rounded-lg bg-gray-50 px-2 py-1.5 text-xs font-semibold text-navy-700 outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-navy-700 dark:text-white"
                      >
                        {PAGE_SIZE_OPTIONS.map((size) => (
                          <option key={size} value={size}>
                            {size}
                          </option>
                        ))}
                      </select>
                    </label>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setPage(
                            Math.max(1, currentPage - 1)
                          )
                        }
                        disabled={currentPage <= 1}
                        className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:text-gray-300 dark:hover:bg-navy-700"
                      >
                        Previous
                      </button>

                      <span className="text-xs font-semibold text-gray-500 dark:text-gray-300">
                        Page {currentPage} of {pageCount}
                      </span>

                      <button
                        type="button"
                        onClick={() =>
                          setPage(
                            Math.min(
                              pageCount,
                              currentPage + 1
                            )
                          )
                        }
                        disabled={currentPage >= pageCount}
                        className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:text-gray-300 dark:hover:bg-navy-700"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                </div>
              )}
          </div>
        </>
      )}

      {/* =================================================
          ROLES & PERMISSIONS
          ================================================= */}

      {activeTab === "roles" && (
        <>
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-navy-700 dark:text-white">
                Roles & Permissions
              </h2>

              <p className="mt-1 text-xs text-gray-400">
                Assign feature-level access to each employee role.
              </p>
            </div>

            {isCurrentUserPortAdmin && (
              <button
                type="button"
                onClick={
                  handleOpenCreateRole
                }
                className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700"
              >
                <MdAdd className="text-lg" />
                Add New Role
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
            {/* ROLE LIST */}

            <div className="rounded-2xl bg-white p-4 shadow-sm dark:bg-navy-800">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-navy-700 dark:text-white">
                    Roles
                  </p>

                  <p className="text-xs text-gray-400">
                    {roles.length} roles,{" "}
                    {
                      roles.filter(
                        (role) => !role.fixedSystemRole
                      ).length
                    }{" "}
                    custom
                  </p>
                </div>

                <MdManageAccounts className="text-2xl text-indigo-500" />
              </div>

              <div className="space-y-2">
                {rolesLoading ? (
                  <div className="px-3 py-8 text-center text-sm text-gray-400">
                    Loading roles...
                  </div>
                ) : roles.length ===
                  0 ? (
                  <div className="px-3 py-8 text-center text-sm text-gray-400">
                    No roles available.
                  </div>
                ) : (
                  roles.map((role) => {
                    const isSelected =
                      selectedRoleId ===
                      role.id;

                    const permissionCount =
                      rolePermissions[
                        role.id
                      ]?.length || 0;

                    return (
                      <button
                        key={role.id}
                        type="button"
                        onClick={() =>
                          handleSelectRole(
                            role.id
                          )
                        }
                        className={`w-full rounded-xl border p-3 text-left transition ${
                          isSelected
                            ? "border-indigo-500 bg-indigo-50 dark:border-indigo-400 dark:bg-indigo-500/10"
                            : "border-gray-100 hover:border-indigo-200 hover:bg-gray-50 dark:border-white/10 dark:hover:bg-navy-700"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p
                                className={`truncate text-sm font-bold ${
                                  isSelected
                                    ? "text-indigo-600 dark:text-indigo-300"
                                    : "text-navy-700 dark:text-white"
                                }`}
                              >
                                {role.name}
                              </p>

                              {role.protected && (
                                <MdLock
                                  className="shrink-0 text-sm text-amber-500"
                                  title="Protected role"
                                />
                              )}

                              <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[9px] font-bold uppercase text-gray-500 dark:bg-navy-700 dark:text-gray-300">
                                {role.fixedSystemRole
                                  ? "Fixed"
                                  : "Custom"}
                              </span>
                            </div>

                            <p className="mt-1 line-clamp-2 text-xs text-gray-400">
                              {role.description}
                            </p>

                            {isCurrentUserPortAdmin && (
                              <p className="mt-1 text-[11px] font-semibold text-gray-500 dark:text-gray-300">
                                {employeeCountByRole[role.name] || 0}{" "}
                                {(employeeCountByRole[role.name] ||
                                  0) === 1
                                  ? "employee"
                                  : "employees"}
                              </p>
                            )}
                          </div>

                          <span
                            className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${
                              isSelected
                                ? "bg-indigo-600 text-white"
                                : "bg-gray-100 text-gray-500 dark:bg-navy-700 dark:text-gray-300"
                            }`}
                          >
                            {permissionCount}/
                            {
                              SYSTEM_PERMISSIONS.length
                            }
                          </span>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* PERMISSION PANEL */}

            <div className="xl:col-span-2">
              <div className="rounded-2xl bg-white shadow-sm dark:bg-navy-800">
                <div className="border-b border-gray-100 p-5 dark:border-white/10">
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-bold text-navy-700 dark:text-white">
                          {selectedRole?.name ||
                            "Select a Role"}
                        </h3>

                        {selectedRole?.protected && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold text-amber-600 dark:bg-amber-500/10 dark:text-amber-400">
                            <MdLock />
                            Protected
                          </span>
                        )}
                      </div>

                      <p className="mt-1 max-w-2xl text-xs text-gray-400">
                        {selectedRole?.description ||
                          "Select a role to view its permissions."}
                      </p>

                      {selectedRole &&
                        !selectedRole.protected &&
                        !permissionsLoading &&
                        selectedPermissions.length === 0 && (
                          <p className="mt-2 max-w-2xl text-xs font-semibold text-amber-600 dark:text-amber-400">
                            This role has no features yet, so employees with this role cannot open any page. Tick the features it needs, then press Save Permissions.
                          </p>
                        )}
                    </div>

                    {isCurrentUserPortAdmin &&
                      selectedRole && (
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              handleOpenEditRole(
                                selectedRole
                              )
                            }
                            disabled={savingRole}
                            className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:text-gray-300 dark:hover:bg-navy-700"
                          >
                            <MdEdit />
                            Edit Role
                          </button>

                          {!isFixedSystemRole(
                            selectedRole
                          ) && (
                            <button
                              type="button"
                              onClick={() =>
                                handleDeleteRole(
                                  selectedRole
                                )
                              }
                              disabled={savingRole}
                              className="flex items-center gap-1.5 rounded-lg border border-red-100 px-3 py-2 text-xs font-semibold text-red-500 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-500/20 dark:hover:bg-red-500/10"
                            >
                              <MdDelete />
                              Delete
                            </button>
                          )}
                        </div>
                      )}
                  </div>
                </div>

                <div className="border-b border-gray-100 p-4 dark:border-white/10">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-navy-700 dark:text-white">
                        Feature Permissions
                      </p>

                      <p className="text-xs text-gray-400">
                        Tick or untick the features available to this role. A ticked feature opens that whole module (viewing and changing).
                      </p>
                    </div>

                    {isCurrentUserPortAdmin &&
                      selectedRole && (
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={
                              enableAllPermissions
                            }
                            className="rounded-lg bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-600 hover:bg-indigo-100 dark:bg-indigo-500/10 dark:text-indigo-300"
                          >
                            Enable All
                          </button>

                          <button
                            type="button"
                            onClick={
                              disableAllPermissions
                            }
                            className="rounded-lg bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-200 dark:bg-navy-700 dark:text-gray-300"
                          >
                            Disable All
                          </button>
                        </div>
                      )}
                  </div>
                </div>

                <div className="divide-y divide-gray-100 dark:divide-white/5">
                  {!selectedRole ? (
                    <div className="px-5 py-12 text-center text-sm text-gray-400">
                      Select a role to view its permissions.
                    </div>
                  ) : permissionsLoading ? (
                    <div className="px-5 py-12 text-center text-sm text-gray-400">
                      Loading permissions...
                    </div>
                  ) : (
                    SYSTEM_PERMISSIONS.map(
                      (permission) => {
                        const enabled =
                          hasPermission(
                            permission.key
                          );

                        const protectedAdminPermission =
                          selectedRole?.protected;

                        return (
                          <label
                            key={permission.key}
                            className={`flex items-center gap-4 px-5 py-4 transition ${
                              isCurrentUserPortAdmin &&
                              !protectedAdminPermission
                                ? "cursor-pointer hover:bg-gray-50 dark:hover:bg-navy-700"
                                : isCurrentUserPortAdmin
                                  ? "cursor-pointer hover:bg-gray-50 dark:hover:bg-navy-700"
                                  : "cursor-default"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={enabled}
                              disabled={
                                !isCurrentUserPortAdmin ||
                                protectedAdminPermission
                              }
                              onChange={() =>
                                togglePermission(
                                  permission.key
                                )
                              }
                              className="peer sr-only"
                            />

                            <span
                              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border transition ${
                                enabled
                                  ? "border-indigo-600 bg-indigo-600 text-white"
                                  : "border-gray-300 bg-white dark:border-gray-600 dark:bg-navy-700"
                              }`}
                            >
                              {enabled && (
                                <MdCheck className="text-base" />
                              )}
                            </span>

                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-semibold text-navy-700 dark:text-white">
                                {permission.name}
                              </span>

                              <span className="mt-0.5 block text-xs text-gray-400">
                                {permission.description}
                              </span>
                            </span>

                            <span
                              className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${
                                enabled
                                  ? "bg-green-50 text-green-600 dark:bg-green-500/10 dark:text-green-400"
                                  : "bg-gray-100 text-gray-400 dark:bg-navy-700"
                              }`}
                            >
                              {enabled
                                ? "Enabled"
                                : "Disabled"}
                            </span>
                          </label>
                        );
                      }
                    )
                  )}
                </div>

                <div className="flex items-center justify-between border-t border-gray-100 p-5 dark:border-white/10">
                  <div>
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-300">
                      {selectedPermissions.length} of{" "}
                      {SYSTEM_PERMISSIONS.length} features enabled
                    </p>

                    <div className="mt-2 h-2 w-48 overflow-hidden rounded-full bg-gray-100 dark:bg-navy-700">
                      <div
                        className="h-full rounded-full bg-indigo-600 transition-all"
                        style={{
                          width: `${
                            SYSTEM_PERMISSIONS.length
                              ? (selectedPermissions.length /
                                  SYSTEM_PERMISSIONS.length) *
                                100
                              : 0
                          }%`,
                        }}
                      />
                    </div>
                  </div>

                  {isCurrentUserPortAdmin &&
                    selectedRole && (
                      <button
                        type="button"
                        onClick={
                          handleSavePermissions
                        }
                        disabled={
                          savingPermissions ||
                          permissionsLoading
                        }
                        className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <MdSave />
                        {savingPermissions
                          ? "Saving..."
                          : "Save Permissions"}
                      </button>
                    )}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* =================================================
          AUTHORIZATION CONFIRMATION MODAL
          ================================================= */}

      {showAuthorizationModal && (
        <ModalPortal>
          <div
            className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm"
            onMouseDown={(event) => {
              if (
                event.target ===
                event.currentTarget
              ) {
                closeAuthorizationModal();
              }
            }}
          >
            <div
              className="w-full max-w-md overflow-hidden rounded-2xl border border-indigo-100 bg-white shadow-2xl dark:border-white/10 dark:bg-navy-800"
              onMouseDown={(event) =>
                event.stopPropagation()
              }
            >
              <div className="p-6">
                <div className="mb-5 flex items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300">
                    <MdAdminPanelSettings className="text-2xl" />
                  </div>

                  <div className="min-w-0">
                    <h2 className="text-lg font-bold text-navy-700 dark:text-white">
                      Authorization Required
                    </h2>

                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-300">
                      Are you sure of Authorization?
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={
                      closeAuthorizationModal
                    }
                    className="ml-auto rounded-full p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-navy-700"
                    aria-label="Close authorization confirmation"
                  >
                    <MdClose className="text-xl" />
                  </button>
                </div>

                <div className="mb-5 rounded-xl border border-indigo-100 bg-indigo-50 p-4 dark:border-indigo-500/20 dark:bg-indigo-500/5">
                  <div className="flex items-start gap-3">
                    <MdLock className="mt-0.5 shrink-0 text-indigo-500" />

                    <div>
                      <p className="text-sm font-semibold text-indigo-700 dark:text-indigo-300">
                        Confirm permission changes
                      </p>

                      <p className="mt-1 text-xs leading-5 text-indigo-600 dark:text-gray-400">
                        You are about to authorize{" "}
                        <span className="font-semibold">
                          {selectedRole?.name}
                        </span>{" "}
                        with{" "}
                        <span className="font-semibold">
                          {selectedPermissions.length}
                        </span>{" "}
                        of{" "}
                        {
                          SYSTEM_PERMISSIONS.length
                        } available features.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={
                      closeAuthorizationModal
                    }
                    disabled={
                      savingPermissions
                    }
                    className="rounded-xl border border-gray-200 px-5 py-3 text-sm font-semibold text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:text-gray-300 dark:hover:bg-navy-700"
                  >
                    Cancel
                  </button>

                  <button
                    type="button"
                    onClick={
                      confirmSavePermissions
                    }
                    disabled={
                      savingPermissions
                    }
                    className="flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <MdCheck className="text-lg" />
                    {savingPermissions
                      ? "Saving..."
                      : "Authorize & Save"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* =================================================
          CREATE / EDIT EMPLOYEE MODAL
          ================================================= */}

      {showUserModal && (
        <ModalPortal>
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center overflow-y-auto bg-black/70 px-4 py-8 backdrop-blur-sm"
            onMouseDown={(event) => {
              if (
                event.target ===
                event.currentTarget
              ) {
                closeUserModal();
              }
            }}
          >
            <div
              className="my-auto max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl dark:bg-navy-800"
              onMouseDown={(event) =>
                event.stopPropagation()
              }
            >
              <div className="mb-6 flex items-start justify-between">
                <div>
                  <h2 className="text-xl font-bold text-navy-700 dark:text-white">
                    {editingUser
                      ? "Edit Employee Account"
                      : "Create Employee Account"}
                  </h2>

                  <p className="mt-1 text-xs text-gray-400">
                    Create the employee's Admin ID, password and employee role.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={closeUserModal}
                  className="rounded-full p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-navy-700"
                >
                  <MdClose className="text-xl" />
                </button>
              </div>

              <div className="mb-5 rounded-xl border border-indigo-100 bg-indigo-50 p-4 dark:border-indigo-500/20 dark:bg-indigo-500/5">
                <div className="flex items-start gap-3">
                  <MdAdminPanelSettings className="mt-0.5 text-xl text-indigo-500" />

                  <div>
                    <p className="text-sm font-bold text-indigo-700 dark:text-indigo-300">
                      Employee Login Credentials
                    </p>

                    <p className="mt-1 text-xs leading-5 text-indigo-600 dark:text-gray-400">
                      The Admin ID is used by the employee to sign in to the Port of Singapore system. Passwords are securely hashed by the backend and cannot be retrieved as plaintext.
                    </p>
                  </div>
                </div>
              </div>

              {userFormError && (
                <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">
                  {userFormError}
                </div>
              )}

              <form
                onSubmit={handleSaveUser}
                className="space-y-5"
              >
                {/* EMPLOYEE NAME */}

                <div>
                  <label className="mb-2 block text-xs font-semibold text-gray-500 dark:text-gray-300">
                    Employee Name
                    <span className="ml-1 text-red-500">
                      *
                    </span>
                  </label>

                  <input
                    value={userForm.name}
                    onChange={(event) =>
                      setUserForm(
                        (previous) => ({
                          ...previous,
                          name: event.target.value,
                        })
                      )
                    }
                    placeholder="Enter employee full name"
                    required
                    maxLength={100}
                    autoComplete="off"
                    className="w-full rounded-xl bg-gray-50 px-4 py-3 text-sm text-navy-700 outline-none transition focus:ring-2 focus:ring-indigo-500 dark:bg-navy-700 dark:text-white"
                  />
                </div>

                {/* ADMIN ID */}

                <div>
                  <label className="mb-2 block text-xs font-semibold text-gray-500 dark:text-gray-300">
                    Admin ID / Username
                    <span className="ml-1 text-red-500">
                      *
                    </span>
                  </label>

                  <input
                    value={userForm.adminId}
                    onChange={(event) =>
                      setUserForm(
                        (previous) => ({
                          ...previous,
                          adminId:
                            event.target.value
                              .replace(
                                /\s/g,
                                ""
                              )
                              .toLowerCase(),
                        })
                      )
                    }
                    placeholder="e.g. john.doe"
                    required
                    maxLength={30}
                    autoComplete="off"
                    spellCheck={false}
                    className="w-full rounded-xl bg-gray-50 px-4 py-3 text-sm text-navy-700 outline-none transition focus:ring-2 focus:ring-indigo-500 dark:bg-navy-700 dark:text-white"
                  />

                  <p className="mt-1.5 text-[11px] text-gray-400">
                    This is the ID the employee will enter on the login screen: 3 to 30 letters, numbers, dots, dashes or underscores.
                  </p>
                </div>

                {/* PASSWORD */}

                <div>
                  <label className="mb-2 block text-xs font-semibold text-gray-500 dark:text-gray-300">
                    {editingUser
                      ? "New Password (optional)"
                      : "Initial Password"}

                    {!editingUser && (
                      <span className="ml-1 text-red-500">
                        *
                      </span>
                    )}
                  </label>

                  <div className="relative">
                    <input
                      type={
                        showPassword
                          ? "text"
                          : "password"
                      }
                      value={
                        userForm.password
                      }
                      onChange={(event) =>
                        setUserForm(
                          (previous) => ({
                            ...previous,
                            password:
                              event.target
                                .value,
                          })
                        )
                      }
                      placeholder={
                        editingUser
                          ? "Enter a new password only if changing it"
                          : "Create initial password"
                      }
                      required={!editingUser}
                      autoComplete="new-password"
                      className="w-full rounded-xl bg-gray-50 px-4 py-3 pr-12 text-sm text-navy-700 outline-none transition focus:ring-2 focus:ring-indigo-500 dark:bg-navy-700 dark:text-white"
                    />

                    <button
                      type="button"
                      onClick={() =>
                        setShowPassword(
                          (previous) =>
                            !previous
                        )
                      }
                      className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-gray-400 hover:bg-gray-200 hover:text-gray-600 dark:hover:bg-navy-600"
                      title={
                        showPassword
                          ? "Hide password"
                          : "Show password"
                      }
                    >
                      {showPassword ? (
                        <MdVisibilityOff />
                      ) : (
                        <MdVisibility />
                      )}
                    </button>
                  </div>

                  <p className="mt-1.5 text-[11px] text-gray-400">
                    The password will be hashed by FastAPI before being stored in PostgreSQL.
                  </p>
                </div>

                {/* EMPLOYEE ROLE */}

                <div>
                  <label className="mb-2 block text-xs font-semibold text-gray-500 dark:text-gray-300">
                    Employee Role
                    <span className="ml-1 text-red-500">
                      *
                    </span>
                  </label>

                  <select
                    value={userForm.role}
                    onChange={(event) =>
                      setUserForm(
                        (previous) => ({
                          ...previous,
                          role: event.target.value,
                        })
                      )
                    }
                    required
                    disabled={Boolean(
                      editingUser &&
                        isSelf(editingUser)
                    )}
                    className="w-full rounded-xl bg-gray-50 px-4 py-3 text-sm text-navy-700 outline-none transition focus:ring-2 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-navy-700 dark:text-white"
                  >
                    <option value="" disabled>
                      Select a role
                    </option>

                    {assignableRoles
                      .filter((role) => role.fixedSystemRole)
                      .map((role) => (
                        <option
                          key={role.id}
                          value={role.name}
                        >
                          {role.name}
                        </option>
                      ))}

                    {assignableRoles.some(
                      (role) => !role.fixedSystemRole
                    ) && (
                      <optgroup label="Custom roles">
                        {assignableRoles
                          .filter(
                            (role) => !role.fixedSystemRole
                          )
                          .map((role) => (
                            <option
                              key={role.id}
                              value={role.name}
                            >
                              {role.name}
                            </option>
                          ))}
                      </optgroup>
                    )}
                  </select>

                  <p className="mt-1.5 text-[11px] text-gray-400">
                    {editingUser && isSelf(editingUser)
                      ? "You cannot change your own role."
                      : "The selected employee role determines which system features the employee can access. Roles you create under Roles & Permissions appear in this list."}
                  </p>

                  {!(
                    editingUser &&
                    isAdministratorRole(editingUser.role)
                  ) && (
                    <p className="mt-1 text-[11px] text-gray-400">
                      There can be only one Port Administrator, so that role is not offered here.
                    </p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={savingUser}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <MdSave />

                  {savingUser
                    ? "Saving..."
                    : editingUser
                      ? "Save Employee Changes"
                      : "Create Employee Account"}
                </button>
              </form>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* =================================================
          CREATE / EDIT ROLE MODAL
          ================================================= */}

      {showRoleModal && (
        <ModalPortal>
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center overflow-y-auto bg-black/70 px-4 py-8 backdrop-blur-sm"
            onMouseDown={(event) => {
              if (
                event.target ===
                event.currentTarget
              ) {
                closeRoleModal();
              }
            }}
          >
            <div
              className="my-auto max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl dark:bg-navy-800"
              onMouseDown={(event) =>
                event.stopPropagation()
              }
            >
              <div className="mb-6 flex items-start justify-between">
                <div>
                  <h2 className="text-xl font-bold text-navy-700 dark:text-white">
                    {editingRole
                      ? "Edit Role"
                      : "Create New Role"}
                  </h2>

                  <p className="mt-1 text-xs text-gray-400">
                    Create a custom port-system role. A new role starts with no features: tick its features on the Roles & Permissions screen afterwards.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={closeRoleModal}
                  className="rounded-full p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-navy-700"
                >
                  <MdClose className="text-xl" />
                </button>
              </div>

              {roleFormError && (
                <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">
                  {roleFormError}
                </div>
              )}

              <form
                onSubmit={handleSaveRole}
                className="space-y-5"
              >
                {/* ROLE NAME */}

                <div>
                  <label className="mb-2 block text-xs font-semibold text-gray-500 dark:text-gray-300">
                    Role Name
                    <span className="ml-1 text-red-500">
                      *
                    </span>
                  </label>

                  <input
                    value={roleForm.name}
                    onChange={(event) =>
                      setRoleForm(
                        (previous) => ({
                          ...previous,
                          name: event.target.value,
                        })
                      )
                    }
                    disabled={Boolean(
                      editingRole &&
                      isFixedSystemRole(
                        editingRole
                      )
                    )}
                    placeholder="e.g. Harbour Pilot"
                    required
                    maxLength={50}
                    autoComplete="off"
                    className={`w-full rounded-xl px-4 py-3 text-sm outline-none transition focus:ring-2 focus:ring-indigo-500 dark:text-white ${
                      editingRole &&
                      isFixedSystemRole(
                        editingRole
                      )
                        ? "cursor-not-allowed bg-gray-100 text-gray-500 dark:bg-navy-700 dark:text-gray-400"
                        : "bg-gray-50 text-navy-700 dark:bg-navy-700"
                    }`}
                  />
                </div>

                {/* DESCRIPTION */}

                <div>
                  <label className="mb-2 block text-xs font-semibold text-gray-500 dark:text-gray-300">
                    Description
                  </label>

                  <textarea
                    value={
                      roleForm.description
                    }
                    onChange={(event) =>
                      setRoleForm(
                        (previous) => ({
                          ...previous,
                          description:
                            event.target.value,
                        })
                      )
                    }
                    placeholder="Describe the responsibility of this role..."
                    rows={4}
                    maxLength={255}
                    className="w-full resize-none rounded-xl bg-gray-50 px-4 py-3 text-sm text-navy-700 outline-none transition focus:ring-2 focus:ring-indigo-500 dark:bg-navy-700 dark:text-white"
                  />
                </div>

                {/* PROTECTED ROLE */}

                {editingRole &&
                  isFixedSystemRole(
                    editingRole
                  ) && (
                    <div className="flex items-start gap-3 rounded-xl bg-amber-50 p-4 dark:bg-amber-500/10">
                      <MdLock className="mt-0.5 text-amber-500" />

                      <p className="text-xs leading-5 text-amber-700 dark:text-amber-300">
                        Fixed system roles cannot be renamed or deleted. Their feature permissions can be changed by the Port Administrator.
                      </p>
                    </div>
                  )}

                <button
                  type="submit"
                  disabled={savingRole}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <MdSave />

                  {savingRole
                    ? "Saving..."
                    : editingRole
                      ? "Save Role Changes"
                      : "Create Role"}
                </button>
              </form>
            </div>
          </div>
        </ModalPortal>
      )}
    </div>
  );
};

export default UserManagement;