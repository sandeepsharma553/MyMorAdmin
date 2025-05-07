import React, { useState } from "react";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import CircularProgress from "@mui/material/CircularProgress";
import { useDispatch, useSelector } from "react-redux";

import {
  AddBonusByAdmin,
  selectAddBonusSuccess,
  selectAddBonusLoading,
} from "../app/features/addBonusSlice";

const AddBonus = ({ isOpen, handleClose, handleAddBonus, userData }) => {
  const dispatch = useDispatch();

  const [bonusAmount, setBonusAmount] = useState("");
  const [remarks, setRemarks] = useState(""); // Added state for remarks
  const addBonusLoading = useSelector(selectAddBonusLoading);

  const handleBonusAmountChange = (e) => {
    setBonusAmount(e.target.value);
  };

  const handleRemarksChange = (e) => {
    setRemarks(e.target.value);
  };

  const handleAddBonusClick = () => {
    if (!bonusAmount) {
      alert("Bonus amount is required.");
      return;
    }

    const bonusData = {
      UserID: userData[0]?.userID,
      BonusPoint: parseFloat(bonusAmount),
      Remarks: remarks, // Include remarks in the bonus data
      CreatedBy: 1,
    };

    handleAddBonus(bonusData);
  };

  return (
    <Dialog open={isOpen} onClose={handleClose}>
      <DialogTitle className="text-lg font-bold">Add Bonus</DialogTitle>
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
              <span>{userData[0]?.vehicleType}</span>
            </div>
            {/* Add other user data fields as needed */}
          </>
        )}
        <div className="my-2">
          <TextField
            label="Bonus Amount"
            type="number"
            fullWidth
            value={bonusAmount}
            onChange={handleBonusAmountChange}
          />
        </div>
        <div className="my-2">
          <TextField
            label="Remarks"
            fullWidth
            multiline
            rows={4}
            value={remarks}
            onChange={handleRemarksChange}
          />
        </div>
      </DialogContent>
      <DialogActions>
        <Button
          onClick={handleAddBonusClick}
          color="secondary"
          variant="contained"
        >
          {addBonusLoading ? <CircularProgress size={24} /> : "Add Bonus"}
        </Button>
        <Button onClick={handleClose} color="primary">
          Cancel
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default AddBonus;
