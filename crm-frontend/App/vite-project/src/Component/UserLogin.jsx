import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Lock,
  User,
  Loader2,
  CheckCircle2,
  ShieldCheck,
  Eye,
  EyeOff,
  ArrowRight,
  Building2,
  LockKeyhole,
} from "lucide-react";

export default function UserLogin() {
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // =========================================================
  // USER LOGIN
  // =========================================================

  const handleLogin = async (e) => {
    e.preventDefault();

    setError("");

    if (!name.trim()) {
      setError("Please enter your username.");
      return;
    }

    if (!password.trim()) {
      setError("Please enter your password.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(
        "http://localhost:8000/api/UserAccounts/Log-in",
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json",
          },

          body: JSON.stringify({
            name: name.trim(),
            password: password,
          }),
        }
      );

      let data;

      try {
        data = await response.json();
      } catch {
        throw new Error(
          "Invalid response received from server."
        );
      }

      if (!response.ok) {
        throw new Error(
          data?.message ||
            "Login failed. Please check your username and password."
        );
      }

      if (!data?.token) {
        throw new Error(
          "Login successful, but authentication token was not received."
        );
      }

      if (!data?.user) {
        throw new Error(
          "Login successful, but user information was not received."
        );
      }

      const loggedInUser = {
        ...data.user,
        _id: data.user._id || data.user.id,
      };

      // =====================================================
      // SAVE AUTHENTICATION
      // =====================================================

      localStorage.setItem(
        "authToken",
        data.token
      );

      localStorage.setItem(
        "userData",
        JSON.stringify(loggedInUser)
      );

      if (data.user.loginTime) {
        localStorage.setItem(
          "loginTime",
          data.user.loginTime
        );
      }

      if (loggedInUser._id) {
        localStorage.setItem(
          "userId",
          loggedInUser._id
        );
      }

      // =====================================================
      // REDIRECT
      // =====================================================

      navigate("/user/dashboard", {
        replace: true,
      });
    } catch (error) {
      console.error("USER LOGIN ERROR:", error);

      if (
        error instanceof TypeError &&
        error.message === "Failed to fetch"
      ) {
        setError(
          "Unable to connect to the server. Please make sure the backend is running."
        );
      } else {
        setError(
          error.message ||
            "Login failed. Please try again."
        );
      }
    } finally {
      setLoading(false);
    }
  };

  // =========================================================
  // ADMIN LOGIN
  // =========================================================

  const goToAdminLogin = () => {
    navigate("/adminlogin");
  };

  return (
    <div
      className="
        min-h-screen
        bg-slate-50
        flex
        items-center
        justify-center
        px-4
        sm:px-6
        py-10
        relative
        overflow-hidden
      "
      style={{
        fontFamily: "'Poppins', sans-serif",
      }}
    >
      {/* =====================================================
          BACKGROUND
      ====================================================== */}

      <div
        className="
          absolute
          inset-0
          bg-gradient-to-br
          from-slate-50
          via-blue-50/50
          to-slate-100
        "
      />

      <div
        className="
          absolute
          -top-40
          -right-40
          w-[500px]
          h-[500px]
          rounded-full
          bg-blue-200/40
          blur-3xl
          pointer-events-none
        "
      />

      <div
        className="
          absolute
          -bottom-40
          -left-40
          w-[450px]
          h-[450px]
          rounded-full
          bg-indigo-100/50
          blur-3xl
          pointer-events-none
        "
      />

      {/* Background Grid */}

      <div
        className="
          absolute
          inset-0
          opacity-[0.03]
          pointer-events-none
        "
        style={{
          backgroundImage:
            "linear-gradient(#0f172a 1px, transparent 1px), linear-gradient(90deg, #0f172a 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />

      {/* =====================================================
          MAIN WRAPPER
      ====================================================== */}

      <div className="relative z-10 w-full max-w-[480px]">

        {/* =====================================================
            COMPANY BRAND
        ====================================================== */}

        <div className="text-center mb-7">

          <div
            className="
              mx-auto
              w-14
              h-14
              bg-blue-950
              rounded-2xl
              flex
              items-center
              justify-center
              shadow-lg
              shadow-blue-950/20
              mb-4
            "
          >
            <Building2
              size={27}
              className="text-white"
            />
          </div>

          <h1
            className="
              text-2xl
              sm:text-[28px]
              font-bold
              text-slate-950
              tracking-tight
            "
          >
            Profenaa Infotech
          </h1>

          <p
            className="
              text-sm
              text-slate-500
              mt-1
            "
          >
            Smart Work Management System
          </p>

        </div>

        {/* =====================================================
            LOGIN CARD
        ====================================================== */}

        <div
          className="
            bg-white/95
            backdrop-blur-xl
            rounded-[28px]
            border
            border-slate-200/80
            shadow-[0_20px_70px_rgba(15,23,42,0.12)]
            px-6
            sm:px-9
            py-8
            sm:py-10
          "
        >

          {/* =================================================
              HEADER
          ================================================== */}

          <div className="mb-8">

            <div
              className="
                inline-flex
                items-center
                gap-2
                px-3
                py-1.5
                rounded-full
                bg-blue-50
                border
                border-blue-100
                mb-4
              "
            >
              <User
                size={15}
                className="text-blue-700"
              />

              <span
                className="
                  text-xs
                  font-semibold
                  text-blue-800
                "
              >
                Employee Portal
              </span>
            </div>

            <h2
              className="
                text-[28px]
                sm:text-[32px]
                font-bold
                text-slate-950
                tracking-tight
              "
            >
              Welcome back
            </h2>

            <p
              className="
                text-sm
                text-slate-500
                mt-2
                leading-6
              "
            >
              Sign in to access your tasks,
              progress and employee dashboard.
            </p>

          </div>

          {/* =================================================
              ERROR
          ================================================== */}

          {error && (
            <div
              className="
                mb-6
                rounded-xl
                border
                border-red-200
                bg-red-50
                px-4
                py-3.5
              "
            >
              <div className="flex items-start gap-3">

                <div
                  className="
                    w-8
                    h-8
                    rounded-lg
                    bg-red-100
                    flex
                    items-center
                    justify-center
                    flex-shrink-0
                  "
                >
                  <span
                    className="
                      text-red-600
                      text-sm
                      font-bold
                    "
                  >
                    !
                  </span>
                </div>

                <div>

                  <p
                    className="
                      text-sm
                      font-semibold
                      text-red-800
                    "
                  >
                    Login failed
                  </p>

                  <p
                    className="
                      text-xs
                      text-red-700
                      mt-0.5
                      leading-5
                    "
                  >
                    {error}
                  </p>

                </div>

              </div>
            </div>
          )}

          {/* =================================================
              LOGIN FORM
          ================================================== */}

          <form
            onSubmit={handleLogin}
            className="space-y-5"
          >

            {/* USERNAME */}

            <div>

              <label
                htmlFor="username"
                className="
                  block
                  text-sm
                  font-semibold
                  text-slate-800
                  mb-2
                "
              >
                Username
              </label>

              <div className="relative">

                <User
                  size={19}
                  className="
                    absolute
                    left-4
                    top-1/2
                    -translate-y-1/2
                    text-slate-400
                    pointer-events-none
                  "
                />

                <input
                  id="username"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setError("");
                  }}
                  placeholder="Enter your username"
                  autoComplete="username"
                  disabled={loading}
                  className="
                    w-full
                    h-[52px]
                    pl-12
                    pr-4
                    rounded-xl
                    border
                    border-slate-200
                    bg-slate-50/70
                    text-slate-950
                    text-sm
                    placeholder:text-slate-400
                    outline-none
                    transition-all
                    duration-200
                    hover:border-slate-300
                    focus:bg-white
                    focus:border-blue-600
                    focus:ring-4
                    focus:ring-blue-600/10
                    disabled:opacity-60
                  "
                />

              </div>

            </div>

            {/* PASSWORD */}

            <div>

              <div
                className="
                  flex
                  items-center
                  justify-between
                  mb-2
                "
              >

                <label
                  htmlFor="password"
                  className="
                    text-sm
                    font-semibold
                    text-slate-800
                  "
                >
                  Password
                </label>

                <button
                  type="button"
                  className="
                    text-xs
                    font-semibold
                    text-blue-700
                    hover:text-blue-900
                    transition-colors
                  "
                  onClick={() =>
                    setError(
                      "Please contact the administrator to reset your password."
                    )
                  }
                >
            
                </button>

              </div>

              <div className="relative">

                <Lock
                  size={19}
                  className="
                    absolute
                    left-4
                    top-1/2
                    -translate-y-1/2
                    text-slate-400
                    pointer-events-none
                  "
                />

                <input
                  id="password"
                  type={
                    showPassword
                      ? "text"
                      : "password"
                  }
                  required
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError("");
                  }}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  disabled={loading}
                  className="
                    w-full
                    h-[52px]
                    pl-12
                    pr-12
                    rounded-xl
                    border
                    border-slate-200
                    bg-slate-50/70
                    text-slate-950
                    text-sm
                    placeholder:text-slate-400
                    outline-none
                    transition-all
                    duration-200
                    hover:border-slate-300
                    focus:bg-white
                    focus:border-blue-600
                    focus:ring-4
                    focus:ring-blue-600/10
                    disabled:opacity-60
                  "
                />

                <button
                  type="button"
                  onClick={() =>
                    setShowPassword(
                      (prev) => !prev
                    )
                  }
                  disabled={loading}
                  aria-label={
                    showPassword
                      ? "Hide password"
                      : "Show password"
                  }
                  className="
                    absolute
                    right-4
                    top-1/2
                    -translate-y-1/2
                    text-slate-400
                    hover:text-blue-700
                    transition-colors
                    disabled:opacity-50
                  "
                >
                  {showPassword ? (
                    <EyeOff size={19} />
                  ) : (
                    <Eye size={19} />
                  )}
                </button>

              </div>

            </div>

            {/* REMEMBER ME */}

            <div className="flex items-center">

              <label
                className="
                  flex
                  items-center
                  gap-2.5
                  cursor-pointer
                  select-none
                "
              >

                <input
                  type="checkbox"
                  className="
                    w-4
                    h-4
                    rounded
                    border-slate-300
                    accent-blue-950
                  "
                />

                <span
                  className="
                    text-sm
                    text-slate-600
                  "
                >
                  Keep me signed in
                </span>

              </label>

            </div>

            {/* LOGIN BUTTON */}

            <button
              type="submit"
              disabled={loading}
              className="
                w-full
                h-[52px]
                rounded-xl
                bg-blue-950
                text-white
                font-semibold
                text-sm
                flex
                items-center
                justify-center
                gap-2.5
                shadow-lg
                shadow-blue-950/20
                hover:bg-blue-900
                hover:shadow-xl
                hover:shadow-blue-950/20
                active:scale-[0.99]
                transition-all
                duration-200
                disabled:opacity-60
                disabled:cursor-not-allowed
              "
            >

              {loading ? (
                <>
                  <Loader2
                    size={19}
                    className="animate-spin"
                  />

                  <span>
                    Authenticating...
                  </span>
                </>
              ) : (
                <>
                  <span>
                    Sign in to Dashboard
                  </span>

                  <ArrowRight size={18} />
                </>
              )}

            </button>

          </form>

          {/* =================================================
              SECURITY INFO
          ================================================== */}

          <div
            className="
              mt-6
              flex
              items-start
              gap-3
              p-4
              rounded-xl
              border
              border-slate-200
              bg-slate-50
            "
          >

            <div
              className="
                w-9
                h-9
                rounded-lg
                bg-white
                border
                border-slate-200
                flex
                items-center
                justify-center
                flex-shrink-0
              "
            >
              <LockKeyhole
                size={18}
                className="text-blue-950"
              />
            </div>

            <div>

              <p
                className="
                  text-sm
                  font-semibold
                  text-slate-800
                "
              >
                Secure Employee Login
              </p>

              <p
                className="
                  text-xs
                  text-slate-500
                  mt-1
                  leading-5
                "
              >
                Your account information is securely
                authenticated and protected.
              </p>

            </div>

          </div>

          {/* =================================================
              ADMIN LOGIN
          ================================================== */}

          <div className="mt-7">

            <div
              className="
                relative
                flex
                items-center
                justify-center
              "
            >

              <div
                className="
                  absolute
                  inset-x-0
                  h-px
                  bg-slate-200
                "
              />

              <span
                className="
                  relative
                  bg-white
                  px-4
                  text-[11px]
                  font-medium
                  text-slate-400
                  uppercase
                  tracking-[0.14em]
                "
              >
                Administration
              </span>

            </div>

            <button
              type="button"
              onClick={goToAdminLogin}
              className="
                w-full
                mt-5
                h-[50px]
                rounded-xl
                border
                border-slate-300
                bg-white
                text-slate-700
                text-sm
                font-semibold
                flex
                items-center
                justify-center
                gap-2
                hover:bg-slate-50
                hover:border-blue-950
                hover:text-blue-950
                transition-all
                duration-200
              "
            >

              <ShieldCheck size={17} />

              <span>
                Admin Login
              </span>

            </button>

          </div>

          {/* =================================================
              FOOTER
          ================================================== */}

          <div className="mt-8 text-center">

            <div
              className="
                flex
                items-center
                justify-center
                gap-2
              "
            >

              <CheckCircle2
                size={14}
                className="text-slate-400"
              />

              <p className="text-xs text-slate-500">
                Authorized employee access only
              </p>

            </div>

            <p
              className="
                text-[11px]
                text-slate-400
                mt-2
              "
            >
              © {new Date().getFullYear()} Profenaa Infotech.
              All rights reserved.
            </p>

          </div>

        </div>
      </div>
    </div>
  );
}