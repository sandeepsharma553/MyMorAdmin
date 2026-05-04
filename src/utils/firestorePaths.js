
import { collection } from 'firebase/firestore';
import { db } from '../firebase';

export const hostelCol = (hostelId, name) => {
  if (!hostelId) throw new Error(`hostelCol: missing hostelId for collection "${name}"`);
  return collection(db, 'hostel', String(hostelId), name);
};

export const universityCol = (universityId, name) => {
  if (!universityId) throw new Error(`universityCol: missing universityId for collection "${name}"`);
  return collection(db, 'university', String(universityId), name);
};

export const restaurantCol = (restaurantId, name) => {
  if (!restaurantId) throw new Error(`restaurantCol: missing restaurantId for collection "${name}"`);
  return collection(db, 'restaurants', String(restaurantId), name);
};

// products/{productId}/{name}  — e.g. productCol(productId, 'productOrders')
export const productCol = (productId, name) => {
  if (!productId) throw new Error(`productCol: missing productId for collection "${name}"`);
  return collection(db, 'products', String(productId), name);
};

// services/{serviceId}/{name}  — e.g. serviceCol(serviceId, 'servicebookings')
export const serviceCol = (serviceId, name) => {
  if (!serviceId) throw new Error(`serviceCol: missing serviceId for collection "${name}"`);
  return collection(db, 'services', String(serviceId), name);
};
