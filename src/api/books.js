import client from './client';

export const getBooks = (params) => client.get('/books', { params }).then(r => r.data);
export const getBook = (id) => client.get(`/books/${id}`).then(r => r.data);
export const createBookOrder = (data) => client.post('/books/orders', data).then(r => r.data);
export const createBookListing = (data) => client.post('/books/listings', data).then(r => r.data);
export const getSellerBookListings = (sellerId) => client.get(`/books/listings/${sellerId}`).then(r => r.data);
