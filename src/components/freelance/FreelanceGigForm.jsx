// components/freelance/FreelanceGigForm.jsx
import React, { useState, useEffect, useCallback, useId } from 'react';
import { useViewport } from '../../hooks/useViewport.js';
import { getFreelanceCategories, getFreelanceSubcategories } from '../../api/freelancer-categories.js';
import { createFreelanceGig, updateFreelanceGig, uploadFreelanceImages } from '../../api/freelance-gig.js';

export const FreelanceGigForm = ({ gig, color = "#2563eb", onClose, onSave }) => {
  const { isMobile } = useViewport();
  const uid = useId();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [categories, setCategories] = useState([]);
  const [subcategories, setSubcategories] = useState([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [uploadingImages, setUploadingImages] = useState(false);
  const [imageUploadProgress, setImageUploadProgress] = useState(0);
  const fileInputRef = React.useRef(null);

  const [form, setForm] = useState({
    category_id: '',
    subcategory_id: '',
    title: '',
    description: '',
    images: [],
    packages: [
      { package_type: 'BASIC', title: 'Basic', description: '', price: '', delivery_days: '', revisions: '', features: [] },
      { package_type: 'STANDARD', title: 'Standard', description: '', price: '', delivery_days: '', revisions: '', features: [] },
      { package_type: 'PREMIUM', title: 'Premium', description: '', price: '', delivery_days: '', revisions: '', features: [] },
    ],
  });

  // Both loaders are declared before the effects that call them — the effects used to reference
  // these bindings from inside their temporal dead zone.
  const loadCategories = useCallback(async () => {
    setCategoriesLoading(true);
    try {
      const res = await getFreelanceCategories();
      if (res.successful && res.data) {
        setCategories(res.data);
      }
    } catch (err) {
      console.error('Failed to load categories:', err);
    }
    setCategoriesLoading(false);
  }, []);

  const loadSubcategories = useCallback(async (categoryId) => {
    if (!categoryId) {
      setSubcategories([]);
      return;
    }
    try {
      const res = await getFreelanceSubcategories(categoryId);
      if (res.successful && res.data) {
        setSubcategories(res.data);
      } else {
        setSubcategories([]);
      }
    } catch (err) {
      console.error('Failed to load subcategories:', err);
      setSubcategories([]);
    }
  }, []);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  useEffect(() => {
    if (gig) {
      const category = categories.find(c => c.name === gig.Freelance_Category);
      const subcategory = subcategories.find(s => s.name === gig.Freelance_SubCategory);
      setSelectedCategoryId(category ? String(category.id) : '');
      setForm({
        category_id: category ? String(category.id) : '',
        subcategory_id: subcategory ? String(subcategory.id) : '',
        title: gig.title || '',
        description: gig.description || '',
        images: gig.images || [],
        packages: gig.packages || [
          { package_type: 'BASIC', title: 'Basic', description: '', price: '', delivery_days: '', revisions: '', features: [] },
          { package_type: 'STANDARD', title: 'Standard', description: '', price: '', delivery_days: '', revisions: '', features: [] },
          { package_type: 'PREMIUM', title: 'Premium', description: '', price: '', delivery_days: '', revisions: '', features: [] },
        ],
      });
      if (category) {
        loadSubcategories(category.id);
      }
    }
  }, [gig, categories, subcategories, loadSubcategories]);

  const handleCategoryChange = (categoryId) => {
    setSelectedCategoryId(categoryId);
    setForm(prev => ({ ...prev, category_id: categoryId, subcategory_id: '' }));
    loadSubcategories(categoryId);
  };

  const handleImageUpload = async (files) => {
    if (!files || files.length === 0) return;
    setUploadingImages(true);
    setImageUploadProgress(0);
    try {
      const urls = [];
      const fileArray = Array.from(files);
      for (let i = 0; i < fileArray.length; i++) {
        const progress = Math.round(((i + 1) / fileArray.length) * 100);
        setImageUploadProgress(progress);
        const res = await uploadFreelanceImages([fileArray[i]]);
        if (res && res.length > 0) {
          urls.push(res[0]);
        }
      }
      setForm(prev => ({ ...prev, images: [...prev.images, ...urls] }));
      setImageUploadProgress(100);
      setTimeout(() => setImageUploadProgress(0), 1000);
    } catch (err) {
      setError('Failed to upload images. Please try again.');
    }
    setUploadingImages(false);
  };

  const removeImage = (index) => {
    setForm(prev => ({ ...prev, images: prev.images.filter((_, i) => i !== index) }));
  };

  const updatePackage = (index, field, value) => {
    if (field === 'package_type' || field === 'title') return;
    setForm(prev => ({
      ...prev,
      packages: prev.packages.map((pkg, i) => i === index ? { ...pkg, [field]: value } : pkg),
    }));
  };

  const addFeature = (pkgIndex, feature) => {
    if (!feature.trim()) return;
    setForm(prev => ({
      ...prev,
      packages: prev.packages.map((pkg, i) =>
        i === pkgIndex ? { ...pkg, features: [...pkg.features, feature.trim()] } : pkg
      ),
    }));
  };

  const removeFeature = (pkgIndex, featureIndex) => {
    setForm(prev => ({
      ...prev,
      packages: prev.packages.map((pkg, i) =>
        i === pkgIndex ? { ...pkg, features: pkg.features.filter((_, fi) => fi !== featureIndex) } : pkg
      ),
    }));
  };

  const handleSubmit = async () => {
    if (!form.category_id) { setError('Please select a category.'); return; }
    if (!form.subcategory_id) { setError('Please select a subcategory.'); return; }
    if (!form.title.trim()) { setError('Title is required.'); return; }
    if (!form.description.trim()) { setError('Description is required.'); return; }

    for (const pkg of form.packages) {
      if (!pkg.price || parseFloat(pkg.price) <= 0) {
        setError(`Package "${pkg.title}" needs a valid price.`);
        return;
      }
      if (!pkg.delivery_days || parseInt(pkg.delivery_days) <= 0) {
        setError(`Package "${pkg.title}" needs valid delivery days.`);
        return;
      }
      if (pkg.features.length === 0) {
        setError(`Package "${pkg.title}" needs at least 1 feature.`);
        return;
      }
    }

    setLoading(true);
    setError('');

    try {
      const selectedCategory = categories.find(c => String(c.id) === String(form.category_id));
      const selectedSubcategory = subcategories.find(s => String(s.id) === String(form.subcategory_id));

      const payload = {
        category: selectedCategory?.name || '',
        subcategory: selectedSubcategory?.name || '',
        title: form.title,
        description: form.description,
        images: form.images,
        packages: form.packages.map(pkg => ({
          ...pkg,
          price: parseFloat(pkg.price),
          delivery_days: parseInt(pkg.delivery_days),
          revisions: parseInt(pkg.revisions) || 0,
        })),
      };

      let result;
      if (gig) {
        const changedFields = {};
        const original = gig;
        if (payload.category !== original.Freelance_Category) changedFields.category = payload.category;
        if (payload.subcategory !== original.Freelance_SubCategory) changedFields.subcategory = payload.subcategory;
        if (payload.title !== original.title) changedFields.title = payload.title;
        if (payload.description !== original.description) changedFields.description = payload.description;
        if (JSON.stringify(payload.images) !== JSON.stringify(original.images)) changedFields.images = payload.images;
        if (JSON.stringify(payload.packages) !== JSON.stringify(original.packages)) changedFields.packages = payload.packages;

        if (Object.keys(changedFields).length > 0) {
          result = await updateFreelanceGig(gig.id, changedFields);
          if (result.successful) {
            onSave({ ...gig, ...result.data });
          }
        } else {
          onSave(gig);
        }
      } else {
        result = await createFreelanceGig(payload);
        if (result.successful) {
          onSave(result.data);
        }
      }
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to save gig.');
    }
    setLoading(false);
  };

  const inputStyle = {
    width: '100%',
    padding: '10px 14px',
    background: 'var(--color-surface-raised)',
    border: '1px solid var(--color-border)',
    borderRadius: 10,
    color: 'var(--color-text-primary)',
    fontFamily: "'DM Sans', sans-serif",
    fontSize: 13,
    outline: 'none',
    boxSizing: 'border-box',
  };

  return (
    <div
      // Modal backdrop scrim — stays a fixed dark overlay in both themes (matches every
      // other modal in the app, e.g. Account.jsx, SellerDashboards.jsx), since its job is
      // to dim the page behind the dialog, not to act as a themed surface.
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={(e) => { if (e.target === e.currentTarget && !loading) onClose(); }}
    >
      <div className="bg-surface border border-border" style={{ borderRadius: 20, padding: isMobile ? '20px' : '32px', width: 'min(720px, 100%)', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 22, textTransform: 'uppercase', letterSpacing: '0.04em', margin: 0 }}>
            {gig ? 'Edit Gig' : 'Create Gig'}
          </h3>
          <button onClick={onClose} className="text-text-secondary" style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        {error && <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: '#f87171', marginBottom: 14 }}>{error}</p>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
            <div>
              <label htmlFor={`${uid}-category`} className="text-text-secondary" style={{ fontSize: 11, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", display: 'block', marginBottom: 4 }}>Category *</label>
              <select
                id={`${uid}-category`}
                value={form.category_id}
                onChange={(e) => handleCategoryChange(e.target.value)}
                style={{ ...inputStyle, appearance: 'none' }}
              >
                <option value="">Select a category</option>
                {categories.map(cat => (
                  <option key={cat.id} value={String(cat.id)}>{cat.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor={`${uid}-subcategory`} className="text-text-secondary" style={{ fontSize: 11, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", display: 'block', marginBottom: 4 }}>Subcategory *</label>
              <select
                id={`${uid}-subcategory`}
                value={form.subcategory_id}
                onChange={(e) => setForm(prev => ({ ...prev, subcategory_id: e.target.value }))}
                style={{ ...inputStyle, appearance: 'none' }}
                disabled={!selectedCategoryId || subcategories.length === 0}
              >
                <option value="">{!selectedCategoryId ? 'Select a category first' : 'Select a subcategory'}</option>
                {subcategories.map(sub => (
                  <option key={sub.id} value={String(sub.id)}>{sub.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label htmlFor={`${uid}-title`} className="text-text-secondary" style={{ fontSize: 11, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", display: 'block', marginBottom: 4 }}>Title *</label>
            <input
              id={`${uid}-title`}
              value={form.title}
              onChange={(e) => setForm(prev => ({ ...prev, title: e.target.value }))}
              placeholder="e.g. I will build a modern full stack MERN web application"
              style={inputStyle}
            />
          </div>

          <div>
            <label htmlFor={`${uid}-description`} className="text-text-secondary" style={{ fontSize: 11, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", display: 'block', marginBottom: 4 }}>Description *</label>
            <textarea
              id={`${uid}-description`}
              value={form.description}
              onChange={(e) => setForm(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Describe your gig in detail..."
              rows={3}
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </div>

          {/* Updated Image Upload Section */}
          <div>
            <label htmlFor={`${uid}-images`} className="text-text-secondary" style={{ fontSize: 11, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", display: 'block', marginBottom: 4 }}>Images</label>
            
            {/* Upload Area */}
            <div
              onClick={() => fileInputRef.current?.click()}
              style={{
                width: '100%',
                padding: '24px 20px',
                background: 'var(--color-surface)',
                border: `2px dashed ${uploadingImages ? color : 'var(--color-border)'}`,
                borderRadius: 12,
                cursor: uploadingImages ? 'default' : 'pointer',
                textAlign: 'center',
                transition: 'all 0.2s ease',
                position: 'relative',
              }}
              onMouseEnter={(e) => {
                if (!uploadingImages) {
                  e.currentTarget.style.borderColor = color;
                  e.currentTarget.style.background = 'var(--color-surface-raised)';
                }
              }}
              onMouseLeave={(e) => {
                if (!uploadingImages) {
                  e.currentTarget.style.borderColor = 'var(--color-border)';
                  e.currentTarget.style.background = 'var(--color-surface)';
                }
              }}
            >
              <input
                id={`${uid}-images`}
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                style={{ display: 'none' }}
                onChange={(e) => handleImageUpload(e.target.files)}
                disabled={uploadingImages}
              />
              
              {uploadingImages ? (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span className="text-text-secondary" style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>
                      Uploading images...
                    </span>
                    <span style={{ fontSize: 12, color: color, fontFamily: "'DM Sans', sans-serif", fontWeight: 600 }}>
                      {imageUploadProgress}%
                    </span>
                  </div>
                  <div className="bg-border" style={{ height: 4, borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${imageUploadProgress}%`, background: color, borderRadius: 4, transition: 'width 0.3s ease' }} />
                  </div>
                </div>
              ) : (
                <>
                  <svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 8 }}>
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <polyline points="21 15 16 10 5 21" />
                  </svg>
                  <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, marginBottom: 2 }}>
                    Click to upload images
                  </p>
                  <p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11 }}>
                    PNG, JPG, WEBP · Max 5MB each
                  </p>
                </>
              )}
            </div>

            {/* Image Gallery */}
            {form.images.length > 0 && (
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: isMobile ? 'repeat(3, 1fr)' : 'repeat(4, 1fr)', 
                gap: 10, 
                marginTop: 12 
              }}>
                {form.images.map((url, idx) => (
                  <div
                    key={idx}
                    className="border border-border-subtle bg-surface"
                    style={{
                      position: 'relative',
                      aspectRatio: '1/1',
                      borderRadius: 10,
                      overflow: 'hidden',
                    }}
                  >
                    <img
                      src={url} 
                      alt={`Gig ${idx + 1}`} 
                      style={{ 
                        width: '100%', 
                        height: '100%', 
                        objectFit: 'cover',
                      }} 
                    />
                    {/* Remove button and caption scrim sit directly on top of the uploaded photo
                        thumbnail, so they stay a fixed dark overlay in both themes — same
                        reasoning as Hub.jsx's hero photo scrim. */}
                    <button
                      onClick={() => removeImage(idx)}
                      style={{
                        position: 'absolute',
                        top: 6,
                        right: 6,
                        background: 'rgba(0,0,0,0.7)',
                        backdropFilter: 'blur(4px)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '50%', 
                        width: 24, 
                        height: 24, 
                        color: '#fff', 
                        fontSize: 12, 
                        cursor: 'pointer', 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center',
                        transition: 'all 0.15s ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(239,68,68,0.8)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'rgba(0,0,0,0.7)';
                      }}
                    >
                      ×
                    </button>
                    <div style={{ 
                      position: 'absolute', 
                      bottom: 0, 
                      left: 0, 
                      right: 0, 
                      padding: '4px 8px',
                      background: 'linear-gradient(transparent, rgba(0,0,0,0.6))',
                    }}>
                      <span style={{ 
                        fontFamily: "'DM Sans', sans-serif", 
                        fontSize: 10, 
                        color: 'rgba(255,255,255,0.6)',
                      }}>
                        #{idx + 1}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div role="group" aria-labelledby={`${uid}-packages`}>
            <label id={`${uid}-packages`} className="text-text-secondary" style={{ fontSize: 11, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", display: 'block', marginBottom: 8 }}>Packages *</label>
            {form.packages.map((pkg, pkgIdx) => (
              <div key={pkgIdx} className="bg-surface border border-border-subtle" style={{ borderRadius: 12, padding: '14px 16px', marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <span className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 16 }}>
                    {pkg.package_type.charAt(0).toUpperCase() + pkg.package_type.slice(1).toLowerCase()}
                  </span>
                  <span className="text-text-muted" style={{ fontSize: 11, fontFamily: "'DM Sans', sans-serif" }}>{pkgIdx + 1}/3</span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 8 }}>
                  <input value={pkg.title} disabled style={{ ...inputStyle, background: 'var(--color-surface)', border: '1px solid var(--color-border-subtle)', color: 'var(--color-text-secondary)', cursor: 'not-allowed' }} />
                  <input
                    value={pkg.description}
                    onChange={(e) => updatePackage(pkgIdx, 'description', e.target.value)}
                    placeholder="Description *"
                    style={inputStyle}
                  />
                  <input
                    type="number"
                    value={pkg.price}
                    onChange={(e) => updatePackage(pkgIdx, 'price', e.target.value)}
                    placeholder="Price ($) *"
                    style={inputStyle}
                  />
                  <input
                    type="number"
                    value={pkg.delivery_days}
                    onChange={(e) => updatePackage(pkgIdx, 'delivery_days', e.target.value)}
                    placeholder="Delivery days *"
                    style={inputStyle}
                  />
                  <input
                    type="number"
                    value={pkg.revisions}
                    onChange={(e) => updatePackage(pkgIdx, 'revisions', e.target.value)}
                    placeholder="Revisions *"
                    style={inputStyle}
                  />
                </div>

                <div style={{ marginTop: 8 }}>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
                    {pkg.features.map((feature, featIdx) => (
                      <span key={featIdx} className="bg-surface-raised border border-border-subtle text-text-secondary" style={{ padding: '3px 10px', borderRadius: 6, fontSize: 11, fontFamily: "'DM Sans', sans-serif", display: 'flex', alignItems: 'center', gap: 4 }}>
                        {feature}
                        <button onClick={() => removeFeature(pkgIdx, featIdx)} className="text-text-muted" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', fontSize: 10 }}>×</button>
                      </span>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      placeholder="Add feature *"
                      className="bg-surface-raised border border-border-subtle text-text-primary"
                      style={{ flex: 1, padding: '6px 10px', borderRadius: 6, fontFamily: "'DM Sans', sans-serif", fontSize: 11, outline: 'none' }}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addFeature(pkgIdx, e.target.value); e.target.value = ''; } }}
                    />
                    <button onClick={(e) => { const input = e.currentTarget.previousSibling; addFeature(pkgIdx, input.value); input.value = ''; }} style={{ padding: '6px 12px', background: `${color}22`, border: `1px solid ${color}44`, borderRadius: 6, color: color, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Add</button>
                  </div>
                  {pkg.features.length === 0 && <p style={{ fontSize: 10, color: '#f87171', fontFamily: "'DM Sans', sans-serif", marginTop: 4 }}>At least 1 feature required</p>}
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <button
              onClick={handleSubmit}
              disabled={loading}
              style={{ flex: 1, padding: '12px', background: color, border: 'none', borderRadius: 12, color: '#fff', fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.7 : 1 }}
            >
              {loading ? 'Saving...' : (gig ? 'Update Gig' : 'Create Gig')}
            </button>
            <button onClick={onClose} className="bg-surface-raised border border-border-subtle text-text-secondary" style={{ padding: '12px 20px', borderRadius: 12, fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
};