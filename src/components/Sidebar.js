import React, { useState } from "react";
import { BeatLoader } from "react-spinners";
import dummyProfileImage from "../assets/logo1.png";
import { useNavigate } from "react-router-dom";
import { LayoutDashboard, Calendar,Menu, BookOpen,BrushCleaning,Settings, Users,MessageSquareWarning } from "lucide-react";

function Sidebar({ user, onSectionClick, isLoading, error }) {
  const [activeSection, setActiveSection] = useState("dashboard");
  const navigate = useNavigate();
  const handleClick = (section) => {
    setActiveSection(section);
    if (onSectionClick) {
      onSectionClick(section);
    }
    navigate(`/home/${section}`);
  };
  console.log(user)

  //const profileImage = user?.fileName === "null" ? dummyProfileImage : user?.fileName;

  return (
    <div
      className="bg-gray-200 p-2 w-60 min-h-screen shadow flex flex-col items-center  md:relative "
      style={{ height: "100vh", maxHeight: "calc(100vh - 64px)" }}
    >
      {/* User Profile */}
      <div className="pb-2">
        {isLoading ? ( // Display loader if isLoading is true
          <BeatLoader size={8} color={"#ffffff"} loading={true} /> // Replace 'Loader' with your loader component
        ) : (
          <>
            <img
              src={dummyProfileImage}
              alt="User Profile"
              className="w-20 h-20 rounded-full"
            />
            {/* <h3 className="text-xl font-semibold">{user?.name}</h3> */}
            <h3 className="text-xl font-semibold">Admin</h3>
          </>
        )}
      </div>

      {/* User Sections */}
      <div className="w-full overflow-auto">
        <div
          className={`cursor-pointer ${activeSection === "dashboard"
              ? "bg-blue-200 border-b-2 border-blue-500"
              : "hover:bg-gray-300"
            } rounded-md`}
          onClick={() => handleClick("dashboard")}
        >
          <h4 className="flex items-center gap-2 p-2 text-lg font-semibold">
            <LayoutDashboard size={20} />
            Dashboard
          </h4>
        </div>

        <div
          className={`cursor-pointer ${activeSection === "diningmenupage"
              ? "bg-blue-200 border-b-2 border-blue-500"
              : "hover:bg-gray-300"
            } rounded-md`}
          onClick={() => handleClick("diningmenupage")}
        >
          <h4 className="flex items-center gap-2 p-2 text-lg font-semibold">
            <Menu size={20} />
            Dining Menu
          </h4>
        </div>
        <div
          className={`cursor-pointer ${activeSection === "cleaningpage"
              ? "bg-blue-200 border-b-2 border-blue-500"
              : "hover:bg-gray-300"
            } rounded-md`}
          onClick={() => handleClick("cleaningpage")}
        >
          <h4 className="flex items-center gap-2 p-2 text-lg font-semibold">
            <BrushCleaning size={20} />
           Cleaning Schedule
          </h4>
        </div>
        <div
          className={`cursor-pointer ${activeSection === "maintenancepage"
              ? "bg-blue-200 border-b-2 border-blue-500"
              : "hover:bg-gray-300"
            } rounded-md`}
          onClick={() => handleClick("maintenancepage")}
        >
          <h4 className="flex items-center gap-2 p-2 text-lg font-semibold">
            <Settings size={20} />
            Maintenance
          </h4>
        </div>
        <div
          className={`cursor-pointer ${activeSection === "bookingpage"
              ? "bg-blue-200 border-b-2 border-blue-500"
              : "hover:bg-gray-300"
            } rounded-md`}
          onClick={() => handleClick("bookingpage")}
        >
          <h4 className="flex items-center gap-2 p-2 text-lg font-semibold">
            <BookOpen size={20} />
            Book a Room
          </h4>
        </div>
        <div
          className={`cursor-pointer ${activeSection === "academicpage"
              ? "bg-blue-200 border-b-2 border-blue-500"
              : "hover:bg-gray-300"
            } rounded-md`}
          onClick={() => handleClick("academicpage")}
        >
          <h4 className="flex items-center gap-2 p-2 text-lg font-semibold">
            <Users size={20} />
            Academic Groups
          </h4>
        </div>
        <div
          className={`cursor-pointer ${activeSection === "reportpage"
              ? "bg-blue-200 border-b-2 border-blue-500"
              : "hover:bg-gray-300"
            } rounded-md`}
          onClick={() => handleClick("reportpage")}
        >
          <h4 className="flex items-center gap-2 p-2 text-lg font-semibold">
            <MessageSquareWarning size={20} />
            Report Incident
          </h4>
        </div>
        <div
          className={`cursor-pointer ${activeSection === "eventpage"
              ? "bg-blue-200 border-b-2 border-blue-500"
              : "hover:bg-gray-300"
            } rounded-md`}
          onClick={() => handleClick("eventpage")}
        >
          <h4 className="flex items-center gap-2 p-2 text-lg font-semibold">
            <Calendar size={20} />
            Event
          </h4>
        </div>
        <div
          className={`cursor-pointer ${activeSection === "university"
              ? "bg-blue-200 border-b-2 border-blue-500"
              : "hover:bg-gray-300"
            } rounded-md`}
          onClick={() => handleClick("university")}
        >
          <h4 className="flex items-center gap-2 p-2 text-lg font-semibold">
            <Calendar size={20} />
            University
          </h4>
        </div>

        {/* <div
          className={`cursor-pointer ${activeSection === "dealpage"
              ? "bg-blue-200 border-b-2 border-blue-500"
              : "hover:bg-gray-300"
            } rounded-md`}
          onClick={() => handleClick("dealpage")}
        >
          <h4 className="flex items-center gap-2 p-2 text-lg font-semibold">
            <BadgePercent size={20} />
            Deal
          </h4>
        </div> */}

       
      </div>
    </div>
  );
}

export default Sidebar;
