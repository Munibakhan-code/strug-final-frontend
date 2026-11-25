// components/freelance/FreelanceOrderForm.jsx
import React, { useState } from 'react';
import i18n from '../../i18n/index.js';
import { useViewport } from '../../hooks/useViewport.js';
import { createFreelanceOrder } from '../../api/freelance-orders.js';
import { bindCheckoutReferralCode, getCheckoutReferralCode } from '../../api/user.js';
import { uploadFreelanceImages } from '../../api/freelance-gig.js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js/pure';
import { getUser } from '../../store/auth.js';

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);

// Warn if key is missing (development helper)
if (!import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY) {
  console.warn('VITE_STRIPE_PUBLISHABLE_KEY is not set in environment variables');
}

// Stripe component for card input
const CardInput = ({ onCardChange }) => {
  const stripe = useStripe();
  const elements = useElements();
  const [cardError, setCardError] = useState('');

  const handleCardChange = (event) => {
    setCardError(event.error ? event.error.message : '');
    onCardChange({ error: event.error, complete: event.complete });
  };

  return (
    <div style={{ marginBottom: 16 }}>
      <label className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, display: "block", marginBottom: 8 }}>
        Card Details
      </label>
      {/* Stripe's CardElement renders inside its own iframe, which cannot read this page's
          CSS custom properties, so its text color below must stay a literal "#fff" — Stripe
          offers no var() passthrough. This wrapper therefore has to stay hardcoded dark too
          (not tokenized), or the fixed-white card-number text would go invisible against a
          near-white surface in light theme. */}
      <div style={{
        background: "rgba(255,255,255,0.05)",
        border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: 12,
        padding: "14px 16px",
      }}>
        <CardElement
          options={{
            style: {
              base: {
                fontSize: '16px',
                color: '#fff',
                '::placeholder': {
                  color: 'rgba(255,255,255,0.3)',
                },
              },
              invalid: {
                color: '#ef4444',
              },
            },
          }}
          onChange={handleCardChange}
        />
      </div>
      {cardError && (
        <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: '#ef4444', marginTop: 6 }}>
          {cardError}
        </p>
      )}
    </div>
  );
};

// Main order form component
const FreelanceOrderFormContent = ({ service, onSubmit, onBack, isMobile, onOrderComplete }) => {
  const [desc, setDesc] = useState("");
  const [files, setFiles] = useState([]);
  const [submitted, setSubmitted] = useState(false);
  const [refCode, setRefCode] = useState("");
  const [refApplied, setRefApplied] = useState(false);
  const [refLoading, setRefLoading] = useState(false);
  const [refError, setRefError] = useState(null);
  const [orderLoading, setOrderLoading] = useState(false);
  const [orderError, setOrderError] = useState(null);
  const [cardComplete, setCardComplete] = useState(false);
  const [cardError, setCardError] = useState(null);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [fileUploadProgress, setFileUploadProgress] = useState(0);
  const [paymentProcessing, setPaymentProcessing] = useState(false);

  const stripe = useStripe();
  const elements = useElements();

  // ✅ FIX: Get authenticated user for billing details
  const currentUser = getUser();

  const handleFileChange = (e) => {
    const selectedFiles = Array.from(e.target.files);
    setFiles(selectedFiles);
  };

  const handleCardChange = ({ error, complete }) => {
    setCardError(error);
    setCardComplete(complete);
  };

  const handleSubmitOrder = async () => {
    if (!desc.trim()) {
      setOrderError(i18n.t("digservices.pleaseDescribe") || "Please describe your project requirements.");
      return;
    }

    if (!stripe || !elements) {
      setOrderError(i18n.t("digservices.stripeNotReady") || "Stripe is not initialized. Please try again.");
      return;
    }

    if (!cardComplete) {
      setOrderError(i18n.t("digservices.enterCardDetails") || "Please enter your card details.");
      return;
    }

    setOrderLoading(true);
    setOrderError(null);
    setUploadingFiles(true);
    setFileUploadProgress(0);

    try {
      const packageType = service.tier || "STANDARD";
      let requirementFiles = [];

      // Upload files to S3 if any
      if (files.length > 0) {
        const fileUrls = [];
        for (let i = 0; i < files.length; i++) {
          const progress = Math.round(((i + 1) / files.length) * 100);
          setFileUploadProgress(progress);
          const res = await uploadFreelanceImages([files[i]]);
          if (res && res.length > 0) {
            fileUrls.push(res[0]);
          }
        }
        requirementFiles = fileUrls;
        setFileUploadProgress(100);
      }

      const orderData = {
        gig_id: service.id,
        package_type: packageType.toUpperCase(),
        requirements: desc.trim(),
        requirement_files: requirementFiles,
        referral_code: (refApplied && refCode.trim()) || getCheckoutReferralCode() || undefined,
      };

      // Step 1: Create the order and get payment intent
      const response = await createFreelanceOrder(orderData);

      if (!response.successful) {
        setOrderError(response.message || i18n.t("digservices.orderFailed") || "Failed to create order. Please try again.");
        setOrderLoading(false);
        setUploadingFiles(false);
        return;
      }

      // ✅ FIX: Only destructure what we need (client_secret is used, order is not)
      const { client_secret } = response.data;

      // Step 2: Confirm the payment with Stripe
      setPaymentProcessing(true);
      setOrderLoading(false);
      setUploadingFiles(false);

      // ✅ FIX: Pass authenticated user's name to billing_details
      const { error: stripeError, paymentIntent } = await stripe.confirmCardPayment(client_secret, {
        payment_method: {
          card: elements.getElement(CardElement),
          billing_details: {
            name: currentUser?.name || currentUser?.username || 'Customer',
            email: currentUser?.email || undefined,
          },
        },
      });

      if (stripeError) {
        console.error('Payment failed:', stripeError);
        setOrderError(stripeError.message || i18n.t("digservices.paymentFailed") || "Payment failed. Please try again.");
        setPaymentProcessing(false);
        return;
      }

      if (paymentIntent.status === 'succeeded') {
        console.log('Payment succeeded!', paymentIntent);
        setSubmitted(true);
        
        // Wait a moment to show success message, then redirect
        setTimeout(() => {
          if (onOrderComplete) {
            onOrderComplete();
          } else if (onSubmit) {
            onSubmit();
          }
        }, 1500);
      } else {
        setOrderError(`${i18n.t("digservices.paymentStatus") || "Payment status"}: ${paymentIntent.status}. ${i18n.t("digservices.contactSupport") || "Please contact support."}`);
        setPaymentProcessing(false);
      }
    } catch (err) {
      console.error("Order creation failed:", err);
      setOrderError(err?.response?.data?.message || i18n.t("digservices.somethingWrong") || "Something went wrong. Please try again.");
      setOrderLoading(false);
      setUploadingFiles(false);
      setPaymentProcessing(false);
    }
  };

  return (
    <div style={{ flex: 1, overflowY: "auto", paddingTop: 32, paddingRight: 40, paddingBottom: 24, paddingLeft: isMobile ? 16 : 108, maxWidth: 680 }}>
      <button
        onClick={onBack}
        className="text-text-secondary"
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          fontFamily: "'DM Sans', sans-serif",
          fontSize: 14,
          marginBottom: 28,
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: 0,
        }}
      >
        ← Back
      </button>

      {submitted ? (
        <div style={{ textAlign: "center", padding: "40px 0" }}>
          <div style={{ marginBottom: 16, fontSize: 48 }}>✓</div>
          <h2 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 28, marginBottom: 8 }}>
            {i18n.t("digservices.paymentSuccess") || "Payment Successful!"}
          </h2>
          <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, lineHeight: 1.6 }}>
            {i18n.t("digservices.orderConfirmed") || "Your order has been placed and payment confirmed. The freelancer will start working on it shortly."}
          </p>
          <p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, marginTop: 8 }}>
            {i18n.t("digservices.redirecting") || "Redirecting to your orders..."}
          </p>
        </div>
      ) : (
        <>
          <h2 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 28, marginBottom: 6 }}>
            {i18n.t("digservices.tellUsNeed")}
          </h2>
          <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, marginBottom: 28 }}>
            {i18n.t("digservices.shareRequirements") || "Share your requirements to get started."}
          </p>

          <div
            className="bg-surface-raised border border-border-subtle"
            style={{
              borderRadius: 14,
              padding: "20px",
              marginBottom: 20,
            }}
          >
            <p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 16, marginBottom: 4 }}>
              {service.title}
            </p>
            <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14 }}>
              {service.freelancer_profile?.display_name || "Freelancer"} · ${service.price} · {service.deliveryDays}-day delivery
            </p>
          </div>

          <label className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, display: "block", marginBottom: 8 }}>
            {i18n.t("digservices.describeProject")}
          </label>
          <textarea
            value={desc}
            onChange={e => setDesc(e.target.value)}
            rows={6}
            placeholder={i18n.t("digservices.describeProjectPlaceholder")}
            className="bg-surface-raised border border-border text-text-primary"
            style={{
              width: "100%",
              boxSizing: "border-box",
              borderRadius: 12,
              padding: "14px 16px",
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 14,
              resize: "vertical",
              outline: "none",
              marginBottom: 20,
            }}
          />

          <div
            style={{
              border: "2px dashed var(--color-border)",
              borderRadius: 12,
              padding: "24px",
              textAlign: "center",
              marginBottom: 24,
              cursor: "pointer",
              transition: "border-color 0.15s",
            }}
            onMouseEnter={e => e.currentTarget.style.borderColor = "color-mix(in srgb, var(--color-text-primary) 22%, transparent)"}
            onMouseLeave={e => e.currentTarget.style.borderColor = "var(--color-border)"}
            onClick={() => document.getElementById('file-upload-input').click()}
          >
            <input
              id="file-upload-input"
              type="file"
              multiple
              onChange={handleFileChange}
              style={{ display: "none" }}
            />
            <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>
              {files.length > 0 ? `📎 ${files.length} file${files.length > 1 ? 's' : ''} selected` : "+ Attach files (optional)"}
            </p>
            {uploadingFiles && (
              <div style={{ marginTop: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span className="text-text-secondary" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>
                    {i18n.t("digservices.uploadingFiles") || "Uploading files..."}
                  </span>
                  <span style={{ fontSize: 12, color: '#60a5fa', fontFamily: "'DM Sans', sans-serif", fontWeight: 600 }}>
                    {fileUploadProgress}%
                  </span>
                </div>
                <div className="bg-border" style={{ height: 4, borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${fileUploadProgress}%`, background: '#2563eb', borderRadius: 4, transition: 'width 0.3s ease' }} />
                </div>
              </div>
            )}
            {files.length > 0 && !uploadingFiles && (
              <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
                {files.map((file, idx) => (
                  <span
                    key={idx}
                    className="bg-surface-raised text-text-secondary"
                    style={{
                      padding: '4px 10px',
                      borderRadius: 6,
                      fontSize: 11,
                      fontFamily: "'DM Sans', sans-serif",
                    }}
                  >
                    {file.name}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Stripe Card Element */}
          <CardInput onCardChange={handleCardChange} />

          <div style={{ marginBottom: 20 }}>
            <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, marginBottom: 8 }}>
              {i18n.t("digservices.referralOptional")}
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={refCode}
                onChange={e => { setRefCode(e.target.value); setRefApplied(false); setRefError(null); }}
                placeholder={i18n.t("discounts.enterCode")}
                className="bg-surface-raised border border-border text-text-primary"
                style={{
                  flex: 1,
                  borderRadius: 9,
                  padding: "9px 12px",
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 13,
                  outline: "none",
                }}
              />
              <button
                onClick={async () => {
                  if (!refCode.trim() || refLoading || refApplied) return;
                  setRefLoading(true);
                  setRefError(null);
                  try {
                    await bindCheckoutReferralCode(refCode.trim());
                    setRefApplied(true);
                  } catch (e) {
                    setRefError(e?.response?.data?.message || "Invalid referral code.");
                  } finally {
                    setRefLoading(false);
                  }
                }}
                style={{
                  padding: "9px 14px",
                  background: refApplied ? "rgba(16,185,129,0.15)" : "rgba(37,99,235,0.15)",
                  border: `1px solid ${refApplied ? "rgba(16,185,129,0.35)" : "rgba(37,99,235,0.3)"}`,
                  borderRadius: 9,
                  fontFamily: "'DM Sans', sans-serif",
                  fontWeight: 700,
                  fontSize: 13,
                  color: refApplied ? "#10b981" : "#2563eb",
                  cursor: refLoading ? "default" : "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {refLoading ? "…" : refApplied ? "✓ Applied" : "Apply"}
              </button>
            </div>
            {refError && <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#f87171", marginTop: 6 }}>{refError}</p>}
          </div>

          {orderError && (
            <div
              style={{
                background: "rgba(239,68,68,0.1)",
                border: "1px solid rgba(239,68,68,0.25)",
                borderRadius: 10,
                padding: "10px 14px",
                marginBottom: 16,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "#f87171" }}>{orderError}</span>
            </div>
          )}

          <button
            onClick={handleSubmitOrder}
            disabled={orderLoading || !desc.trim() || !cardComplete || uploadingFiles || !stripe || paymentProcessing}
            style={{
              width: "100%",
              padding: "14px 32px",
              background: (orderLoading || paymentProcessing) ? "#059669" : "#2563eb",
              border: "none",
              borderRadius: 12,
              fontFamily: "'DM Sans', sans-serif",
              fontWeight: 700,
              fontSize: 15,
              color: "#fff",
              cursor: (orderLoading || !desc.trim() || !cardComplete || uploadingFiles || !stripe || paymentProcessing) ? "default" : "pointer",
              transition: "background 0.2s",
              opacity: (orderLoading || !desc.trim() || !cardComplete || uploadingFiles || !stripe || paymentProcessing) ? 0.7 : 1,
            }}
          >
            {paymentProcessing 
              ? (i18n.t("digservices.processingPayment") || "Processing Payment...") 
              : orderLoading 
                ? (i18n.t("digservices.creatingOrder") || "Creating Order...") 
                : uploadingFiles 
                  ? `${i18n.t("digservices.uploadingFiles") || "Uploading files"} ${fileUploadProgress}%...` 
                  : !stripe 
                    ? (i18n.t("digservices.loadingPayment") || "Loading payment...") 
                    : `${i18n.t("digservices.pay") || "Pay"} $${service.price}`
            }
          </button>
          {paymentProcessing && (
            <p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, textAlign: "center", marginTop: 8 }}>
              {i18n.t("digservices.waitHint") || "Please wait while we process your payment..."}
            </p>
          )}
        </>
      )}
    </div>
  );
};

// Wrapper component that provides Stripe Elements (exported as default)
export default function FreelanceOrderForm(props) {
  return (
    <Elements stripe={stripePromise}>
      <FreelanceOrderFormContent {...props} />
    </Elements>
  );
}