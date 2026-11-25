// api/jobs.js — jobs vertical (seeker + employer).
import client from './client';

const clean = (params = {}) => {
  const out = {};
  Object.keys(params).forEach((k) => {
    if (params[k] !== undefined && params[k] !== null && params[k] !== '') out[k] = params[k];
  });
  return out;
};

// ---- jobs ---------------------------------------------------------------
export const getJobs = (params = {}) =>
  client.get('/job', { params: clean(params) }).then((r) => r.data);

/** Personalized open roles for the logged-in seeker (no sponsored ads). */
export const getRecommendedJobs = (params = {}) =>
  client.get('/job/recommended', { params: clean(params) }).then((r) => r.data);

export const getJob = (id) => client.get(`/job/${id}`).then((r) => r.data);

export const createJob = (data) => client.post('/job', data).then((r) => r.data);

export const updateJob = (id, data) => client.put(`/job/${id}`, data).then((r) => r.data);

export const setJobStatus = (id, status) =>
  client.patch(`/job/${id}/status`, { status }).then((r) => r.data);

export const deleteJob = (id) => client.delete(`/job/${id}`).then((r) => r.data);

export const getMyPostedJobs = () => client.get('/job/my/posted').then((r) => r.data);

export const getJobApplicants = (jobId) =>
  client.get(`/job/${jobId}/applications`).then((r) => r.data);

export const getJobCategories = () => client.get('/job/categories').then((r) => r.data);

/** Seeker flags a job for review. */
export const reportJob = (jobId, data) =>
  client.post(`/job/${jobId}/report`, data).then((r) => r.data);

/** Admin job-report queue. */
export const adminGetJobReports = (params = {}) =>
  client.get('/job/admin/reports', { params: clean(params) }).then((r) => r.data);

export const adminResolveJobReport = (reportId, data) =>
  client.patch(`/job/admin/reports/${reportId}`, data).then((r) => r.data);

// ---- applications -------------------------------------------------------
export const applyToJob = (data) =>
  client.post('/job/applications', data).then((r) => r.data);

export const getMyApplications = () =>
  client.get('/job/applications/mine').then((r) => r.data);

export const updateApplication = (id, data) =>
  client.put(`/job/applications/${id}`, data).then((r) => r.data);

export const setApplicationStatus = (id, status) =>
  client.patch(`/job/applications/${id}/status`, { status }).then((r) => r.data);

export const setApplicationNotes = (id, employer_notes) =>
  client.patch(`/job/applications/${id}/notes`, { employer_notes }).then((r) => r.data);

export const setApplicationInterview = (id, data) =>
  client.patch(`/job/applications/${id}/interview`, data).then((r) => r.data);

export const getApplicationTimeline = (id) =>
  client.get(`/job/applications/${id}/timeline`).then((r) => r.data);

export const bulkSetApplicationStatus = (ids, status) =>
  client.post('/job/applications/bulk-status', { ids, status }).then((r) => r.data);

export const getEmployerJobAnalytics = () =>
  client.get('/job/my/analytics').then((r) => r.data);

/** Seeker funnel: view / apply (see also api/jobsAnalytics.js). */
export { trackJobEvent } from './jobsAnalytics.js';

export const withdrawApplication = (id) =>
  client.delete(`/job/applications/${id}`).then((r) => r.data);

// ---- seeker saved searches (Phase 5) ------------------------------------
export const getJobSavedSearches = () =>
  client.get('/job/saved-searches').then((r) => r.data);

export const createJobSavedSearch = (data) =>
  client.post('/job/saved-searches', data).then((r) => r.data);

export const updateJobSavedSearch = (id, data) =>
  client.patch(`/job/saved-searches/${id}`, data).then((r) => r.data);

export const deleteJobSavedSearch = (id) =>
  client.delete(`/job/saved-searches/${id}`).then((r) => r.data);

export const runJobSavedSearchAlerts = () =>
  client.post('/job/saved-searches/run-alerts').then((r) => r.data);

// ---- résumé upload (PDF or image) → { url } -----------------------------
export const uploadResume = (file) => {
  const fd = new FormData();
  fd.append('file', file);
  return client
    .post('/job/resume', fd, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 90000 })
    .then((r) => r.data);
};

// ---- seeker profile (candidate) -----------------------------------------
export const getMyCandidate = () => client.get('/candidate/me').then((r) => r.data);

export const updateMyCandidate = (data) => client.put('/candidate/me', data).then((r) => r.data);

export const getMyPortfolio = () => client.get('/candidate/me/portfolio').then((r) => r.data);

export const addPortfolioItem = (data) =>
  client.post('/candidate/me/portfolio', data).then((r) => r.data);

export const uploadPortfolioFile = (file, title) => {
  const fd = new FormData();
  fd.append('file', file);
  if (title) fd.append('title', title);
  return client
    .post('/candidate/me/portfolio/upload', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 90000,
    })
    .then((r) => r.data);
};

export const deletePortfolioItem = (id) =>
  client.delete(`/candidate/me/portfolio/${id}`).then((r) => r.data);

/** Employer passive candidate search (opt-in discoverable seekers). */
export const searchTalentPool = (params = {}) =>
  client.get('/candidate/talent-pool', { params: clean(params) }).then((r) => r.data);

export const listResumeVersions = () =>
  client.get('/candidate/me/resumes').then((r) => r.data);

export const createResumeVersion = (data) =>
  client.post('/candidate/me/resumes', data).then((r) => r.data);

export const updateResumeVersion = (id, data) =>
  client.patch(`/candidate/me/resumes/${id}`, data).then((r) => r.data);

export const deleteResumeVersion = (id) =>
  client.delete(`/candidate/me/resumes/${id}`).then((r) => r.data);

/** Server-side PDF from resume_json → { url, resume? }. */
export const generateResumePdf = (data = {}) =>
  client.post('/candidate/me/resume/pdf', data, { timeout: 90000 }).then((r) => r.data);

/** Paid talent-pool boost (wallet). */
export const purchaseTalentBoost = (days) =>
  client.post('/candidate/me/talent-boost', { days }).then((r) => r.data);

// ---- employer profile (agents) ------------------------------------------
export const getMyEmployer = () => client.get('/agents/me').then((r) => r.data);

export const createEmployer = (data) => client.post('/agents', data).then((r) => r.data);

export const updateEmployer = (id, data) => client.put(`/agents/${id}`, data).then((r) => r.data);

/** Public company profile + open roles (no auth). */
export const getCompanyProfile = (agentId) =>
  client.get(`/agents/${agentId}/public`).then((r) => r.data);

/** Discovery rail: companies with open roles. */
export const getHiringCompanies = (params = {}) =>
  client.get('/agents/hiring', { params: clean(params) }).then((r) => r.data);
