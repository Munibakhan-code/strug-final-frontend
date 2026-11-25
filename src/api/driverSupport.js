import client from './client';

// Reuses the same bug-reports intake as the general Help Center — driver tickets are just
// category='driver_support' rows in the same bug_report table, filterable by the board.
// /submit expects multipart (the shared multer middleware parses it either way), even though
// the driver flow never attaches screenshots.
export const submitDriverTicket = ({ title, description }) => {
  const fd = new FormData();
  fd.append('title', title);
  fd.append('description', description);
  fd.append('category', 'driver_support');
  return client.post('/bug-reports/submit', fd, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data);
};

export const getMyDriverTickets = () =>
  client.get('/bug-reports/mine').then((r) => (r.data?.reports ?? []).filter((rep) => rep.category === 'driver_support'));

export const replyToTicket = (bugReportId, body) =>
  client.post(`/bug-reports/mine/${bugReportId}/messages`, { body }).then((r) => r.data);
