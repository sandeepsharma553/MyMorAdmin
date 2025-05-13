import React, { useState } from "react";
export default function BookingPage(props) {
  const { navbarHeight } = props;
  console.log("navh", navbarHeight);
  const [roomType, setRoomType] = useState('Study Room');
  const [date, setDate] = useState('2025-05-14');
  const [selectedTime, setSelectedTime] = useState('');

  const times = ['9:00 AM', '10:00 AM', '11:00 AM', '2:00 AM'];
  return (
    <main className="flex-1 p-6 bg-gray-100 overflow-auto">
      {/* Top bar with Add button */}
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-semibold">Booking</h1>
       <button className="px-4 py-2 bg-black text-white rounded hover:bg-black">
          + Add Group
        </button>
      </div>
      <h2 className="text-lg font-semibold">Room Type</h2>
      <div className="flex items-center space-x-4">


        {/* Room Type Dropdown */}
        <select
          className="border rounded-md px-4 py-2 w-full"
          value={roomType}
          onChange={(e) => setRoomType(e.target.value)}
        >
          <option>Study Room</option>
          <option>Meeting Room</option>
          <option>Conference Room</option>
        </select>

        {/* Date Picker */}
        <input
          type="date"
          className="border rounded-md px-4 py-2 w-full"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>
      <div className="p-4 space-y-4  ">

        {/* Time Buttons */}
        <div className="flex flex-wrap gap-2">
          {times.map((time) => (
            <button
              key={time}
              onClick={() => setSelectedTime(time)}
              className={`px-4 py-2 border rounded-md ${selectedTime === time ? 'bg-blue-500 text-white' : 'bg-white'
                }`}
            >
              {time}
            </button>
          ))}
          <button className="px-4 py-2 border rounded-md bg-white">Add Room</button>
        </div>
      </div>
      <div className="overflow-x-auto bg-white rounded shadow">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Room Name</th>
              <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Date</th>
              <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Time</th>
              <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Bookimg Status</th>
              <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {[...Array(5)].map((_, i) => (
              <tr key={i}>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">Study Room {i + 1}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">Apr 10,2025 {i + 1}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">10:00 AM</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  Booked

                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  <button className="text-blue-600 hover:underline mr-3">Edit</button>
                  <button className="text-red-600 hover:underline">Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

    </main>
  );
}
