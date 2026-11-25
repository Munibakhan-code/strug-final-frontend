import { describe, it, expect, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../test/server.js';
import { getVideoComments, addVideoComment, deleteVideoComment, getPlaylists, getChannelPlaylists, createPlaylist, addVideoToPlaylist } from './videos.js';

beforeEach(() => localStorage.clear());

describe('video comment endpoints', () => {
  it('getVideoComments → GET /video/:id/comments', async () => {
    server.use(http.get('*/video/:id/comments', ({ params }) =>
      HttpResponse.json({ successful: true, id: params.id, data: [] })));
    const out = await getVideoComments(30);
    expect(out.id).toBe('30');
  });

  it('addVideoComment → POST /video/:id/comments with { content, parent_id }', async () => {
    server.use(http.post('*/video/:id/comments', async ({ request, params }) =>
      HttpResponse.json({ id: params.id, body: await request.json() })));
    const out = await addVideoComment(30, 'hello');
    expect(out).toEqual({ id: '30', body: { content: 'hello', parent_id: null } });
  });

  // The regression: this used to build /video/:videoId/comments/:commentId, which matches NO
  // route (the real one is DELETE /video/comments/:comment_id — the comment id alone). Every
  // delete 404'd and the UI silently restored the row. MSW's onUnhandledRequest:'error' makes
  // the wrong path fail this test loudly rather than 404 in silence.
  it('deleteVideoComment → DELETE /video/comments/:commentId (no video id in the path)', async () => {
    let hit = null;
    server.use(http.delete('*/video/comments/:commentId', ({ params, request }) => {
      hit = { commentId: params.commentId, path: new URL(request.url).pathname };
      return HttpResponse.json({ successful: true });
    }));
    const out = await deleteVideoComment(7);
    expect(out).toEqual({ successful: true });
    expect(hit.commentId).toBe('7');
    expect(hit.path).toMatch(/\/video\/comments\/7$/);
  });

  it('deleteVideoComment takes the comment id alone — not (videoId, commentId)', () => {
    expect(deleteVideoComment.length).toBe(1);
  });
});

describe('playlist endpoints', () => {
  it('getPlaylists unwraps { successful, data } to the list', async () => {
    server.use(http.get('*/playlist', () =>
      HttpResponse.json({ successful: true, data: [{ playlist_id: 9, name: 'Mix', videos: [] }] })));
    const out = await getPlaylists();
    expect(out).toEqual([{ playlist_id: 9, name: 'Mix', videos: [] }]);
  });

  it('getChannelPlaylists → GET /playlist/channel/:channelId', async () => {
    server.use(http.get('*/playlist/channel/:channelId', ({ params }) =>
      HttpResponse.json({ successful: true, data: [{ playlist_id: 8, name: 'Gym Hits', videos: [] }] })));
    const out = await getChannelPlaylists(4);
    expect(out).toEqual([{ playlist_id: 8, name: 'Gym Hits', videos: [] }]);
  });

  it('createPlaylist posts Mix + numeric video_id and unwraps the playlist', async () => {
    let body = null;
    server.use(http.post('*/playlist', async ({ request }) => {
      body = await request.json();
      return HttpResponse.json({ successful: true, data: { playlist_id: 4, name: body.name, videos: [{ video_id: body.video_id }] } }, { status: 201 });
    }));
    const out = await createPlaylist('Mix', 31);
    expect(body).toEqual({ name: 'Mix', video_id: 31 });
    expect(out).toEqual({ playlist_id: 4, name: 'Mix', videos: [{ video_id: 31 }] });
  });

  it('addVideoToPlaylist unwraps the updated playlist', async () => {
    server.use(http.post('*/playlist/:id/items', async ({ params, request }) => {
      const body = await request.json();
      return HttpResponse.json({ successful: true, data: { playlist_id: Number(params.id), name: 'Mix', videos: [{ video_id: body.video_id }] } });
    }));
    const out = await addVideoToPlaylist(9, 31);
    expect(out.videos[0].video_id).toBe(31);
  });
});
