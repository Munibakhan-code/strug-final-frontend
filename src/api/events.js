import client from './client';

// Events
export const getEvents = (params) => client.get('/meetup/events', { params }).then(r => r.data);
export const getEvent = (id) => client.get(`/meetup/events/${id}`).then(r => r.data);
export const createEvent = (data) => client.post('/meetup/events', data).then(r => r.data);
export const updateEvent = (id, data) => client.put(`/meetup/events/${id}`, data).then(r => r.data);
export const deleteEvent = (id) => client.delete(`/meetup/events/${id}`).then(r => r.data);

// Categories
export const getEventCategories = () => client.get('/meetup/categories').then(r => r.data);

// Attendees
export const getEventAttendees = (eventId) => client.get(`/meetup/attendees?event_id=${eventId}`).then(r => r.data);
export const rsvpEvent = (data) => client.post('/meetup/attendees', data).then(r => r.data);
export const cancelRsvp = (id) => client.delete(`/meetup/attendees/${id}`).then(r => r.data);

// Venues / Places
export const getPlaces = (params) => client.get('/place/', { params }).then(r => r.data);
export const getPlace = (id) => client.get(`/place/${id}`).then(r => r.data);

// Place orders (events + venue bookings)
export const createPlaceOrder = (data) => client.post('/place-orders/', data).then(r => r.data);
export const getPlaceOrders = () => client.get('/place-orders/').then(r => r.data);
export const acceptPlaceOrder = (id) => client.put(`/place-orders/${id}/accept`).then(r => r.data);
export const declinePlaceOrder = (id) => client.put(`/place-orders/${id}/decline`).then(r => r.data);
export const completePlaceOrder = (id) => client.put(`/place-orders/${id}/complete`).then(r => r.data);
