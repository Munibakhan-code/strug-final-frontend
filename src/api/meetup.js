import client from './client';

export const getMeetupEvents = (params) => client.get('/meetup/events', { params }).then(r => r.data);
export const getMeetupEvent = (id) => client.get(`/meetup/events/${id}`).then(r => r.data);
export const getMeetupCategories = () => client.get('/meetup/categories').then(r => r.data);
export const createMeetupAttendee = (data) => client.post('/meetup/attendees', data).then(r => r.data);
