import React, { useState } from "react";
import { BeatLoader } from "react-spinners";
import dummyProfileImage from "../assets/logo1.png";
import { useNavigate } from "react-router-dom";
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
  
  const profileImage = user?.fileName === "null" ? dummyProfileImage : user?.fileName;

  return (
    <div
      className="bg-gray-200 p-2 w-60 min-h-screen shadow flex flex-col items-center  md:relative "
      style={{ height: "100vh", maxHeight: "calc(100vh - 64px)"  }}
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
            <h3 className="text-xl font-semibold">{user?.name}</h3>
          </>
        )}
      </div>

      {/* User Sections */}
      <div className="w-full overflow-auto ">
        <div
          className={`cursor-pointer ${
            activeSection === "dashboard"
              ? "bg-blue-200 border-b-2 border-blue-500"
              : "hover:bg-gray-300"
          } rounded-md`}
          onClick={() => handleClick("dashboard")}
        >
          <h4 className="p-2 text-lg font-semibold">Dashboard</h4>
        </div>

        <div
          className={`cursor-pointer ${
            activeSection === "eventpage"
              ? "bg-blue-200 border-b-2 border-blue-500"
              : "hover:bg-gray-300"
          } rounded-md`}
          onClick={() => handleClick("eventpage")}
        >
          <h4 className="p-2 text-lg font-semibold">Event</h4>
        </div>

        <div
          className={` cursor-pointer ${
            activeSection === "dealpage"
              ? "bg-blue-200 border-b-2 border-blue-500"
              : "hover:bg-gray-300"
          } rounded-md`}
          onClick={() => handleClick("dealpage")}
        >
          <h4 className="p-2 text-lg font-semibold">Deal</h4>
        </div>
        <div
          className={` cursor-pointer ${
            activeSection === "bookingpage"
              ? "bg-blue-200 border-b-2 border-blue-500"
              : "hover:bg-gray-300"
          } rounded-md`}
          onClick={() => handleClick("bookingpage")}
        >
          <h4 className="p-2 text-lg font-semibold">Booking</h4>
        </div>
      </div>
    </div>
  );
}

export default Sidebar;
