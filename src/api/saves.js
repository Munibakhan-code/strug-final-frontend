import client from './client';

// Universal favourites. `meta` is a small display snapshot ({ title, sub, price,
// thumb, accent }) so the Favourites page can render the card without hydrating
// the entity from its own service.
export const getSaves = (type) =>
  client.get('/saves', { params: type ? { type } : {} }).then((r) => r.data);
export const toggleSave = (entity_type, entity_id, meta) =>
  client.post('/saves', { entity_type, entity_id, meta }).then((r) => r.data);
export const removeSave = (id) =>
  client.delete(`/saves/${id}`).then((r) => r.data);
