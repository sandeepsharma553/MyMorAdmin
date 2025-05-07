import React, { useState, useEffect } from "react";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Button from "@mui/material/Button";

const ExpenseEditModal = ({
  isOpen,
  handleClose,
  expenseData,
  handleUpdate,
}) => {
  // console.log(expenseData);
  const {
    visitID,
    name,
    regNo,
    vehicleType,

    visitDate,
  } = expenseData;

  // console.log("Initial Qty:", initialQty);

  const [selectedFile, setSelectedFile] = useState(null);
  const [visited, setVisited] = useState(false);
  const [billAmount, setBillAmount] = useState(expenseData.billAmount || "");
  const [filename, setFilename] = useState(expenseData.filename || "");
  const [fileBase64, setFileBase64] = useState("");
  const [billAmountError, setBillAmountError] = useState("");
  const [fileError, setFileError] = useState("");
  const [selectedVehicleType, setSelectedVehicleType] = useState("");

  useEffect(() => {
    // Set the selected vehicle type when expenseData changes
    setSelectedVehicleType(expenseData.vehicleType || "");
  }, [expenseData]);
  // useEffect(() => {
  //   // Update the component state when expenseData changes
  //   setQty(initialQty);
  //   setTransactionNo(initialTransactionNo);
  //   setPoint(initialPoint);
  // }, [initialQty, initialTransactionNo, initialPoint]);

  const storedUserData = localStorage.getItem("userData");
  const handleFileChange = (e) => {
    // Update the state with the selected file
    const file = e.target.files[0];
    setFilename(file.name);

    // Convert the selected file to base64
    if (file) {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onloadend = () => {
        const base64String = reader.result.split(",")[1];
        console.log("Base64 String:", base64String);
        setFileBase64(base64String);
      };
    }
  };
  // Parse the JSON string to an object
  const userData = JSON.parse(storedUserData);

  // Access the userRole property
  const userRole = userData.userRole;
  const handleUpdateClick = () => {
    if (!visited) {
      // If not visited, no need for billAmount and fileBase64
      handleUpdate({
        VisitID: visitID,
        status: visited,
        UpdatedBy: userRole,
      });
    } else {
      // If visited, include billAmount and fileBase64 in the update
      handleUpdate({
        VisitID: visitID,
        status: visited,
        billAmount: billAmount.trim() === "" ? 0 : parseFloat(billAmount),
        filename: filename,
        Filebase64: fileBase64,
        UpdatedBy: userRole,
        VehicleType: selectedVehicleType,
      });
    }

    handleClose();
  };

  const formatDate = (inputDate) => {
    const options = {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    };
    return new Date(inputDate).toLocaleDateString(undefined, options);
  };

  const containerStyle = {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  };

  const labelStyle = {
    fontSize: "18px",
    fontWeight: "bold",
    color: "black", // Adjust color as needed
  };

  const inputStyle = {
    padding: "10px",
    border: "1px solid",
    borderRadius: "5px",
    fontSize: "16px",
  };

  const buttonStyle = {
    marginRight: "8px",
    fontSize: "16px",
  };

  return (
    <Dialog open={isOpen} onClose={handleClose}>
      <DialogTitle>Update status</DialogTitle>
      <DialogContent>
        <div style={containerStyle}>
          <div>
            <label style={labelStyle}>Name:{name}</label>
          </div>
          <div>
            <label style={labelStyle}>Vehicle Type:</label>
            <select
              value={selectedVehicleType}
              onChange={(e) => setSelectedVehicleType(e.target.value)}
              style={inputStyle}
            >
              {/* Add your vehicle type options here */}
              <option value="Travelor">Travelor</option>
              <option value="Bus">Bus</option>
              <option value="Taxi5Seater">Taxi 5 Seater</option>
              <option value="Taxi7Seater">Taxi 7 Seater</option>
              {/* Add more options as needed */}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Reg No.: {regNo}</label>
          </div>
          <div>
            <label style={labelStyle}>
              Visit Date & Time: {formatDate(visitDate)}
            </label>
          </div>

          <div className="flex ">
            <label style={labelStyle}>Visited:</label>
            <div className="ms-4">
              <input
                type="radio"
                id="visitedYes"
                name="visited"
                value="Yes"
                checked={visited}
                onChange={() => setVisited(true)}
              />
              <label htmlFor="visitedYes">Yes</label>
            </div>
            <div className="ms-4">
              <input
                type="radio"
                id="visitedNo"
                name="visited"
                value="No"
                checked={!visited}
                onChange={() => setVisited(false)}
              />
              <label htmlFor="visitedNo">No</label>
            </div>
          </div>
          {visited && (
            <>
              <div>
                <label style={labelStyle}>Bill Amount:</label>
                <input
                  type="text"
                  value={billAmount}
                  onChange={(e) => setBillAmount(e.target.value)}
                  style={inputStyle}
                />
                {billAmountError && (
                  <div style={{ color: "red", marginTop: "8px" }}>
                    {billAmountError}
                  </div>
                )}
              </div>
              <div className="mb-4">
                <label htmlFor="file" style={labelStyle}>
                  Receipt:
                </label>
                <input
                  type="file"
                  id="file"
                  onChange={handleFileChange}
                  className="border border-gray-300 p-2 rounded-lg w-full"
                />
                {fileError && (
                  <div style={{ color: "red", marginTop: "8px" }}>
                    {fileError}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </DialogContent>
      <DialogActions>
        <Button
          onClick={handleUpdateClick}
          color="primary"
          variant="contained"
          style={buttonStyle}
        >
          Update
        </Button>
        <Button onClick={handleClose} color="secondary" style={buttonStyle}>
          Cancel
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ExpenseEditModal;
