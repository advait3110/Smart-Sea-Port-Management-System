import React from "react";

import {
  MdPeople,
  MdAdd,
  MdSearch,
  MdEdit,
  MdDelete,
  MdAdminPanelSettings,
  MdSecurity,
  MdClose,
} from "react-icons/md";

import authService from "../../../layouts/auth/authService.jsx";

import {
  getActiveSessionsList,
  isUserActive,
} from "../../../layouts/auth/sessionManager";

// =========================================================
// USERS
// =========================================================

const initialUsers = [
  {
    id: "U001",
    name: "Port Administrator",
    email: "admin@karwarport.com",
    role: "Port Administrator",
    department: "Administration",
  },
  {
    id: "U002",
    name: "Marine Officer",
    email: "marine@karwarport.com",
    role: "Marine Officer",
    department: "Marine Operations",
  },
  {
    id: "U003",
    name: "Port Manager",
    email: "manager@karwarport.com",
    role: "Port Manager",
    department: "Port Operations",
  },
  {
    id: "U004",
    name: "Cargo Officer",
    email: "cargo@karwarport.com",
    role: "Cargo Officer",
    department: "Cargo Operations",
  },
  {
    id: "U005",
    name: "Gate & Security Officer",
    email: "gate@karwarport.com",
    role: "Gate & Security Officer",
    department: "Gate & Security",
  },
  {
    id: "U006",
    name: "Maintenance Officer",
    email: "maintenance@karwarport.com",
    role: "Maintenance Officer",
    department: "Engineering",
  },
  {
    id: "U007",
    name: "Port Executive",
    email: "executive@karwarport.com",
    role: "Executive",
    department: "Management",
  },
];

const roles = [
  "Port Administrator",
  "Port Manager",
  "Marine Officer",
  "Cargo Officer",
  "Gate & Security Officer",
  "Maintenance Officer",
  "Executive",
];

// =========================================================
// COMPONENT
// =========================================================

const UserManagement = () => {
  const [users, setUsers] = React.useState(initialUsers);
  const [search, setSearch] = React.useState("");
  const [showModal, setShowModal] = React.useState(false);
  const [editingUser, setEditingUser] = React.useState(null);

  const [currentUser, setCurrentUser] = React.useState(() =>
    authService.getCurrentUser()
  );

  const [activeSessions, setActiveSessions] = React.useState(() =>
    getActiveSessionsList()
  );

  // =======================================================
  // REFRESH SESSION INFORMATION
  // =======================================================

  const refreshSessions = React.useCallback(() => {
    setCurrentUser(authService.getCurrentUser());
    setActiveSessions(getActiveSessionsList());
  }, []);

  // =======================================================
  // SESSION MONITORING
  // =======================================================

  React.useEffect(() => {
    refreshSessions();

    const handleStorage = (event) => {
      if (
        event.key === "karwarPortActiveSessions" ||
        event.key === "karwarPortCurrentUser"
      ) {
        refreshSessions();
      }
    };

    window.addEventListener("storage", handleStorage);

    // Lightweight refresh so expired sessions are reflected.
    const interval = setInterval(() => {
      refreshSessions();
    }, 30000);

    return () => {
      window.removeEventListener("storage", handleStorage);
      clearInterval(interval);
    };
  }, [refreshSessions]);

  // =======================================================
  // SEARCH
  // =======================================================

  const filteredUsers = users.filter((user) => {
    const value = search.toLowerCase().trim();

    if (!value) {
      return true;
    }

    return (
      user.name.toLowerCase().includes(value) ||
      user.email.toLowerCase().includes(value) ||
      user.role.toLowerCase().includes(value) ||
      user.department.toLowerCase().includes(value)
    );
  });

  // =======================================================
  // ADD USER
  // =======================================================

  const handleAddUser = () => {
    setEditingUser(null);
    setShowModal(true);
  };

  // =======================================================
  // EDIT USER
  // =======================================================

  const handleEditUser = (user) => {
    setEditingUser(user);
    setShowModal(true);
  };

  // =======================================================
  // DELETE USER
  // =======================================================

  const handleDeleteUser = (id) => {
    if (window.confirm("Delete this user?")) {
      setUsers((previous) =>
        previous.filter((user) => user.id !== id)
      );
    }
  };

  // =======================================================
  // SAVE USER
  // =======================================================

  const handleSaveUser = (event) => {
    event.preventDefault();

    const form = new FormData(event.target);

    const user = {
      id: editingUser?.id || `U${Date.now()}`,
      name: form.get("name"),
      email: form.get("email"),
      role: form.get("role"),
      department: form.get("department"),
    };

    if (editingUser) {
      setUsers((previous) =>
        previous.map((item) =>
          item.id === editingUser.id ? user : item
        )
      );
    } else {
      setUsers((previous) => [...previous, user]);
    }

    setShowModal(false);
  };

  // =======================================================
  // USER STATUS
  // =======================================================

  const getUserStatus = (user) => {
    return isUserActive(user.id);
  };

  // =======================================================
  // CURRENT SESSION
  // =======================================================

  const currentSessionRole = currentUser?.role || "";
  const currentSessionName = currentUser?.name || "";

  // =========================================================
  // RENDER
  // =========================================================

  return (
    <div className="mt-3">

      {/* ===================================================
          SECURITY BANNER
          =================================================== */}

      <div className="mb-5 flex items-center gap-3 rounded-2xl border border-indigo-100 bg-indigo-50 p-4 dark:border-indigo-500/20 dark:bg-navy-800">

        <MdAdminPanelSettings className="h-6 w-6 text-indigo-500" />

        <div>
          <p className="text-sm font-bold text-indigo-700 dark:text-indigo-300">
            RBAC Administration
          </p>

          <p className="text-xs text-indigo-600 dark:text-gray-400">
            User status reflects active sessions across the port system.
          </p>
        </div>

      </div>

      {/* ===================================================
          CURRENT SESSION
          =================================================== */}

      <div className="mb-5 rounded-xl bg-white px-4 py-3 shadow-sm dark:bg-navy-800">

        <div className="flex items-center justify-between">

          <div>

            <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
              Current Session
            </p>

            <p className="mt-1 text-sm font-bold text-navy-700 dark:text-white">
              {currentSessionName || "No active session"}
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

            {currentUser ? "Authenticated" : "Not Authenticated"}
          </span>

        </div>

      </div>

      {/* ===================================================
          SEARCH
          =================================================== */}

      <div className="mb-5 flex items-center rounded-xl bg-white px-4 py-3 shadow-sm dark:bg-navy-800">

        <MdSearch className="mr-3 h-5 w-5 text-gray-400" />

        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search users, roles or departments..."
          className="w-full bg-transparent text-sm text-navy-700 outline-none dark:text-white"
        />

      </div>

      {/* ===================================================
          USER TABLE
          =================================================== */}

      <div className="overflow-hidden rounded-2xl bg-white shadow-sm dark:bg-navy-800">

        <div className="overflow-x-auto">

          <table className="w-full">

            <thead>
              <tr className="border-b border-gray-100 dark:border-white/10">

                <th className="px-5 py-4 text-left text-xs font-bold uppercase text-gray-400">
                  User
                </th>

                <th className="px-5 py-4 text-left text-xs font-bold uppercase text-gray-400">
                  Role
                </th>

                <th className="px-5 py-4 text-left text-xs font-bold uppercase text-gray-400">
                  Department
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

              {filteredUsers.map((user) => {

                const isActive = getUserStatus(user);

                return (
                  <tr
                    key={user.id}
                    className="border-b border-gray-50 transition hover:bg-gray-50 dark:border-white/5 dark:hover:bg-navy-700"
                  >

                    {/* USER */}

                    <td className="px-5 py-4">

                      <div className="flex items-center gap-3">

                        <div
                          className={`flex h-10 w-10 items-center justify-center rounded-full text-xs font-bold ${
                            isActive
                              ? "bg-indigo-500/10 text-indigo-500"
                              : "bg-gray-100 text-gray-400 dark:bg-navy-700 dark:text-gray-500"
                          }`}
                        >
                          {user.name
                            .split(" ")
                            .map((word) => word[0])
                            .slice(0, 2)
                            .join("")}
                        </div>

                        <div>

                          <p className="text-sm font-bold text-navy-700 dark:text-white">
                            {user.name}
                          </p>

                          <p className="text-xs text-gray-400">
                            {user.email}
                          </p>

                        </div>

                      </div>

                    </td>

                    {/* ROLE */}

                    <td className="px-5 py-4">

                      <span
                        className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${
                          isActive
                            ? "bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300"
                            : "bg-gray-100 text-gray-500 dark:bg-navy-700 dark:text-gray-400"
                        }`}
                      >
                        <MdSecurity />
                        {user.role}
                      </span>

                    </td>

                    {/* DEPARTMENT */}

                    <td className="px-5 py-4 text-sm text-gray-500 dark:text-gray-300">
                      {user.department}
                    </td>

                    {/* STATUS */}

                    <td className="px-5 py-4">

                      <span
                        className={`inline-flex items-center gap-2 text-xs font-semibold ${
                          isActive
                            ? "text-green-500"
                            : "text-gray-400"
                        }`}
                      >

                        <span
                          className={`h-2 w-2 rounded-full ${
                            isActive
                              ? "bg-green-500"
                              : "bg-gray-400"
                          }`}
                        />

                        {isActive ? "Active" : "Inactive"}

                      </span>

                    </td>

                    {/* ACTIONS */}

                    <td className="px-5 py-4">

                      <div className="flex justify-end gap-1">

                        <button
                          onClick={() => handleEditUser(user)}
                          className="rounded-lg p-2 text-gray-400 transition hover:bg-indigo-50 hover:text-indigo-500"
                          title="Edit user"
                        >
                          <MdEdit />
                        </button>

                        <button
                          onClick={() => handleDeleteUser(user.id)}
                          className="rounded-lg p-2 text-gray-400 transition hover:bg-red-50 hover:text-red-500"
                          title="Delete user"
                        >
                          <MdDelete />
                        </button>

                      </div>

                    </td>

                  </tr>
                );
              })}

            </tbody>

          </table>

        </div>

      </div>

      {/* ===================================================
          ADD / EDIT USER MODAL
          =================================================== */}

      {showModal && (

        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">

          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl dark:bg-navy-800">

            <div className="mb-6 flex items-center justify-between">

              <div>

                <h2 className="text-xl font-bold text-navy-700 dark:text-white">
                  {editingUser ? "Edit User" : "Add User"}
                </h2>

                <p className="mt-1 text-xs text-gray-400">
                  Configure account and RBAC role.
                </p>

              </div>

              <button
                onClick={() => setShowModal(false)}
                className="rounded-full p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-navy-700"
              >
                <MdClose />
              </button>

            </div>

            <form
              onSubmit={handleSaveUser}
              className="space-y-4"
            >

              <input
                name="name"
                defaultValue={editingUser?.name || ""}
                placeholder="Full name"
                required
                className="w-full rounded-xl bg-gray-50 px-4 py-3 text-sm outline-none dark:bg-navy-700 dark:text-white"
              />

              <input
                name="email"
                type="email"
                defaultValue={editingUser?.email || ""}
                placeholder="Email address"
                required
                className="w-full rounded-xl bg-gray-50 px-4 py-3 text-sm outline-none dark:bg-navy-700 dark:text-white"
              />

              <select
                name="role"
                defaultValue={editingUser?.role || roles[0]}
                className="w-full rounded-xl bg-gray-50 px-4 py-3 text-sm outline-none dark:bg-navy-700 dark:text-white"
              >
                {roles.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>

              <input
                name="department"
                defaultValue={editingUser?.department || ""}
                placeholder="Department"
                required
                className="w-full rounded-xl bg-gray-50 px-4 py-3 text-sm outline-none dark:bg-navy-700 dark:text-white"
              />

              <button
                type="submit"
                className="w-full rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white hover:bg-indigo-700"
              >
                {editingUser
                  ? "Save Changes"
                  : "Create User"}
              </button>

            </form>

          </div>

        </div>

      )}

    </div>
  );
};

export default UserManagement;