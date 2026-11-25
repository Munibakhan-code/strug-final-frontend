import client from './client';

// Calm lessons (instructor-led sessions)
export const getLessons = (params) => client.get('/calm-lesson', { params }).then(r => r.data);
export const getLesson = (id) => client.get(`/calm-lesson/${id}`).then(r => r.data);
export const createLesson = (data) => client.post('/calm-lesson', data).then(r => r.data);
export const updateLesson = (id, data) => client.put(`/calm-lesson/${id}`, data).then(r => r.data);
export const deleteLesson = (id) => client.delete(`/calm-lesson/${id}`).then(r => r.data);

// Calm providers (instructors)
export const getLessonProviders = (params) => client.get('/calm-providers', { params }).then(r => r.data);
export const getLessonProvider = (id) => client.get(`/calm-providers/${id}`).then(r => r.data);

// Lesson orders (bookings)
export const createLessonOrder = (data) => client.post('/calm-lesson-order-buy', data).then(r => r.data);
export const getLessonOrders = () => client.get('/calm-lesson-order-buy').then(r => r.data);
export const getLessonOrder = (id) => client.get(`/calm-lesson-order-buy/${id}`).then(r => r.data);
export const acceptLessonOrder = (id) => client.put(`/calm-lesson-order-buy/${id}/accept`).then(r => r.data);
export const declineLessonOrder = (id) => client.put(`/calm-lesson-order-buy/${id}/decline`).then(r => r.data);
export const startLesson = (id) => client.patch(`/calm-lesson-order-buy/${id}/start`).then(r => r.data);
export const completeLesson = (id) => client.patch(`/calm-lesson-order-buy/${id}/complete`).then(r => r.data);
