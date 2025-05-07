import React, { useState, useEffect } from "react";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import CircularProgress from "@mui/material/CircularProgress";
import { useDispatch, useSelector } from "react-redux";
import {
  selectAddVisitSuccess,
  selectAddVisitLoading,
} from "../app/features/AddvisitByAdmin";
const AddVisitModal = ({ isOpen, handleClose, handleAddVisit, userData }) => {
  const dispatch = useDispatch();

  const [billAmount, setBillAmount] = useState("");
  const [fileName, setFileName] = useState("");
  const [fileBase64, setFileBase64] = useState("");
  const [selectedVehicleType, setSelectedVehicleType] = useState("");
  const addVisitLoading = useSelector(selectAddVisitLoading);
  useEffect(() => {
    if (userData && userData[0]?.vehicleType) {
      setSelectedVehicleType(userData[0].vehicleType);
    }
  }, [userData]);

  console.log(addVisitLoading, "jfjd");
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    setFileName(file.name);

    if (file) {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onloadend = () => {
        const base64String = reader.result.split(",")[1];
        setFileBase64(base64String);
      };
    }
  };
  const handleAddVisitClick = () => {
    // ... your validation logic

    const visitData = {
      UserId: userData[0]?.userID,
      VisitDate: new Date(Date.now()).toISOString(),
      Lat: "37.7749",
      Lng: "-122.4194",
      CreatedBy: 1,
      UpdatedBy: 1,
      Status: true,
      BillAmount: billAmount.trim() === "" ? 0 : parseFloat(billAmount),
      FileName: fileName,
      FileBase64: fileBase64,
      VehicleType: selectedVehicleType,
    };

    handleAddVisit(visitData);
  };

  return (
    <Dialog open={isOpen} onClose={handleClose}>
      <DialogTitle>Add Visit</DialogTitle>
      <DialogContent>
        {userData && (
          <>
            <div className="flex justify-between mb-2 mr-8">
              <label className="font-bold">Name:</label>
              <span>{userData[0]?.name}</span>
            </div>
            <div className="flex justify-between mb-2 mr-8">
              <label className="font-bold">Vehicle No:</label>
              <span>{userData[0]?.vehicleno}</span>
            </div>
            <div className="flex justify-between mb-2 mr-8">
              <label className="font-bold">Vehicle Type:</label>
              {/* Dropdown for selecting vehicle type */}
              <select
                value={selectedVehicleType}
                onChange={(e) => setSelectedVehicleType(e.target.value)}
                className="border border-gray-300 p-2 rounded-lg w-full"
              >
                {/* Add your vehicle type options here */}
                {!userData[0]?.VehicleType ||
                !["Travelor", "Bus", "Taxi5Seater", "Taxi7Seater"].includes(
                  userData[0]?.VehicleType
                ) ? (
                  <option value="" disabled hidden>
                    Select Vehicle Type
                  </option>
                ) : null}
                <option value="Travelor">Travelor</option>
                <option value="Bus">Bus</option>
                <option value="Taxi5Seater">Taxi 5 Seater</option>
                <option value="Taxi7Seater">Taxi 7 Seater</option>
              </select>
            </div>
            {/* Add other user data fields as needed */}
          </>
        )}
        <div className="my-2">
          <TextField
            label="Bill Amount"
            type="number"
            fullWidth
            value={billAmount}
            onChange={(e) => setBillAmount(e.target.value)}
          />
        </div>
        <div className="mb-4">
          <label htmlFor="file">Receipt:</label>
          <input
            type="file"
            id="file"
            onChange={handleFileChange}
            className="border border-gray-300 p-2 rounded-lg w-full"
          />
        </div>
      </DialogContent>
      <DialogActions>
        <Button
          onClick={handleAddVisitClick}
          color="primary"
          variant="contained"
        >
          Add Visit
        </Button>
        <Button onClick={handleClose} color="secondary">
          Cancel
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default AddVisitModal;
