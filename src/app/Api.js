// api.js
import axios from "axios";

// const API_BASE_URL = "https://localhost:7019/HGH"; // Your API base URL
const API_BASE_URL = "https://jolly-chaum.68-178-174-32.plesk.page/HGHApi/HGH";
const apiCall = async (endpoint, method = "GET", data = null) => {
  // console.log(`${API_BASE_URL}/${endpoint}`);
  try {
    const response = await axios({
      method: method,
      url: `${API_BASE_URL}/${endpoint}`,
      data: data,
      headers: {
        "Content-Type": "application/json",
      },
    });
    // console.log({ response }, "req");
    return response.data;
  } catch (error) {
    throw new Error(error.response?.data?.message || "Something went wrong!");
  }
};

export const getProductList = async () => {
  try {
    const response = await apiCall("productdetail"); // Assuming "products" is the endpoint to fetch the product list
    return response; // Assuming the API response directly contains the list of products
  } catch (error) {
    throw new Error(
      error.response?.data?.message ||
        "Something went wrong while fetching products!"
    );
  }
};

export const getAllUsers = async ({ fromDate, toDate }) => {
  try {
    const response = await apiCall(
      `getAllUser?UserRole=1&fromDate=${fromDate}&toDate=${toDate}`
    ); // Assuming "allusers" is the endpoint to fetch all users
    return response; // Assuming the API response directly contains the list of all users
  } catch (error) {
    throw new Error(
      error.response?.data?.message ||
        "Something went wrong while fetching all users!"
    );
  }
};

export const getGiftRequests = async () => {
  try {
    const response = await apiCall(`giftrequests`); // Assuming "giftrequests" is the endpoint to fetch gift requests
    console.log({ response });
    return response; // Assuming the API response directly contains the list of gift requests
  } catch (error) {
    throw new Error(
      error.response?.data?.message ||
        "Something went wrong while fetching gift requests!"
    );
  }
};

export const getGiftRequestsByUserId = async (userId) => {
  try {
    const response = await apiCall(`giftrequestsbyuserid/${userId}`);
    return response; // Assuming the API response contains the gift requests for the specified user ID
  } catch (error) {
    throw new Error(
      error.response?.data?.message ||
        "Something went wrong while fetching gift requests!"
    );
  }
};

export const getExpenseDetailsByUserId = async (userId) => {
  try {
    const response = await apiCall(`expensedetail/${userId}`);

    return response;
  } catch (error) {
    throw new Error(
      error.response?.data?.message ||
        "Something went wrong while fetching expense details!"
    );
  }
};
export const getUserDetailByID = async (userId) => {
  try {
    const response = await apiCall(`userdetail/${userId}`);

    return response;
  } catch (error) {
    throw new Error(
      error.response?.data?.message ||
        "Something went wrong while fetching expense details!"
    );
  }
};
export const getVehicleDetailById = async (userId) => {
  try {
    const response = await apiCall(`vehicledetail/${userId}`);

    return response.data;
  } catch (error) {
    throw new Error(
      error.response?.data?.message ||
        "Something went wrong while fetching expense details!"
    );
  }
};

export const getMasterRule = async () => {
  try {
    const response = await apiCall("getmasterrule"); // Assuming "giftrequests" is the endpoint to fetch gift requests
    return response; // Assuming the API response directly contains the list of gift requests
  } catch (error) {
    throw new Error(
      error.response?.data?.message ||
        "Something went wrong while fetching gift requests!"
    );
  }
};

export const createProduct = async (productData) => {
  try {
    const response = await apiCall("product", "POST", productData);
    return response; // Assuming the API response contains the created product data
  } catch (error) {
    throw new Error(
      error.response?.data?.message ||
        "Something went wrong while creating the product!"
    );
  }
};

export const createRule = async (data) => {
  try {
    const response = await apiCall("masterpoint", "POST", data);
    return response; // Assuming the API response contains the created resource data
  } catch (error) {
    throw new Error(
      error.response?.data?.message ||
        "Something went wrong while creating the resource!"
    );
  }
};

export const updateGiftRequestStatus = async (orderId, newStatus) => {
  try {
    const response = await apiCall(
      `updatestatus?orderId=${orderId}&newStatus=${newStatus}`,
      "POST"
    );
    console.log(response);
    return response;
  } catch (error) {
    throw new Error(
      error.response?.data?.message ||
        "Something went wrong while updating the status!"
    );
  }
};

export const getExpenses = async ({ fromDate, toDate }) => {
  try {
    const response = await apiCall(
      `GetvisitList?fromDate=${fromDate}&toDate=${toDate}`
    );
    console.log("lll", `getallexpenses?fromDate=${fromDate}&toDate=${toDate}`);
    return response;
  } catch (error) {
    throw new Error(
      error.response?.data?.message ||
        "Something went wrong while fetching expense details!"
    );
  }
};

export const updateExpense = async (updatedExpense) => {
  console.log("gggg", updatedExpense);
  try {
    const response = await apiCall(`UpdateVisitStatus`, "POST", updatedExpense);
    console.log("kkkkk", response);
    return response; // Assuming the API response contains the updated expense data
  } catch (error) {
    throw new Error(
      error.response?.data?.message ||
        "Something went wrong while updating the expense!"
    );
  }
};

export const getUserByMobile = async (mobileno) => {
  try {
    const response = await apiCall(`getuser/${mobileno}`, "POST");
    console.log(response.data);
    return response;
  } catch (error) {
    throw new Error(
      error.response?.data?.message ||
        "Something went wrong while fetching user detail!"
    );
  }
};
export const AddVisitbyAdmin = async (visitdata) => {
  console.log("gggg", visitdata);
  try {
    const response = await apiCall(`addvisitbyadmin`, "POST", visitdata);
    console.log("kkkkk", response);
    return response; // Assuming the API response contains the updated expense data
  } catch (error) {
    throw new Error(
      error.response?.data?.message ||
        "Something went wrong while updating the expense!"
    );
  }
};
export const AddBonus = async (bonusdata) => {
  console.log("bonusdata", bonusdata);
  try {
    const response = await apiCall(`addbonus`, "POST", bonusdata);
    console.log("bonusdata", response);
    return response; // Assuming the API response contains the updated expense data
  } catch (error) {
    throw new Error(
      error.response?.data?.message ||
        "Something went wrong while updating the expense!"
    );
  }
};

export const adminLogin = (endpoint, data) => {
  return apiCall(endpoint, "POST", data);
};

export const adminRegister = (endpoint, data) => {
  return apiCall(endpoint, "POST", data);
};
