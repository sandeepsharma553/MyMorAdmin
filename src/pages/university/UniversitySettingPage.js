import React, { useState, lazy, Suspense } from "react";
import { useSelector } from "react-redux";
import { FadeLoader } from "react-spinners";
import { ToastContainer } from "react-toastify";

const UniversityMaintenancePage = lazy(() =>
  import("./UniversityMaintenanceCategoryPage")
);
const UniversityReportSettingPage = lazy(() =>
  import("./UniversityReportSettingPage")
);
const UniversityFeedbackSettingPage = lazy(() =>
  import("./UniversityFeedbackSettingPage")
);
const UniversityEmployeeSettingPage = lazy(() =>
  import("./UniversityEmployeeSettingPage")
);
const UniversityEventSettingPage = lazy(() =>
  import("./UniversityEventSettingPage")
);
const UniversityAcademicSettingPage = lazy(() =>
  import("./UniversityAcademicSettingPage")
);

const UniversitySettingPage = () => {
  const uid = useSelector((s) => s.auth.user?.uid);
  const emp = useSelector((s) => s.auth.employee);
  const universityId = String(
    emp?.universityid || emp?.universityId || ""
  );

  const MENU = [
    { key: "academics", label: "Academic Categories" },
    { key: "maintenance", label: "Maintenance Settings" },
    { key: "reports", label: "Report Settings" },
    { key: "feedback", label: "Feedback Setting" },
    { key: "employee", label: "Employee Setting" },
    { key: "event", label: "Event Setting" },
  ];

  const [activeKey, setActiveKey] = useState("academics");

  return (
    <main className="flex min-h-[calc(100vh-64px)] bg-gray-100">
      <aside className="w-64 bg-white border-r">
        <div className="p-4 border-b">
          <h1 className="text-xl font-semibold">Settings</h1>
          <p className="text-xs text-gray-500">University scope</p>
        </div>

        <nav className="p-2">
          {MENU.map((m) => {
            const active = activeKey === m.key;
            return (
              <button
                key={m.key}
                className={`w-full text-left px-3 py-2 rounded mb-1 ${
                  active ? "bg-black text-white" : "hover:bg-gray-100"
                }`}
                onClick={() => setActiveKey(m.key)}
              >
                {m.label}
              </button>
            );
          })}
        </nav>
      </aside>

      <section className="flex-1 p-6 overflow-auto">
        {activeKey === "academics" && (
           <Suspense
           fallback={
             <div className="flex justify-center items-center h-64">
               <FadeLoader color="#36d7b7" />
             </div>
           }
         >
           <div className="bg-white rounded shadow p-4">
             <UniversityAcademicSettingPage
               universityid={universityId}
               uid={uid}
               embedded
             />
           </div>
         </Suspense>
        )}

        {activeKey === "maintenance" && (
          <Suspense
            fallback={
              <div className="flex justify-center items-center h-64">
                <FadeLoader color="#36d7b7" />
              </div>
            }
          >
            <div className="bg-white rounded shadow p-4">
              <UniversityMaintenancePage
                universityid={universityId}
                uid={uid}
                embedded
              />
            </div>
          </Suspense>
        )}

        {activeKey === "reports" && (
          <Suspense
            fallback={
              <div className="flex justify-center items-center h-64">
                <FadeLoader color="#36d7b7" />
              </div>
            }
          >
            <div className="bg-white rounded shadow p-4">
              <UniversityReportSettingPage
                universityid={universityId}
                uid={uid}
                embedded
              />
            </div>
          </Suspense>
        )}

        {activeKey === "feedback" && (
          <Suspense
            fallback={
              <div className="flex justify-center items-center h-64">
                <FadeLoader color="#36d7b7" />
              </div>
            }
          >
            <div className="bg-white rounded shadow p-4">
              <UniversityFeedbackSettingPage
                universityid={universityId}
                uid={uid}
                embedded
              />
            </div>
          </Suspense>
        )}

        {activeKey === "employee" && (
          <Suspense
            fallback={
              <div className="flex justify-center items-center h-64">
                <FadeLoader color="#36d7b7" />
              </div>
            }
          >
            <div className="bg-white rounded shadow p-4">
              <UniversityEmployeeSettingPage
                universityid={universityId}
                uid={uid}
                embedded
              />
            </div>
          </Suspense>
        )}

        {activeKey === "event" && (
          <Suspense
            fallback={
              <div className="flex justify-center items-center h-64">
                <FadeLoader color="#36d7b7" />
              </div>
            }
          >
            <div className="bg-white rounded shadow p-4">
              <UniversityEventSettingPage
                universityid={universityId}
                uid={uid}
                embedded
              />
            </div>
          </Suspense>
        )}
      </section>

      <ToastContainer />
    </main>
  );
};

export default UniversitySettingPage;