import client from './client';

export const getDriverDocuments = () =>
  client.get('/driver-profile/documents').then((r) => r.data?.data ?? []);

export const uploadDriverDocument = (docType, file) => {
  const fd = new FormData();
  fd.append('document', file);
  return client
    .post(`/driver-profile/documents/${docType}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
    .then((r) => r.data?.data ?? null);
};
