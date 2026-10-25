import React from "react";

import { useNavigate } from "react-router-dom";

import {
  MdLock,
  MdAdminPanelSettings,
} from "react-icons/md";

import portLogo from "assets/img/port/singapore-harbor.png";

import authService from "../../../layouts/auth/authService.jsx";

// =========================================================
// LOGIN / LOGOUT TRANSITIONS
// =========================================================

const LOGIN_TRANSITION_KEY =
  "karwarPortLoginTransition";

const LOGOUT_TRANSITION_KEY =
  "karwarPortLogoutTransition";

const LOGIN_EXIT_DURATION = 300;

// =========================================================
// THEME STORAGE
// =========================================================

const THEME_STORAGE_KEY = "karwarPortTheme";

// =========================================================
// THEME HELPERS
// =========================================================

const getSavedTheme = () => {
  const savedTheme =
    localStorage.getItem(THEME_STORAGE_KEY) ||
    localStorage.getItem("theme") ||
    localStorage.getItem("themeMode") ||
    localStorage.getItem("horizon-theme");

  if (
    savedTheme === "dark" ||
    savedTheme === "light"
  ) {
    return savedTheme;
  }

  if (
    document.documentElement.classList.contains(
      "dark"
    )
  ) {
    return "dark";
  }

  if (
    document.body.classList.contains("dark")
  ) {
    return "dark";
  }

  return "light";
};

// =========================================================
// APPLY THEME
// =========================================================

const applyTheme = (selectedTheme) => {
  const isDark =
    selectedTheme === "dark";

  if (isDark) {
    document.documentElement.classList.add(
      "dark"
    );

    document.body.classList.add(
      "dark"
    );
  } else {
    document.documentElement.classList.remove(
      "dark"
    );

    document.body.classList.remove(
      "dark"
    );
  }
};

// =========================================================
// LOGIN ERROR MESSAGE NORMALIZER
// =========================================================
//
// FastAPI can return errors in different shapes:
//
// 1. { detail: "Incorrect username or password." }
//
// 2. { detail: [{ msg: "Field required" }] }
//
// 3. { message: "Something went wrong." }
//
// 4. Error objects
//
// 5. Plain strings
//
// This function guarantees that the React UI receives
// a STRING and never tries to display an object.
// =========================================================

const getReadableErrorMessage = (
  errorValue,
  fallback = "Unable to authenticate the user."
) => {
  if (
    errorValue === null ||
    errorValue === undefined
  ) {
    return fallback;
  }

  // Already a string.
  if (typeof errorValue === "string") {
    const cleaned = errorValue.trim();

    if (!cleaned) {
      return fallback;
    }

    // Handle the exact bad value currently appearing
    // in the login screen.
    if (cleaned === "[object Object]") {
      return fallback;
    }

    return cleaned;
  }

  // Error instance.
  if (
    errorValue instanceof Error &&
    typeof errorValue.message === "string"
  ) {
    return getReadableErrorMessage(
      errorValue.message,
      fallback
    );
  }

  // Arrays are commonly returned by FastAPI
  // validation errors.
  if (Array.isArray(errorValue)) {
    const messages = errorValue
      .map((item) => {
        if (
          item &&
          typeof item === "object"
        ) {
          if (
            typeof item.msg === "string"
          ) {
            return item.msg;
          }

          if (
            typeof item.message === "string"
          ) {
            return item.message;
          }

          if (
            typeof item.detail === "string"
          ) {
            return item.detail;
          }
        }

        if (typeof item === "string") {
          return item;
        }

        return null;
      })
      .filter(Boolean);

    if (messages.length > 0) {
      return messages.join(" ");
    }

    return fallback;
  }

  // Objects returned by FastAPI/API helpers.
  if (
    typeof errorValue === "object"
  ) {
    if (
      typeof errorValue.detail === "string"
    ) {
      return errorValue.detail;
    }

    if (
      Array.isArray(errorValue.detail)
    ) {
      return getReadableErrorMessage(
        errorValue.detail,
        fallback
      );
    }

    if (
      typeof errorValue.message === "string"
    ) {
      return errorValue.message;
    }

    if (
      typeof errorValue.error === "string"
    ) {
      return errorValue.error;
    }

    if (
      errorValue.response &&
      typeof errorValue.response === "object"
    ) {
      if (
        typeof errorValue.response.detail ===
          "string"
      ) {
        return errorValue.response.detail;
      }

      if (
        errorValue.response.data
      ) {
        return getReadableErrorMessage(
          errorValue.response.data,
          fallback
        );
      }
    }

    if (errorValue.data) {
      return getReadableErrorMessage(
        errorValue.data,
        fallback
      );
    }

    // Last-resort conversion.
    try {
      const serialized =
        JSON.stringify(errorValue);

      if (
        serialized &&
        serialized !== "{}"
      ) {
        return serialized;
      }
    } catch (serializationError) {
      console.error(
        "Unable to serialize login error:",
        serializationError
      );
    }
  }

  return fallback;
};

// =========================================================
// LOGIN COMPONENT
// =========================================================

const Login = () => {
  const navigate = useNavigate();

  const [adminId, setAdminId] =
    React.useState("");

  const [password, setPassword] =
    React.useState("");

  const [error, setError] =
    React.useState("");

  const [isLoading, setIsLoading] =
    React.useState(false);

  const [isExiting, setIsExiting] =
    React.useState(false);

  // When true, the login page is initially
  // hidden and then smoothly enters after logout.
  const [isEntering, setIsEntering] =
    React.useState(() => {
      return (
        sessionStorage.getItem(
          LOGOUT_TRANSITION_KEY
        ) === "true"
      );
    });

  const [theme, setTheme] =
    React.useState(getSavedTheme);

  // =======================================================
  // LOAD SAVED THEME + LOGOUT TRANSITION
  // =======================================================

  React.useEffect(() => {
    const savedTheme =
      getSavedTheme();

    setTheme(savedTheme);

    // Keep the login page synchronized with
    // the application's saved theme.
    applyTheme(savedTheme);

    // Check whether the login page was reached
    // through the dashboard logout action.
    const cameFromLogout =
      sessionStorage.getItem(
        LOGOUT_TRANSITION_KEY
      ) === "true";

    if (!cameFromLogout) {
      return;
    }

    // Consume the flag immediately so a normal
    // browser refresh does not replay the transition.
    sessionStorage.removeItem(
      LOGOUT_TRANSITION_KEY
    );

    // Wait for the initial hidden state to be painted,
    // then start the smooth entrance.
    const frame =
      window.requestAnimationFrame(() => {
        setIsEntering(false);
      });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, []);

  // =======================================================
  // LOGIN
  // =======================================================

  const handleLogin = async (e) => {
    e.preventDefault();

    // Prevent duplicate submissions while
    // authentication or transition is running.
    if (
      isLoading ||
      isExiting ||
      isEntering
    ) {
      return;
    }

    setError("");

    const identifier =
      adminId.trim();

    if (
      !identifier ||
      !password
    ) {
      setError(
        "Please enter Admin ID and Password."
      );

      return;
    }

    setIsLoading(true);

    try {
      const result =
        await authService.login(
          identifier,
          password
        );

      if (result?.success) {
        // Tell the Admin layout that the dashboard
        // was reached directly from the login page.
        sessionStorage.setItem(
          LOGIN_TRANSITION_KEY,
          "true"
        );

        // Start the login-page exit animation.
        setIsExiting(true);

        // Give the login page enough time to
        // complete its fade/scale-out.
        await new Promise((resolve) => {
          window.setTimeout(
            resolve,
            LOGIN_EXIT_DURATION
          );
        });

        navigate(
          "/admin/default",
          {
            replace: true,
          }
        );

        return;
      }

      // ===================================================
      // IMPORTANT FIX
      // ===================================================
      //
      // Never pass result.message directly to React state.
      //
      // It may be an object such as:
      //
      // { detail: "Incorrect username or password." }
      //
      // Convert it into a proper readable string first.
      // ===================================================

      const readableMessage =
        getReadableErrorMessage(
          result?.message,
          "Unable to authenticate the user."
        );

      setError(readableMessage);
    } catch (error) {
      console.error(
        "Login error:",
        error
      );

      const readableMessage =
        getReadableErrorMessage(
          error,
          "Unable to connect to the authentication server."
        );

      setError(readableMessage);
    } finally {
      setIsLoading(false);
    }
  };

  // =======================================================
  // THEME STYLES
  // =======================================================

  const isDark =
    theme === "dark";

  const pageBackground =
    isDark
      ? "bg-[#0b1433]"
      : "bg-[#eef2f7]";

  const formPanel =
    isDark
      ? "bg-[#101b49]"
      : "bg-white";

  const headingColor =
    isDark
      ? "text-white"
      : "text-navy-700";

  const secondaryText =
    isDark
      ? "text-white/70"
      : "text-gray-500";

  const labelColor =
    isDark
      ? "text-white"
      : "text-navy-700";

  const inputBackground =
    isDark
      ? "bg-white/10 border-white/10 text-white placeholder:text-white/40"
      : "bg-gray-50 border-gray-200 text-navy-700 placeholder:text-gray-400";

  const inputIconColor =
    isDark
      ? "text-white/50"
      : "text-gray-400";

  const footerBorder =
    isDark
      ? "border-white/10"
      : "border-gray-200";

  const footerText =
    isDark
      ? "text-white/50"
      : "text-gray-400";

  // =======================================================
  // RENDER
  // =======================================================

  return (
    <div
      className={`
        min-h-screen
        w-full
        bg-cover
        bg-center
        ${pageBackground}
        transition-all
        duration-300
        ease-out
        ${
          isExiting
            ? "scale-[0.99] opacity-0"
            : isEntering
            ? "scale-[0.99] opacity-0"
            : "scale-100 opacity-100"
        }
      `}
      style={{
        backgroundImage:
          "url('https://images.unsplash.com/photo-1494412651409-8963ce7935a7?auto=format&fit=crop&w=2000&q=85')",
      }}
    >
      {/* ===================================================
          BACKGROUND OVERLAY
      =================================================== */}

      <div
        className={`
          flex
          min-h-screen
          w-full
          items-center
          justify-center
          px-4
          py-6
          ${
            isDark
              ? "bg-[#071333]/70"
              : "bg-[#071333]/45"
          }
        `}
      >
        {/* =================================================
            LOGIN CARD
        ================================================= */}

        <div
          className={`
            flex
            w-full
            max-w-3xl
            overflow-hidden
            rounded-[20px]
            border
            shadow-2xl
            backdrop-blur-xl
            ${
              isDark
                ? "border-white/10"
                : "border-white/30"
            }
          `}
        >
          {/* ===============================================
              LEFT INFORMATION PANEL
          =============================================== */}

          <div
            className="
              hidden
              w-1/2
              flex-col
              items-center
              justify-center
              bg-black/35
              px-8
              py-10
              text-center
              lg:flex
            "
          >
            {/* Port Logo */}

            <img
              src={portLogo}
              alt="Port of Singapore"
              className="
                mb-6
                h-24
                w-24
                object-contain
              "
            />

            {/* Tagline */}

            <p
              className="
                mb-2
                text-[11px]
                font-semibold
                uppercase
                tracking-[0.28em]
                text-blue-100
              "
            >
              Sea Port Management
            </p>

            {/* Port */}

            <h1
              className="
                mb-2
                text-3xl
                font-bold
                text-white
              "
            >
              Port of Singapore
            </h1>

            {/* System */}

            <h2
              className="
                mb-5
                text-lg
                font-semibold
                text-blue-100
              "
            >
              Smart Sea Port Management System
            </h2>

            {/* Description */}

            <p
              className="
                max-w-sm
                text-sm
                leading-6
                text-white/80
              "
            >
              Centralized digital management of
              vessels, berths, cargo, gate operations,
              weather, safety, communication and port
              performance.
            </p>
          </div>

          {/* ===============================================
              RIGHT LOGIN PANEL
          =============================================== */}

          <div
            className={`
              w-full
              px-8
              py-9
              sm:px-10
              lg:w-1/2
              ${formPanel}
            `}
          >
            {/* Login Icon */}

            <div
              className="
                mb-5
                flex
                h-12
                w-12
                items-center
                justify-center
                rounded-xl
                bg-brand-500
                shadow-lg
              "
            >
              <MdLock
                className="
                  text-2xl
                  text-white
                "
              />
            </div>

            {/* Heading */}

            <h1
              className={`
                mb-2
                text-2xl
                font-bold
                ${headingColor}
              `}
            >
              Port Administration
            </h1>

            <p
              className={`
                mb-6
                text-sm
                ${secondaryText}
              `}
            >
              Sign in to access the Port of Singapore
              Management System.
            </p>

            {/* =============================================
                ERROR
            ============================================= */}

            {error && (
              <div
                className={`
                  mb-5
                  rounded-xl
                  border
                  px-4
                  py-3
                  text-sm
                  font-medium
                  ${
                    isDark
                      ? "border-red-400/30 bg-red-500/10 text-red-400"
                      : "border-red-200 bg-red-50 text-red-600"
                  }
                `}
                role="alert"
                aria-live="polite"
              >
                {error}
              </div>
            )}

            {/* =============================================
                FORM
            ============================================= */}

            <form
              onSubmit={handleLogin}
              className="space-y-4"
            >
              {/* Admin ID */}

              <div>
                <label
                  htmlFor="adminId"
                  className={`
                    mb-2
                    block
                    text-sm
                    font-semibold
                    ${labelColor}
                  `}
                >
                  Admin ID
                </label>

                <div className="relative">
                  <MdAdminPanelSettings
                    className={`
                      absolute
                      left-4
                      top-1/2
                      -translate-y-1/2
                      text-xl
                      ${inputIconColor}
                    `}
                  />

                  <input
                    id="adminId"
                    type="text"
                    value={adminId}
                    onChange={(e) =>
                      setAdminId(
                        e.target.value
                      )
                    }
                    placeholder="Enter Admin ID"
                    autoComplete="username"
                    disabled={
                      isLoading ||
                      isExiting ||
                      isEntering
                    }
                    className={`
                      h-12
                      w-full
                      rounded-xl
                      border
                      pl-11
                      pr-4
                      text-sm
                      font-medium
                      outline-none
                      transition
                      focus:border-brand-500
                      focus:ring-2
                      focus:ring-brand-500/20
                      disabled:cursor-not-allowed
                      disabled:opacity-60
                      ${inputBackground}
                    `}
                  />
                </div>
              </div>

              {/* Password */}

              <div>
                <label
                  htmlFor="password"
                  className={`
                    mb-2
                    block
                    text-sm
                    font-semibold
                    ${labelColor}
                  `}
                >
                  Password
                </label>

                <div className="relative">
                  <MdLock
                    className={`
                      absolute
                      left-4
                      top-1/2
                      -translate-y-1/2
                      text-xl
                      ${inputIconColor}
                    `}
                  />

                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) =>
                      setPassword(
                        e.target.value
                      )
                    }
                    placeholder="Enter Password"
                    autoComplete="current-password"
                    disabled={
                      isLoading ||
                      isExiting ||
                      isEntering
                    }
                    className={`
                      h-12
                      w-full
                      rounded-xl
                      border
                      pl-11
                      pr-4
                      text-sm
                      font-medium
                      outline-none
                      transition
                      focus:border-brand-500
                      focus:ring-2
                      focus:ring-brand-500/20
                      disabled:cursor-not-allowed
                      disabled:opacity-60
                      ${inputBackground}
                    `}
                  />
                </div>
              </div>

              {/* Login Button */}

              <button
                type="submit"
                disabled={
                  isLoading ||
                  isExiting ||
                  isEntering
                }
                className="
                  mt-1
                  flex
                  h-12
                  w-full
                  items-center
                  justify-center
                  rounded-xl
                  bg-brand-500
                  text-sm
                  font-bold
                  text-white
                  shadow-lg
                  shadow-brand-500/20
                  transition
                  hover:bg-brand-600
                  focus:outline-none
                  focus:ring-2
                  focus:ring-brand-500
                  focus:ring-offset-2
                  disabled:cursor-not-allowed
                  disabled:opacity-60
                "
              >
                {isExiting
                  ? "Opening Port System..."
                  : isLoading
                  ? "Signing in..."
                  : "Login"}
              </button>
            </form>

            {/* =============================================
                FOOTER
            ============================================= */}

            <div
              className={`
                mt-6
                border-t
                pt-5
                text-center
                ${footerBorder}
              `}
            >
              <p
                className={`
                  text-xs
                  ${footerText}
                `}
              >
                Authorized personnel only.
              </p>

              <p
                className={`
                  mt-1
                  text-xs
                  ${footerText}
                `}
              >
                Port of Singapore Smart Sea Port Management
                System
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;