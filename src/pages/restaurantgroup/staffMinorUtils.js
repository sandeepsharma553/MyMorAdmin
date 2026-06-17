/* Pure minor / under-18 helpers — extracted from the existing Turning18Alert
 * date logic so it can be reused and unit-tested. NO new minor-handling fields and
 * NO new compliance rules: this is the same DOB→18th-birthday math the compliance
 * card already used, plus a read of the public "Junior" employment type. */
const MS_DAY = 86400000;
const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };

// yyyy-mm-dd (private dob) → Date | null
export const parseDob = (s) => {
  if (!s) return null;
  const d = new Date(String(s) + "T00:00:00");
  return isNaN(d.getTime()) ? null : d;
};
export const nthBirthday = (dob, n) => new Date(dob.getFullYear() + n, dob.getMonth(), dob.getDate());

// public staff.type === "Junior" (the Part-B employment type)
export const isJuniorType = (type) => (type || "").trim().toLowerCase() === "junior";

// under 18 as of `asOf` — the 18th birthday is strictly in the future
export const isMinorDob = (dob, asOf = new Date()) => {
  const d = typeof dob === "string" ? parseDob(dob) : dob;
  if (!d) return false;
  return nthBirthday(d, 18) > startOfDay(asOf);
};

// whole days until the 18th birthday (negative once turned 18); null when no dob
export const daysToEighteen = (dob, asOf = new Date()) => {
  const d = typeof dob === "string" ? parseDob(dob) : dob;
  if (!d) return null;
  return Math.round((nthBirthday(d, 18) - startOfDay(asOf)) / MS_DAY);
};
