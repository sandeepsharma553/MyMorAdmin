import React, { useState } from "react";
import { BeatLoader } from "react-spinners";
import dummyProfileImage from "../assets/logo512.jpg";
function Sidebar({ user, onSectionClick, isLoading, error }) {
  const [activeSection, setActiveSection] = useState("vehicles");

  const handleClick = (section) => {
    setActiveSection(section);
    if (onSectionClick) {
      onSectionClick(section);
    }
  };
  
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
              src={profileImage}
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
            activeSection === "vehicles"
              ? "bg-blue-200 border-b-2 border-blue-500"
              : "hover:bg-gray-300"
          } rounded-md`}
          onClick={() => handleClick("vehicles")}
        >
          <h4 className="p-2 text-lg font-semibold">Vehicles</h4>
        </div>

        <div
          className={`cursor-pointer ${
            activeSection === "expenses"
              ? "bg-blue-200 border-b-2 border-blue-500"
              : "hover:bg-gray-300"
          } rounded-md`}
          onClick={() => handleClick("expenses")}
        >
          <h4 className="p-2 text-lg font-semibold">Expenses</h4>
        </div>

        <div
          className={` cursor-pointer ${
            activeSection === "gifts"
              ? "bg-blue-200 border-b-2 border-blue-500"
              : "hover:bg-gray-300"
          } rounded-md`}
          onClick={() => handleClick("gifts")}
        >
          <h4 className="p-2 text-lg font-semibold">Gift Requests</h4>
        </div>
      </div>
    </div>
  );
}

export default Sidebar;
