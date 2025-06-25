import React, { useState, useEffect } from "react";
import { collection, addDoc, getDocs, updateDoc, doc, setDoc, deleteDoc, query, where, getDoc } from "firebase/firestore";
import { db } from "../../src/firebase";
import { useSelector } from "react-redux";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver"
import { ClipLoader, FadeLoader } from "react-spinners";
import { ToastContainer, toast } from "react-toastify";
import diningMenuFile from "../assets/excel/dining_menu.xlsx";
export default function DiningMenuPage(props) {
  const { navbarHeight } = props;
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteData, setDelete] = useState(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [list, setList] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [data, setData] = useState([]);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [fileName, setFileName] = useState('No file chosen');
    const uid = useSelector((state) => state.auth.user);

  const [form, setForm] = useState({
    date: '',
    day: '',
    meals: {
      breakfast: { time: '', items: [''] },
      lunch: { time: '', items: [''] },
      dinner: { time: '', items: [''] }
    }
  });

  const handleChange = (meal, index, value) => {
    const updatedItems = [...form.meals[meal].items];
    updatedItems[index] = value;
    setForm({
      ...form,
      meals: {
        ...form.meals,
        [meal]: {
          ...form.meals[meal],
          items: updatedItems
        }
      }
    });
  };

  const addItem = (meal) => {
    setForm({
      ...form,
      meals: {
        ...form.meals,
        [meal]: {
          ...form.meals[meal],
          items: [...form.meals[meal].items, '']
        }
      }
    });
  };
  const removeItem = (meal, index) => {
    const updatedItems = form.meals[meal].items.filter((_, i) => i !== index);
    setForm({
      ...form,
      meals: {
        ...form.meals,
        [meal]: {
          ...form.meals[meal],
          items: updatedItems,
        },
      },
    });
  };
  const handleTimeChange = (meal, value) => {
    setForm({
      ...form,
      meals: {
        ...form.meals,
        [meal]: {
          ...form.meals[meal],
          time: value
        }
      }
    });
  };
  const getDayFromDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { weekday: 'long' });
  };
  const handleSubmit = async (e) => {
    e.preventDefault();
   
    if (!form.date) {
      toast.warning("Please select a date.");
      return;
    }
    try {

      const menuRef = doc(db, 'menus', form.date);
      const docSnap = await getDoc(menuRef);
    
      if (docSnap.exists()) {
        toast.warn('Menu for this date already exists!');
      } else {
        await setDoc(menuRef, form);
        toast.success('Menu saved!');
        setModalOpen(false);
        getList(form.date);
        setForm({
          date: '',
          day: '',
          meals: {
            breakfast: { time: '', items: [''] },
            lunch: { time: '', items: [''] },
            dinner: { time: '', items: [''] }
          }
        })

      }



     
    }
    catch (error) {
      console.error("Error saving data:", error);
    }

  };

  useEffect(() => {
    const today = new Date();
    const currentdate = today.toISOString().split('T')[0];
    getList(currentdate)
  }, [])
  const getList = async (date) => {
    setIsLoading(true)
    const { start, end } = getWeekRange(date);
    const q = query(
      collection(db, 'menus'),
      where("date", ">=", start),
      where("date", "<=", end)
    );

    const querySnapshot = await getDocs(q);
    const weekMenus = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    setList(weekMenus)
    setIsLoading(false)

  }
  const getWeekRange = (dateStr) => {
    const date = new Date(dateStr);
    const day = date.getDay(); // 0 = Sunday
    const diffToMonday = date.getDate() - day + (day === 0 ? -6 : 1);

    const monday = new Date(date.setDate(diffToMonday));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    const format = (d) => d.toISOString().split("T")[0];

    return { start: format(monday), end: format(sunday) };
  };

  const handleDelete = async () => {
    if (!deleteData) return;
    try {
      await deleteDoc(doc(db, 'menus', 1));
      toast.success('Successfully deleted!');
      getList()
    } catch (error) {
      console.error('Error deleting document: ', error);
    }
    setConfirmDeleteOpen(false);
    setDelete(null);
  };
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const structuredData = {
    breakfast: {},
    lunch: {},
    dinner: {}
  };

  days.forEach(day => {
    structuredData.breakfast[day] = [];
    structuredData.lunch[day] = [];
    structuredData.dinner[day] = [];
  });

  list.forEach(menu => {
    if (menu.meals) {
      structuredData.breakfast[menu.day] = menu.meals.breakfast?.items || [];
      structuredData.lunch[menu.day] = menu.meals.lunch?.items || [];
      structuredData.dinner[menu.day] = menu.meals.dinner?.items || [];
    }
  });

  const readExcel = (file) => {
    setIsLoading(true)
    const reader = new FileReader();
    reader.onload = (evt) => {
      const bstr = evt.target.result;
      const workbook = XLSX.read(bstr, { type: "binary" });

      // Get first sheet name
      const sheetName = workbook.SheetNames[0];
      // Get worksheet
      const worksheet = workbook.Sheets[sheetName];
      //const rows = XLSX.utils.sheet_to_json(worksheet);

      // // Convert to JSON
      const jsonData = XLSX.utils.sheet_to_json(worksheet);

      // const menuMap = {};
      // rows.forEach(row => {
      //   const { Date, Day, Meal, Time, Item } = row;
      //   if (!menuMap[Date]) {
      //     menuMap[Date] = {
      //       date: Date,
      //       day: Day,
      //       meals: {}
      //     };
      //   }
      //   const mealKey = Meal.toLowerCase();
      //   if (!menuMap[Date].meals[mealKey]) {
      //     menuMap[Date].meals[mealKey] = {
      //       time: Time,
      //       items: []
      //     };
      //   }
      //   menuMap[Date].meals[mealKey].items.push(Item);

      // });


      // Convert flat jsonData to nested format
      const nestedData = [];

      // Group by date + day
      const groupedByDate = {};

      jsonData.forEach(({ Date, Day, Meal, Time, Item }) => {
        const key = Date + "|" + Day;

        if (!groupedByDate[key]) {
          groupedByDate[key] = {
            date: Date,
            day: Day,
            meals: {}
          };
        }

        if (!groupedByDate[key].meals[Meal]) {
          groupedByDate[key].meals[Meal] = {
            Time,
            items: [],
          };
        }

        groupedByDate[key].meals[Meal].items.push(Item);
      });

      // Convert grouped object to array
      for (const key in groupedByDate) {
        nestedData.push(groupedByDate[key]);
      }

      setData(nestedData);
    
    };
    reader.readAsBinaryString(file);
    setIsLoading(false)
  };

  const saveToFirebase = async () => {
    try {
      // for (const entry of data) {
      //   const docRef = doc(db, "menus", entry.date);
      //   await setDoc(docRef, entry);
      // }

      for (const entry of data) {
        const docRef = doc(db, "menus", entry.date);
        const docSnap = await getDoc(docRef);
    
        if (docSnap.exists()) {
          toast.warn(`Menu for ${entry.date} already exists. Skipping...`);
          continue; // Skip this entry
        }
    
        await setDoc(docRef, entry);
      }

      toast.success("Data saved!");
      const today = new Date();
      const currentdate = today.toISOString().split('T')[0];
      getList(currentdate)
      setFileName('No file chosen')
    } catch (error) {
      console.error("Error saving data: ", error);
    }
    // for (const date in menuMap) {
    //   const docRef = db.collection("menus").doc(date);
    //   await docRef.set(menuMap[date]);
    
    // }
  };
  const handleDownload = async () => {
    const response = await fetch(diningMenuFile);
    const blob = await response.blob();
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "dining_menu.xlsx"; // Optional: custom file name
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  return (
    <main className="flex-1 p-6 bg-gray-100 overflow-auto">
      {/* Top bar with Add button */}
      <div className="flex items-center justify-between flex-wrap gap-4 mb-4">
        <h1 className="text-2xl font-semibold">Dining Menu</h1>
        <div className="flex items-center gap-4 flex-wrap">
          <input type="date" value={date} className="border px-3 py-2 rounded-lg"
            onChange={(e) => {
              const selectedDate = e.target.value;
              setDate(selectedDate)
              getList(selectedDate)
            }}

          />
          <button className="bg-black text-white px-6 py-2 rounded-xl hover:bg-gray-800 transition" onClick={handleDownload}>Download Excel File</button>
          <div className="flex items-center gap-2 bg-gray-100 border border-gray-300 px-4 py-2 rounded-xl">
          <label className="cursor-pointer">
            <input type="file" accept=".xlsx, .xls" className="hidden"
              onChange={(e) => {
                if (e.target.files.length > 0) {
                  setFileName(e.target.files[0].name);
                } else {
                  setFileName('No file chosen');
                }
                const file = e.target.files[0];
                if (file) readExcel(file);
              }}
            />
            📁 Choose File
          </label>
          <span className="text-sm text-gray-600 truncate max-w-[150px]">
            {fileName}
          </span>
          </div>
          <button className="bg-black text-white px-6 py-2 rounded-xl hover:bg-gray-800 transition"
          disabled={!data.length}
          onClick={saveToFirebase}>
            Upload Excel
          </button>

          <button className="bg-black text-white px-6 py-2 rounded-xl hover:bg-gray-800 transition"
            onClick={() => {
              setModalOpen(true);
            }}>
            + Add
          </button>
        </div>
      </div>
      <div className="overflow-x-auto bg-white rounded shadow">
        <div>
          {isLoading ? (
            <div className="flex justify-center items-center h-64">
              <FadeLoader color="#36d7b7" loading={isLoading} />
            </div>
          ) : (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Meal</th>
                  {days.map(day => (
                    <th key={day} className="px-6 py-3 text-left text-sm font-medium text-gray-500">
                      {day}
                    </th>
                  ))}
                  {/* <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Actions</th> */}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {["breakfast", "lunch", "dinner"].map(mealType => (
                  <tr key={mealType}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-700 capitalize">
                      {mealType}
                    </td>
                    {days.map(day => (
                      <td key={day} className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                        <ul className="list-disc list-inside space-y-1">
                          {(structuredData[mealType.toLowerCase()][day] || []).map((item, index) => (
                            <li key={index}>{item}</li>
                          ))}
                        </ul>
                      </td>
                    ))}
                    {/* <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <button className="text-blue-600 hover:underline mr-3" onClick={() => setModalOpen(true)}>
                      Edit
                    </button>
                    <button className="text-red-600 hover:underline" onClick={() => setConfirmDeleteOpen(true)}>
                      Delete
                    </button>
                  </td> */}
                  </tr>
                ))}
              </tbody>
            </table>


          )}
        </div>


      </div>
      {modalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 rounded-lg shadow-lg">
            <h2 className="text-2xl font-bold mb-4">Add Dining Menu</h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block font-medium mb-1">Date:</label>
                <input
                  type="date"
                  className="w-full border border-gray-300 p-2 rounded"
                  onChange={(e) => {
                    const selectedDate = e.target.value;
                  
                    const day = getDayFromDate(selectedDate);
                    setForm(prev => ({ ...prev, date: selectedDate, day }));
                  }}
                  required
                />
              </div>

              <div>
                <label className="block font-medium mb-1">Day:</label>
                <input
                  type="text"
                  value={form.day}
                  disabled
                  className="w-full border border-gray-300 p-2 rounded"
                  onChange={(e) => setForm({ ...form, day: e.target.value })}
                  required
                />
              </div>

              {['breakfast', 'lunch', 'dinner'].map((meal, index) => (
                <div key={meal} className="border border-gray-200 p-4 rounded mb-4">
                  <h3 className="text-lg font-semibold capitalize mb-2">{meal}</h3>

                  <label className="block font-medium mb-1">Time:</label>
                  <input
                    type="text"
                    className="w-full border border-gray-300 p-2 rounded mb-3"
                    value={form.meals[meal].time}
                    onChange={(e) => handleTimeChange(meal, e.target.value)}
                    required
                  />

                  {form.meals[meal].items.map((item, index) => (
                    <div key={index} className="mb-2">
                      <input
                        type="text"
                        className="w-full border border-gray-300 p-2 rounded"
                        placeholder={`Item ${index + 1}`}
                        value={item}
                        onChange={(e) => handleChange(meal, index, e.target.value)}
                        required
                      />
                    </div>
                  ))}

                  <button
                    type="button"
                    onClick={() => addItem(meal)}
                    className="mt-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                  >
                    Add Item
                  </button>
                  <button
                    type="button"
                    onClick={() => removeItem(meal, index)}
                    className="text-red-500 hover:text-red-700"
                    title="Delete item"
                  >
                    ❌
                  </button>
                </div>
              ))}

              <div className="flex justify-end gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 bg-gray-300 text-gray-800 rounded hover:bg-gray-400"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>

      )}
      {confirmDeleteOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg w-80 shadow-lg">
            <h2 className="text-xl font-semibold mb-4 text-red-600">Delete User</h2>
            <p className="mb-4">Are you sure you want to delete <strong>{deleteData?.name}</strong>?</p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => {
                  setConfirmDeleteOpen(false);
                  setDelete(null);
                }}
                className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      <ToastContainer />

    </main>
  );
}
