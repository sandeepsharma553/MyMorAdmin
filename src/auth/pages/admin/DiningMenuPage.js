import React, { useState, useEffect } from "react";
import { collection, addDoc, getDocs, updateDoc, doc, setDoc, deleteDoc, query, where, getDoc, Timestamp } from "firebase/firestore";
import { db } from "../../../firebase";
import { useSelector } from "react-redux";
import * as XLSX from "xlsx";
import { MenuItem, Select, Checkbox, ListItemText } from '@mui/material';
import { ClipLoader, FadeLoader } from "react-spinners";
import { ToastContainer, toast } from "react-toastify";
import diningMenuFile from "../../../assets/excel/dining_menu.xlsx";
export default function DiningMenuPage(props) {
  const { navbarHeight } = props;
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteData, setDelete] = useState(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [editingData, setEditing] = useState(null);
  const [list, setList] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [data, setData] = useState([]);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [fileName, setFileName] = useState('No file chosen');
  const [currentPage, setCurrentPage] = useState(1);
  const uid = useSelector((state) => state.auth.user.uid);
  const emp = useSelector((state) => state.auth.employee)
  const [form, setForm] = useState({
    date: '',
    day: '',
    meals: {
      breakfast: { time: '', items: [{ name: '', tags: [] }] },
      lunch: { time: '', items: [{ name: '', tags: [] }] },
      dinner: { time: '', items: [{ name: '', tags: [] }] }
    },
    uid: uid,
    hostelid: emp.hostelid
  });
  const pageSize = 10;
  const mockData = list
 
  const totalPages = Math.ceil(mockData.length / pageSize);
  const paginatedData = mockData.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );
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
      where("hostelid", "==", emp.hostelid),
      where("date", ">=", start),
      where("date", "<=", end),
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
    setForm((prevForm) => {
      const updatedItems = [
        ...prevForm.meals[meal].items,
        { name: "", tags: [] }
      ];
      return {
        ...prevForm,
        meals: {
          ...prevForm.meals,
          [meal]: {
            ...prevForm.meals[meal],
            items: updatedItems
          }
        }
      };
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
      if (editingData) {
        if (docSnap.exists()) {
          await updateDoc(menuRef, form);
          toast.success("Menu updated successfully!");
        }
      }
      else {
        if (docSnap.exists()) {
          toast.warn('Menu for this date already exists!');
          return;
        } else {
          await setDoc(menuRef, form);
          toast.success("Menu created successfully!");

        }
      }
      setModalOpen(false);
      getList(form.date);
      setForm({
        date: '',
        day: '',
        meals: {
          breakfast: { time: '', items: [''] },
          lunch: { time: '', items: [''] },
          dinner: { time: '', items: [''] }
        },
        uid: uid,
        hostelid: emp.hostelid
      })
    }
    catch (error) {
      console.error("Error saving data:", error);
    }

  };

 

  const handleDelete = async () => {
    if (!deleteData?.date) return;
    try {
      await deleteDoc(doc(db, 'menus', deleteData.date));
      toast.success('Successfully deleted!');
      getList(date);
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
      Object.keys(menu.meals).forEach(meal => {
        const lowerMeal = meal.toLowerCase();
        if (structuredData[lowerMeal] && menu.meals[meal]?.items) {
          structuredData[lowerMeal][menu.day] = menu.meals[meal].items;
        }
      });
    }
  });

  const readExcel = (file) => {
    setIsLoading(true);
    const reader = new FileReader();
    reader.onload = (evt) => {
      const bstr = evt.target.result;
      const workbook = XLSX.read(bstr, { type: "binary" });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];

      const jsonData = XLSX.utils.sheet_to_json(worksheet);

      const nestedData = [];
      const groupedByDate = {};

      jsonData.forEach(({ Date, Day, Meal, Time, Menu_Items, Tags }) => {
        // ✅ Convert Date to ISO string
        let formattedDate;
        if (typeof Date === 'number') {
          // Excel serial to JS Date
          formattedDate = XLSX.SSF.format("yyyy-mm-dd", Date);
        } else if (Date instanceof Date) {
          formattedDate = Date.toISOString().split('T')[0];
        } else {
          formattedDate = new Date(Date).toISOString().split('T')[0]; // fallback
        }

        const key = formattedDate + "|" + Day;
        const mealKey = Meal.toLowerCase();
        if (!groupedByDate[key]) {
          groupedByDate[key] = {
            date: formattedDate,
            day: Day,
            meals: {},
            uid:uid,
            hostelid: emp.hostelid
          };
        }

        if (!groupedByDate[key].meals[Meal.toLowerCase()]) {
          groupedByDate[key].meals[Meal.toLowerCase()] = {
            time: Time,
            items: [],
          };
        }
        const tagsArray = typeof Tags === 'string'
          ? Tags.split(',').map(tag => tag.trim()).filter(Boolean)
          : [];
        groupedByDate[key].meals[mealKey].items.push({
          name: Menu_Items,
          tags: tagsArray
        });

        // groupedByDate[key].meals[Meal.toLowerCase()].items.push(Item);

      });

      for (const key in groupedByDate) {
        nestedData.push(groupedByDate[key]);
      }

      setData(nestedData);
      setIsLoading(false);
    };

    reader.readAsBinaryString(file);
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
  const dietaryTags = [
    { id: 'V', name: 'Vegetarian' },
    { id: 'VG', name: 'Vegan' },
    { id: 'VGO', name: 'Vegan Option' },
    { id: 'GF', name: 'Gluten-Free' },
    { id: 'DF', name: 'Dairy-Free' },
    { id: 'DFO', name: 'Dairy-Free Option' },
    { id: 'NF', name: 'Nut-Free' },
    { id: 'SF', name: 'Shellfish-Free' },
    { id: 'SF-C', name: 'Contains Shellfish' },
    { id: 'CSF', name: 'Contains Seafood' },
    { id: 'EF', name: 'Egg-Free' },
    { id: 'HF', name: 'Halal-Friendly' },
    { id: 'KF', name: 'Kosher-Friendly' },
    { id: 'SOYF', name: 'Soy-Free' },
    { id: 'P', name: 'Contains Pork' },
    { id: 'NV', name: 'Non-Vegetarian' },
    { id: 'PS', name: 'Pescatarian' },
  ];
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
              setEditing(null)
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
            // <table className="min-w-full divide-y divide-gray-200">
            //   <thead className="bg-gray-50">
            //     <tr>
            //       <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Meal</th>
            //       {days.map(day => (
            //         <th key={day} className="px-6 py-3 text-left text-sm font-medium text-gray-500">
            //           {day}
            //         </th>
            //       ))}
            //       {/* <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Actions</th> */}
            //     </tr>
            //   </thead>
            //   <tbody className="divide-y divide-gray-200">
            //     {["breakfast", "lunch", "dinner"].map(mealType => (
            //       <tr key={mealType}>
            //         <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-700 capitalize">
            //           {mealType}
            //         </td>
            //         {days.map(day => (
            //           <td key={day} className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
            //             <ul className="list-disc list-inside space-y-1">
            //               {(structuredData[mealType.toLowerCase()][day] || []).map((item, index) => (
            //                 <li key={index}>{item}</li>
            //               ))}
            //             </ul>
            //           </td>
            //         ))}
            //         <td className="px-6 py-4 whitespace-nowrap text-sm">
            //           <button className="text-blue-600 hover:underline mr-3" onClick={() => {
            //             setEditing(menu);
            //             setForm(menu);
            //             setModalOpen(true)
            //           }}>
            //             Edit
            //           </button>
            //           <button className="text-red-600 hover:underline" onClick={() => setConfirmDeleteOpen(true)}>
            //           Delete
            //         </button>
            //         </td>
            //       </tr>
            //     ))}
            //   </tbody>
            // </table>

            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Date</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Day</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Breakfast</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Lunch</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Dinner</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Actions</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-200">
                {paginatedData.length === 0 ? (
                  <tr>
                    <td colSpan="4" className="px-6 py-4 text-center text-gray-500">
                      No matching users found.
                    </td>
                  </tr>
                ) : (
                  paginatedData.map((menu) => (
                    <tr key={menu.date}>
                      <td className="px-4 py-3 whitespace-nowrap text-gray-800 font-medium">{menu.date}</td>
                      <td className="px-4 py-3 text-gray-700">{menu.day}</td>

                      {['breakfast', 'lunch', 'dinner'].map((meal) => (
                        <td key={meal} className="px-4 py-3 align-top w-1/4">
                          <ul className="space-y-2">
                            {menu.meals?.[meal]?.items?.map((item, i) => (
                              <li key={i}>
                                <div className="font-semibold text-gray-900">{item.name}</div>
                                {item.tags?.length > 0 && (
                                  <div className="text-xs text-gray-500">
                                    {item.tags.map((tag, index) => (
                                      <span
                                        key={index}
                                        className="inline-block bg-gray-100 border border-gray-300 text-gray-600 text-xs px-1.5 py-0.5 mr-1 rounded"
                                      >
                                        {tag}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </li>
                            ))}
                          </ul>
                        </td>
                      ))}

                      <td className="px-4 py-3 text-sm">
                        <button
                          className="text-blue-600 hover:underline mr-3"
                          onClick={() => {
                            setEditing(menu);
                            setForm(menu);
                            setModalOpen(true);
                          }}
                        >
                          Edit
                        </button>
                        <button
                          className="text-red-600 hover:underline"
                          onClick={() => {
                            setConfirmDeleteOpen(true);
                            setDelete(menu);
                          }}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>



          )}

        </div>


      </div>
      <div className="flex justify-between items-center mt-4">
        <p className="text-sm text-gray-600">
          Page {currentPage} of {totalPages}
        </p>
        <div className="space-x-2">
          <button
            onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
            disabled={currentPage === 1}
            className="px-3 py-1 bg-gray-200 rounded disabled:opacity-50"
          >
            Previous
          </button>
          <button
            onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
            disabled={currentPage === totalPages}
            className="px-3 py-1 bg-gray-200 rounded disabled:opacity-50"
          >
            Next
          </button>
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
                  value={form.date}
                  disabled={editingData !== null}
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
                    <div key={index} className="mb-2 space-y-4">
                      <input
                        type="text"
                        className="w-full border border-gray-300 p-2 rounded"
                        placeholder={`Item ${index + 1}`}
                        value={item.name}
                        onChange={(e) => {
                          const updatedItems = [...form.meals[meal].items];
                          updatedItems[index].name = e.target.value;
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
                        }}
                        required
                      />

                      <Select
                        className="w-full"
                        multiple
                        displayEmpty
                        value={item.tags}
                        onChange={(e) => {
                          const selected = e.target.value;
                          const updatedItems = [...form.meals[meal].items];
                          updatedItems[index].tags = selected;
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
                        }}
                        renderValue={(selected) =>
                          selected.length
                            ? selected
                              .map((id) => {
                                const tag = dietaryTags.find((t) => t.id === id);
                                return tag?.name || id;
                              })
                              .join(", ")
                            : "Select Tags"
                        }
                      >
                        {dietaryTags.map(({ id, name }) => (
                          <MenuItem key={id} value={id}>
                            <Checkbox checked={item.tags.includes(id)} />
                            <ListItemText primary={name} />
                          </MenuItem>
                        ))}
                      </Select>
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
            <h2 className="text-xl font-semibold mb-4 text-red-600">Delete Dining Menu</h2>
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
