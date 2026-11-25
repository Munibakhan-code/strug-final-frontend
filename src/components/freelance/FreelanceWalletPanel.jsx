// components/freelance/FreelanceWalletPanel.jsx
import React, { useState, useEffect, useCallback, useId } from 'react';
import { getFreelanceWallet, getFreelanceWalletTransactions, createWithdrawalRequest, getWithdrawalRequests } from '../../api/freelance-wallet.js';

export const FreelanceWalletPanel = ({ color = "#2563eb" }) => {
  const uid = useId();
  const [wallet, setWallet] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [withdrawForm, setWithdrawForm] = useState({ amount: '', method: 'bank', account_title: '', account_number: '' });
  const [withdrawLoading, setWithdrawLoading] = useState(false);
  const [withdrawError, setWithdrawError] = useState(null);
  const [withdrawSuccess, setWithdrawSuccess] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');

  // Declared before the mount effect that calls it — the effect used to reference this binding
  // from inside its temporal dead zone.
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [walletRes, txRes, withdrawalRes] = await Promise.all([
        getFreelanceWallet(),
        getFreelanceWalletTransactions({ limit: 20 }),
        getWithdrawalRequests({ limit: 20 })
      ]);

      if (walletRes.successful) setWallet(walletRes.data);
      if (txRes.successful) setTransactions(txRes.data);
      if (withdrawalRes.successful) setWithdrawals(withdrawalRes.data);
    } catch (err) {
      console.error('Failed to load wallet data:', err);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleWithdraw = async () => {
    const amount = parseFloat(withdrawForm.amount);
    if (!amount || amount <= 0) {
      setWithdrawError('Please enter a valid amount.');
      return;
    }
    if (!withdrawForm.account_title.trim() || !withdrawForm.account_number.trim()) {
      setWithdrawError('Please fill in all account details.');
      return;
    }
    if (amount > (wallet?.available_balance || 0)) {
      setWithdrawError('Insufficient available balance.');
      return;
    }

    setWithdrawLoading(true);
    setWithdrawError(null);
    try {
      const res = await createWithdrawalRequest({
        amount,
        method: withdrawForm.method,
        account_title: withdrawForm.account_title.trim(),
        account_number: withdrawForm.account_number.trim(),
      });
      if (res.successful) {
        setWithdrawSuccess(true);
        setWithdrawForm({ amount: '', method: 'bank', account_title: '', account_number: '' });
        setTimeout(() => setWithdrawSuccess(false), 5000);
        loadData();
        setShowWithdraw(false);
      } else {
        setWithdrawError(res.message || 'Failed to create withdrawal request.');
      }
    } catch (err) {
      setWithdrawError(err?.response?.data?.message || 'Something went wrong.');
    }
    setWithdrawLoading(false);
  };

  const formatCurrency = (amount) => {
    return `$${parseFloat(amount || 0).toFixed(2)} USD`;
  };

  const getStatusColor = (status) => {
    const colors = {
      PENDING: '#f59e0b',
      AVAILABLE: '#22c55e',
      WITHDRAWN: '#60a5fa',
      APPROVED: '#22c55e',
      REJECTED: '#ef4444',
      PAID: '#60a5fa'
    };
    return colors[status] || 'var(--color-text-muted)';
  };

  const getStatusLabel = (status) => {
    const map = {
      PENDING: 'Pending',
      AVAILABLE: 'Available',
      WITHDRAWN: 'Withdrawn',
      APPROVED: 'Approved',
      REJECTED: 'Rejected',
      PAID: 'Paid'
    };
    return map[status] || status;
  };

  const getTransactionType = (type) => {
    return type === 'ORDER' ? 'Earning' : 'Withdrawal';
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 0' }}>
        <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>
          Loading wallet...
        </p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 720 }}>
      {/* Balance Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
        <div className="bg-surface border border-border-subtle" style={{ borderRadius: 14, padding: '18px 20px' }}>
          <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
            Available Balance
          </p>
          <p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 28, color: '#22c55e' }}>
            {formatCurrency(wallet?.available_balance || 0)}
          </p>
        </div>
        <div className="bg-surface border border-border-subtle" style={{ borderRadius: 14, padding: '18px 20px' }}>
          <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
            Pending Balance
          </p>
          <p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 28, color: '#f59e0b' }}>
            {formatCurrency(wallet?.pending_balance || 0)}
          </p>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
        <div className="bg-surface border border-border-subtle" style={{ borderRadius: 14, padding: '14px 18px' }}>
          <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>
            Total Earned
          </p>
          <p className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 20 }}>
            {formatCurrency(wallet?.total_earned || 0)}
          </p>
        </div>
        <div className="bg-surface border border-border-subtle" style={{ borderRadius: 14, padding: '14px 18px' }}>
          <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>
            Total Withdrawn
          </p>
          <p className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 20 }}>
            {formatCurrency(wallet?.total_withdrawn || 0)}
          </p>
        </div>
      </div>

      {/* Withdraw Button */}
      <button
        onClick={() => setShowWithdraw(true)}
        disabled={(wallet?.available_balance || 0) <= 0}
        style={{
          width: '100%',
          padding: '12px',
          // Disabled state was fixed rgba(255,255,255,0.06)/0.3 — that near-transparent bg and
          // faint text both go illegible once the page behind it is light-themed.
          background: (wallet?.available_balance || 0) > 0 ? color : 'var(--color-surface-raised)',
          border: 'none',
          borderRadius: 12,
          color: (wallet?.available_balance || 0) > 0 ? '#fff' : 'var(--color-text-muted)',
          fontFamily: "'DM Sans', sans-serif",
          fontWeight: 700,
          fontSize: 14,
          cursor: (wallet?.available_balance || 0) > 0 ? 'pointer' : 'default',
          marginBottom: 20,
        }}
      >
        {withdrawSuccess ? '✓ Withdrawal Requested!' : (wallet?.available_balance || 0) > 0 ? 'Withdraw Funds' : 'No Available Balance'}
      </button>

      {/* Withdraw Form Modal */}
      {showWithdraw && (
        <div
          // Modal backdrop scrim — stays a fixed dark overlay in both themes (matches every
          // other modal in the app), since its job is to dim the page, not act as a surface.
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowWithdraw(false); }}
        >
          <div className="bg-surface border border-border" style={{ borderRadius: 20, padding: '28px 32px', width: 'min(440px, 100%)', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 22, textTransform: 'uppercase', letterSpacing: '0.04em', margin: 0 }}>
                Withdraw Funds
              </h3>
              <button onClick={() => setShowWithdraw(false)} className="text-text-secondary" style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>×</button>
            </div>

            <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, marginBottom: 20 }}>
              Available: {formatCurrency(wallet?.available_balance || 0)}
            </p>

            {withdrawError && (
              <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 10, padding: '10px 14px', marginBottom: 16 }}>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: '#f87171' }}>{withdrawError}</p>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label htmlFor={`${uid}-amount`} className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 4 }}>
                  Amount (USD)
                </label>
                <input
                  id={`${uid}-amount`}
                  type="number"
                  min="0"
                  step="0.01"
                  value={withdrawForm.amount}
                  onChange={e => setWithdrawForm(prev => ({ ...prev, amount: e.target.value }))}
                  placeholder="0.00"
                  className="bg-surface-raised border border-border text-text-primary"
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: 10,
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: 13,
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div>
                <label htmlFor={`${uid}-method`} className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 4 }}>
                  Withdrawal Method
                </label>
                <select
                  id={`${uid}-method`}
                  value={withdrawForm.method}
                  onChange={e => setWithdrawForm(prev => ({ ...prev, method: e.target.value }))}
                  className="bg-surface-raised border border-border text-text-primary"
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: 10,
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: 13,
                    outline: 'none',
                    appearance: 'none',
                  }}
                >
                  <option value="bank">Bank Transfer</option>
                  <option value="paypal">PayPal</option>
                  <option value="stripe">Stripe</option>
                </select>
              </div>

              <div>
                <label htmlFor={`${uid}-account-title`} className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 4 }}>
                  Account Title
                </label>
                <input
                  id={`${uid}-account-title`}
                  value={withdrawForm.account_title}
                  onChange={e => setWithdrawForm(prev => ({ ...prev, account_title: e.target.value }))}
                  placeholder="John Doe"
                  className="bg-surface-raised border border-border text-text-primary"
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: 10,
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: 13,
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div>
                <label htmlFor={`${uid}-account-number`} className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 4 }}>
                  Account Number
                </label>
                <input
                  id={`${uid}-account-number`}
                  value={withdrawForm.account_number}
                  onChange={e => setWithdrawForm(prev => ({ ...prev, account_number: e.target.value }))}
                  placeholder="123456789"
                  className="bg-surface-raised border border-border text-text-primary"
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: 10,
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: 13,
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <button
                onClick={handleWithdraw}
                disabled={withdrawLoading || !withdrawForm.amount || parseFloat(withdrawForm.amount) <= 0}
                style={{
                  width: '100%',
                  padding: '12px',
                  background: color,
                  border: 'none',
                  borderRadius: 12,
                  color: '#fff',
                  fontFamily: "'DM Sans', sans-serif",
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: withdrawLoading ? 'default' : 'pointer',
                  opacity: withdrawLoading || !withdrawForm.amount || parseFloat(withdrawForm.amount) <= 0 ? 0.6 : 1,
                  marginTop: 4,
                }}
              >
                {withdrawLoading ? 'Processing...' : 'Submit Withdrawal Request'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Transactions & Withdrawals Tabs */}
      <div style={{ marginTop: 24 }}>
        <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--color-border-subtle)', marginBottom: 16 }}>
          <button
            onClick={() => setActiveTab('overview')}
            className={activeTab === 'overview' ? 'text-text-primary' : 'text-text-muted'}
            style={{
              padding: '8px 16px',
              background: activeTab === 'overview' ? 'var(--color-surface-raised)' : 'none',
              border: 'none',
              borderBottom: activeTab === 'overview' ? `2px solid ${color}` : '2px solid transparent',
              // Both states were fixed white/rgba(255,255,255,0.4) — the idle tab's text went
              // near-invisible once its transparent background sits on a light-themed page.
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Transactions
          </button>
          <button
            onClick={() => setActiveTab('withdrawals')}
            className={activeTab === 'withdrawals' ? 'text-text-primary' : 'text-text-muted'}
            style={{
              padding: '8px 16px',
              background: activeTab === 'withdrawals' ? 'var(--color-surface-raised)' : 'none',
              border: 'none',
              borderBottom: activeTab === 'withdrawals' ? `2px solid ${color}` : '2px solid transparent',
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Withdrawal History
          </button>
        </div>

        {activeTab === 'overview' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {transactions.length === 0 ? (
              <p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, textAlign: 'center', padding: '20px 0' }}>
                No transactions yet.
              </p>
            ) : (
              transactions.map((tx) => (
                <div key={tx.id} className="bg-surface border border-border-subtle" style={{ borderRadius: 10, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600 }}>
                      {getTransactionType(tx.type)}
                    </p>
                    <p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11 }}>
                      {tx.order?.gig?.title || tx.created_at ? new Date(tx.created_at).toLocaleDateString() : ''}
                    </p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 700, color: tx.type === 'ORDER' ? '#22c55e' : '#ef4444' }}>
                      {tx.type === 'ORDER' ? '+' : '-'}{formatCurrency(tx.amount)}
                    </p>
                    <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, fontWeight: 600, color: getStatusColor(tx.status), padding: '2px 8px', borderRadius: 4, background: getStatusColor(tx.status) + '22' }}>
                      {getStatusLabel(tx.status)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {withdrawals.length === 0 ? (
              <p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, textAlign: 'center', padding: '20px 0' }}>
                No withdrawal requests yet.
              </p>
            ) : (
              withdrawals.map((w) => (
                <div key={w.id} className="bg-surface border border-border-subtle" style={{ borderRadius: 10, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600 }}>
                      {w.method} - {w.account_title}
                    </p>
                    <p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11 }}>
                      {new Date(w.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 700, color: '#ef4444' }}>
                      -{formatCurrency(w.amount)}
                    </p>
                    <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, fontWeight: 600, color: getStatusColor(w.status), padding: '2px 8px', borderRadius: 4, background: getStatusColor(w.status) + '22' }}>
                      {getStatusLabel(w.status)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};