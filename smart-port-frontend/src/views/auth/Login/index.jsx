import React from "react";
import { useNavigate } from "react-router-dom";
import { MdLock, MdAdminPanelSettings } from "react-icons/md";

import karwarPortLogo from "assets/img/port/karwar-port-logo.png";
import authService from "../../../layouts/auth/authService.jsx";

const Login = () => {
  const navigate = useNavigate();

  const [adminId, setAdminId] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);

  const handleLogin = (e) => {
    e.preventDefault();
    setError("");

    const identifier = adminId.trim();

    if (!identifier || !password) {
      setError("Please enter Admin ID and Password.");
      return;
    }

    setIsLoading(true);

    const result = authService.login(identifier, password);

    if (result.success) {
      navigate("/admin/default", { replace: true });
      return;
    }

    setError(result.message);
    setIsLoading(false);
  };

  return (
    <div className="relative min-h-screen w-full overflow-hidden">

      {/* Background */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{
          backgroundImage:
            "url('https://images.unsplash.com/photo-1494412651409-8963ce7935a7?auto=format&fit=crop&w=2000&q=85')",
        }}
      />

      <div className="absolute inset-0 bg-[#071333]/60" />

      {/* Main Card */}
      <div className="relative z-10 flex min-h-screen items-center justify-center px-5 py-8">

        <div className="grid w-full max-w-4xl overflow-hidden rounded-[24px] bg-white/10 shadow-2xl backdrop-blur-md lg:grid-cols-2">

          {/* LEFT SIDE */}
          <div className="hidden flex-col justify-center p-9 text-white lg:flex">

            <div className="max-w-md">

              {/* KARWAR PORT LOGO */}
              <div className="mb-7 flex w-full justify-center">
                <img
                  src={karwarPortLogo}
                  alt="Karwar Port Logo"
                  className="h-32 w-32 object-contain"
                />
              </div>

              <p className="text-center text-xs font-semibold uppercase tracking-[0.22em] text-blue-200">
                Government of Karnataka
              </p>

              <h1 className="mt-3 text-center text-4xl font-bold leading-tight">
                Karwar Port
              </h1>

              <h2 className="mt-2 text-center text-xl font-medium text-blue-100">
                Smart Sea Port Management System
              </h2>

              <p className="mt-5 text-center text-sm leading-6 text-blue-100">
                Centralized digital management of vessels, berths,
                cargo, gate operations, weather, safety,
                communication and port performance.
              </p>

            </div>
          </div>

          {/* LOGIN PANEL */}
          <div className="flex items-center justify-center bg-white/95 p-5 dark:bg-navy-800/95 sm:p-7 lg:p-9">

            <div className="w-full max-w-sm">

              {/* Header */}
              <div className="mb-6">

                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-500 text-white shadow-lg">
                  <MdLock className="h-6 w-6" />
                </div>

                <h2 className="text-2xl font-bold text-navy-700 dark:text-white">
                  Port Administration
                </h2>

                <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-300">
                  Sign in to access the Karwar Port Management System.
                </p>

              </div>

              {/* Error */}
              {error && (
                <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-600">
                  {error}
                </div>
              )}

              <form onSubmit={handleLogin}>

                {/* Admin ID */}
                <div className="mb-4">
                  <label className="mb-1.5 block text-xs font-semibold text-navy-700 dark:text-white">
                    Admin ID
                  </label>

                  <div className="relative">
                    <MdAdminPanelSettings className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />

                    <input
                      type="text"
                      value={adminId}
                      onChange={(e) => {
                        setAdminId(e.target.value);
                        setError("");
                      }}
                      placeholder="Enter Admin ID"
                      autoComplete="username"
                      disabled={isLoading}
                      className="h-11 w-full rounded-lg border border-gray-200 bg-white pl-10 pr-3 text-xs font-medium text-navy-700 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:bg-navy-900 dark:text-white"
                    />
                  </div>
                </div>

                {/* Password */}
                <div className="mb-5">
                  <label className="mb-1.5 block text-xs font-semibold text-navy-700 dark:text-white">
                    Password
                  </label>

                  <div className="relative">
                    <MdLock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />

                    <input
                      type="password"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        setError("");
                      }}
                      placeholder="Enter Password"
                      autoComplete="current-password"
                      disabled={isLoading}
                      className="h-11 w-full rounded-lg border border-gray-200 bg-white pl-10 pr-3 text-xs font-medium text-navy-700 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:bg-navy-900 dark:text-white"
                    />
                  </div>
                </div>

                {/* Login */}
                <button
                  type="submit"
                  disabled={isLoading}
                  className="flex h-11 w-full items-center justify-center rounded-lg bg-brand-500 text-xs font-bold text-white shadow-lg shadow-brand-500/20 transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isLoading ? "Signing in..." : "Login"}
                </button>

              </form>

              {/* Footer */}
              <div className="mt-6 border-t border-gray-200 pt-4 text-center dark:border-white/10">
                <p className="text-[11px] leading-4 text-gray-400">
                  Authorized personnel only.
                  <br />
                  Karwar Port Smart Sea Port Management System
                </p>
              </div>

            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default Login;