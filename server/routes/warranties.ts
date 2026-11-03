import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, AuthenticatedRequest } from '../auth.js';
import { calculateExpiryDate, getWarrantyStatus, getRemainingDays } from '../../src/utils/warranty.js';

export const warrantiesRouter = Router();

// Protect all warranty routes
warrantiesRouter.use(requireAuth);

// GET /api/v1/warranties
warrantiesRouter.get('/', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const { search, category, status, sortBy } = req.query;

    const list = await db.getWarranties(userId, {
      search: typeof search === 'string' ? search : undefined,
      category: typeof category === 'string' ? category : undefined,
    });

    // Compute status and remaining days dynamically
    let enriched = list.map(w => {
      const remainingDays = getRemainingDays(w.expiry_date);
      const computedStatus = getWarrantyStatus(w.expiry_date);
      return {
        ...w,
        remaining_days: remainingDays,
        status: computedStatus,
      };
    });

    // Apply status filter if provided
    if (status && typeof status === 'string' && status !== 'all') {
      enriched = enriched.filter(w => w.status === status);
    }

    // Apply sorting
    if (sortBy === 'purchase_date_desc') {
      enriched.sort((a, b) => b.purchase_date.localeCompare(a.purchase_date));
    } else if (sortBy === 'product_name_asc') {
      enriched.sort((a, b) => a.product_name.localeCompare(b.product_name));
    } else if (sortBy === 'created_at_desc') {
      enriched.sort((a, b) => b.created_at.localeCompare(a.created_at));
    } else {
      // Default: expiry date ascending (closest expiry first)
      enriched.sort((a, b) => a.expiry_date.localeCompare(b.expiry_date));
    }

    return res.json({ warranties: enriched });
  } catch (err: any) {
    console.error('[Warranties] GET / error:', err);
    return res.status(500).json({ error: 'Failed to retrieve warranties.' });
  }
});

// GET /api/v1/warranties/:id
warrantiesRouter.get('/:id', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const warranty = await db.getWarrantyById(id, userId);
    if (!warranty) {
      return res.status(404).json({ error: 'Warranty not found or you do not have permission to view it.' });
    }

    const remainingDays = getRemainingDays(warranty.expiry_date);
    const computedStatus = getWarrantyStatus(warranty.expiry_date);

    return res.json({
      warranty: {
        ...warranty,
        remaining_days: remainingDays,
        status: computedStatus,
      },
    });
  } catch (err: any) {
    console.error('[Warranties] GET /:id error:', err);
    return res.status(500).json({ error: 'Failed to retrieve warranty details.' });
  }
});

// POST /api/v1/warranties
warrantiesRouter.post('/', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const {
      product_name,
      brand,
      category,
      model_number,
      serial_number,
      purchase_date,
      purchase_price,
      currency = 'INR',
      warranty_duration_months,
      seller,
      notes,
      document_id,
    } = req.body;

    // Validation
    if (!product_name || typeof product_name !== 'string' || product_name.trim().length === 0) {
      return res.status(400).json({ error: 'Product name is required.' });
    }
    if (!purchase_date || typeof purchase_date !== 'string') {
      return res.status(400).json({ error: 'Valid purchase date (YYYY-MM-DD) is required.' });
    }
    const durationMonths = parseInt(warranty_duration_months, 10);
    if (isNaN(durationMonths) || durationMonths <= 0) {
      return res.status(400).json({ error: 'Warranty duration must be at least 1 month.' });
    }

    // Auto-calculate exact expiry date
    const expiryDate = calculateExpiryDate(purchase_date, durationMonths);

    const price = purchase_price ? parseFloat(purchase_price) : null;

    const newWarranty = await db.createWarranty(userId, {
      product_name: product_name.trim(),
      brand: brand ? String(brand).trim() : null,
      category: category ? String(category).trim() : null,
      model_number: model_number ? String(model_number).trim() : null,
      serial_number: serial_number ? String(serial_number).trim() : null,
      purchase_date,
      purchase_price: price,
      currency: currency || 'INR',
      warranty_duration_months: durationMonths,
      expiry_date: expiryDate,
      seller: seller ? String(seller).trim() : null,
      notes: notes ? String(notes).trim() : null,
    });

    // If an uploaded document ID was passed, link it immediately
    if (document_id && typeof document_id === 'string') {
      await db.linkDocumentToWarranty(document_id, newWarranty.id, userId);
    }

    const remainingDays = getRemainingDays(newWarranty.expiry_date);
    const computedStatus = getWarrantyStatus(newWarranty.expiry_date);

    return res.status(201).json({
      warranty: {
        ...newWarranty,
        remaining_days: remainingDays,
        status: computedStatus,
      },
      message: 'Warranty registered successfully.',
    });
  } catch (err: any) {
    console.error('[Warranties] POST / error:', err);
    return res.status(500).json({ error: 'Failed to create warranty record.' });
  }
});

// PATCH /api/v1/warranties/:id
warrantiesRouter.patch('/:id', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const existing = await db.getWarrantyById(id, userId);
    if (!existing) {
      return res.status(404).json({ error: 'Warranty not found or you do not have permission to edit it.' });
    }

    const {
      product_name,
      brand,
      category,
      model_number,
      serial_number,
      purchase_date,
      purchase_price,
      currency,
      warranty_duration_months,
      seller,
      notes,
    } = req.body;

    const updatedPurchaseDate = purchase_date || existing.purchase_date;
    const updatedDuration = warranty_duration_months !== undefined ? parseInt(warranty_duration_months, 10) : existing.warranty_duration_months;

    // Recalculate expiry if date or duration changed
    const updatedExpiry = calculateExpiryDate(updatedPurchaseDate, updatedDuration);

    const price = purchase_price !== undefined ? (purchase_price ? parseFloat(purchase_price) : null) : existing.purchase_price;

    const updated = await db.updateWarranty(id, userId, {
      product_name: product_name ? String(product_name).trim() : existing.product_name,
      brand: brand !== undefined ? (brand ? String(brand).trim() : null) : existing.brand,
      category: category !== undefined ? (category ? String(category).trim() : null) : existing.category,
      model_number: model_number !== undefined ? (model_number ? String(model_number).trim() : null) : existing.model_number,
      serial_number: serial_number !== undefined ? (serial_number ? String(serial_number).trim() : null) : existing.serial_number,
      purchase_date: updatedPurchaseDate,
      purchase_price: price,
      currency: currency || existing.currency,
      warranty_duration_months: updatedDuration,
      expiry_date: updatedExpiry,
      seller: seller !== undefined ? (seller ? String(seller).trim() : null) : existing.seller,
      notes: notes !== undefined ? (notes ? String(notes).trim() : null) : existing.notes,
    });

    if (!updated) {
      return res.status(404).json({ error: 'Failed to update warranty.' });
    }

    const remainingDays = getRemainingDays(updated.expiry_date);
    const computedStatus = getWarrantyStatus(updated.expiry_date);

    return res.json({
      warranty: {
        ...updated,
        remaining_days: remainingDays,
        status: computedStatus,
      },
      message: 'Warranty updated successfully.',
    });
  } catch (err: any) {
    console.error('[Warranties] PATCH /:id error:', err);
    return res.status(500).json({ error: 'Failed to update warranty.' });
  }
});

// DELETE /api/v1/warranties/:id
warrantiesRouter.delete('/:id', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const deleted = await db.deleteWarranty(id, userId);
    if (!deleted) {
      return res.status(404).json({ error: 'Warranty not found or could not be deleted.' });
    }

    return res.json({ success: true, message: 'Warranty deleted successfully.' });
  } catch (err: any) {
    console.error('[Warranties] DELETE /:id error:', err);
    return res.status(500).json({ error: 'Failed to delete warranty.' });
  }
});
