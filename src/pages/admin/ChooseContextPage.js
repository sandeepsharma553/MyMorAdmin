import React, { useEffect, useMemo, useState } from "react";
import { useSelector, useDispatch } from "react-redux";
import { useNavigate } from "react-router-dom";
import { setActiveOrg } from "../../app/features/AuthSlice";
import { Building2, GraduationCap, CheckCircle2 } from "lucide-react";

const LS_KEY = "activeOrg"; // "hostel" | "uniclub"

export default function ChooseContextPage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const employee = useSelector((s) => s.auth.employee);
  const activeOrg = useSelector((s) => s.auth.activeOrg);

  const hasHostel = !!employee?.hostelid;
  const hasUniclub = !!employee?.uniclubid;

  const [remember, setRemember] = useState(true);
  const [hovered, setHovered] = useState(null); // "hostel" | "uniclub" | null

  const displayName = useMemo(() => {
    return employee?.name || employee?.fullName || employee?.email || "Admin";
  }, [employee]);

  const initials = useMemo(() => {
    const n = (displayName || "A").trim();
    const parts = n.split(" ").filter(Boolean);
    const a = (parts[0]?.[0] || "A").toUpperCase();
    const b = (parts[1]?.[0] || "").toUpperCase();
    return `${a}${b}`.trim();
  }, [displayName]);

  // restore choice from localStorage (optional)
  useEffect(() => {
    const saved = localStorage.getItem(LS_KEY);
    if (!activeOrg && (saved === "hostel" || saved === "uniclub")) {
      dispatch(setActiveOrg(saved));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Already selected => redirect
  useEffect(() => {
    if (activeOrg === "hostel") navigate("/dashboard", { replace: true });
    if (activeOrg === "uniclub") navigate("/uniclubdashboard", { replace: true });
  }, [activeOrg, navigate]);

  // If only one access, auto pick
  useEffect(() => {
    if (!hasHostel && hasUniclub) {
      dispatch(setActiveOrg("uniclub"));
      localStorage.setItem(LS_KEY, "uniclub");
      navigate("/uniclubdashboard", { replace: true });
    }
    if (!hasUniclub && hasHostel) {
      dispatch(setActiveOrg("hostel"));
      localStorage.setItem(LS_KEY, "hostel");
      navigate("/dashboard", { replace: true });
    }
  }, [hasHostel, hasUniclub, dispatch, navigate]);

  const pick = (org) => {
    dispatch(setActiveOrg(org));
    if (remember) localStorage.setItem(LS_KEY, org);
    else localStorage.removeItem(LS_KEY);

    navigate(org === "hostel" ? "/dashboard" : "/uniclubdashboard", { replace: true });
  };

  if (!hasHostel && !hasUniclub) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 p-6">
        <div className="bg-white rounded-2xl shadow p-6 w-full max-w-md border border-gray-200">
          <h1 className="text-xl font-bold mb-2 text-gray-900">No Access</h1>
          <p className="text-sm text-gray-600">
            This admin has no hostel/uniclub access.
          </p>
        </div>
      </div>
    );
  }

  // If not both, we auto redirected above
  if (!(hasHostel && hasUniclub)) return null;

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-gray-50 via-gray-50 to-gray-100 p-4">
      {/* soft background blobs */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-24 -left-24 h-80 w-80 rounded-full bg-blue-200/40 blur-3xl" />
        <div className="absolute top-1/3 -right-24 h-96 w-96 rounded-full bg-indigo-200/40 blur-3xl" />
        <div className="absolute -bottom-24 left-1/3 h-80 w-80 rounded-full bg-gray-200/50 blur-3xl" />
      </div>

      <div className="relative w-full max-w-2xl">
        <div className="rounded-3xl bg-white/85 backdrop-blur-xl border border-gray-200 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.25)] p-8 md:p-10">
          {/* header */}
          <div className="flex items-start gap-4">
            <div className="h-14 w-14 rounded-2xl bg-black text-white flex items-center justify-center shadow">
              <span className="text-lg font-extrabold">{initials}</span>
            </div>

            <div className="flex-1">
              <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-gray-900">
                Choose Workspace
              </h1>
              <p className="mt-2 text-gray-600 text-base md:text-lg leading-relaxed">
                Hi <span className="font-semibold text-gray-900">{displayName}</span> — you have access to{" "}
                <span className="font-semibold text-gray-900">Hostel + UniClub</span>.
                Choose where you want to work right now.
              </p>
            </div>
          </div>

          {/* options */}
          <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
            <OptionCard
              title="Hostel Admin"
              subtitle={employee?.hostel ? employee.hostel : `Hostel ID: ${employee?.hostelid || "-"}`}
              Icon={Building2}
              variant="dark"
              active={hovered === "hostel"}
              onMouseEnter={() => setHovered("hostel")}
              onMouseLeave={() => setHovered(null)}
              onClick={() => pick("hostel")}
            />

            <OptionCard
              title="UniClub Admin"
              subtitle={employee?.uniclub ? employee.uniclub : `UniClub ID: ${employee?.uniclubid || "-"}`}
              Icon={GraduationCap}
              variant="blue"
              active={hovered === "uniclub"}
              onMouseEnter={() => setHovered("uniclub")}
              onMouseLeave={() => setHovered(null)}
              onClick={() => pick("uniclub")}
            />
          </div>

          {/* footer controls */}
          <div className="mt-6 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
              />
              <span className="text-sm text-gray-700">
                Remember my choice on this device
              </span>
            </label>

            <button
              type="button"
              onClick={() => localStorage.removeItem(LS_KEY)}
              className="text-sm text-gray-500 hover:text-gray-900 underline underline-offset-4"
            >
              Reset saved choice
            </button>
          </div>

          <p className="text-sm text-gray-500 mt-4">
            You can switch later from the sidebar switch.
          </p>
        </div>

        <p className="text-center text-xs text-gray-400 mt-5">
          © {new Date().getFullYear()} My Mor. All rights reserved.
        </p>
      </div>
    </div>
  );
}

/* ---------- UI card ---------- */
function OptionCard({
  title,
  subtitle,
  Icon,
  variant = "dark", // "dark" | "blue"
  active,
  onClick,
  ...rest
}) {
  const base =
    "w-full text-left rounded-2xl border p-5 md:p-6 transition-all duration-200 transform";
  const hover = "hover:scale-[1.01] hover:-translate-y-[1px]";
  const ring = active ? "ring-2 ring-blue-500 ring-offset-2" : "";

  const styles =
    variant === "dark"
      ? "bg-gradient-to-br from-black to-gray-900 text-white border-black/10 shadow-[0_18px_40px_-20px_rgba(0,0,0,0.7)]"
      : "bg-gradient-to-br from-blue-600 to-indigo-600 text-white border-blue-500/20 shadow-[0_18px_40px_-20px_rgba(37,99,235,0.6)]";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`${base} ${styles} ${hover} ${ring}`}
      {...rest}
    >
      <div className="flex items-start gap-4">
        <div className="h-12 w-12 rounded-2xl bg-white/10 flex items-center justify-center">
          <Icon size={24} />
        </div>

        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-lg md:text-xl font-bold">{title}</h3>
            <CheckCircle2 size={18} className="opacity-80" />
          </div>
          <p className="text-sm text-white/80 mt-1">{subtitle}</p>

          <div className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-white/90">
            Continue <span aria-hidden>→</span>
          </div>
        </div>
      </div>
    </button>
  );
}
