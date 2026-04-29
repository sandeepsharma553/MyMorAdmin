/**
 * Firestore path helpers — centralised collection builders.
 * Always use these instead of raw collection(db, ...) strings
 * so path changes only need updating in one place.
 */
import { collection } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Returns a CollectionReference under hostel/{hostelId}/{name}
 * Throws if hostelId is missing so callers fail fast.
 */
export const hostelCol = (hostelId, name) => {
  if (!hostelId) throw new Error(`hostelCol: missing hostelId for collection "${name}"`);
  return collection(db, 'hostel', String(hostelId), name);
};

/**
 * Returns a CollectionReference under university/{universityId}/{name}
 * Throws if universityId is missing so callers fail fast.
 */
export const universityCol = (universityId, name) => {
  if (!universityId) throw new Error(`universityCol: missing universityId for collection "${name}"`);
  return collection(db, 'university', String(universityId), name);
};
