import client from './client';


// Get reviews for a specific gig
export const getFreelanceReviews = (gigId) =>
  console.log(`Fetching reviews for gig ID: ${gigId}`) ||
  client.get(`/freelance-reviews/gig/${gigId}`).then(r => r.data);

export const getFreelancerReviews = (freelancerProfileId) =>
  client.get(`/freelance-reviews/freelancer/${freelancerProfileId}`).then(r => r.data);