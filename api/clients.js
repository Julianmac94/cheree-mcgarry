/**
 * api/clients.js
 * GET    → list all clients (active by default, ?all=1 includes inactive)
 * POST   → create client
 * PATCH  → update client fields
 * DELETE → hard-delete client and their sessions (Halaxy is not affected)
 */

import { isAuthed } from './_auth.js';
import { createClient } from '@supabase/supabase-js';
import { deleteCalendarEvent } from './calendar-pending.js';

const db = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (!isAuthed(req)) {
    return res.status(401).json({ error: 'Unauthorised' });
  }

  // ── GET ──────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const all = req.query?.all === '1';
    let query = db
      .from('clients')
      .select(`
        id, display_name, funder, plan_manager, halaxy_id, enquiry_id, active, notes,
        client_type, parent_client_id, is_contact, funder_ref,
        created_at,
        sessions (id, session_date, status, invoice_ref, amount, notes)
      `)
      .order('display_name', { ascending: true });

    if (!all) query = query.eq('active', true);

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  // ── POST ─────────────────────────────────────────────────────────────
  if (req.method === 'POST') {
    const body = req.body || {};
    const { display_name, funder, plan_manager, halaxy_id, notes, enquiry_id,
            client_type, parent_client_id, is_contact, funder_ref,
            email, source } = body;

    if (!display_name) {
      return res.status(400).json({ error: 'display_name is required' });
    }
    if (!funder) {
      return res.status(400).json({ error: 'funder is required' });
    }

    // Insert the client first — so a failed insert never leaves an orphaned enquiry.
    const { data, error } = await db
      .from('clients')
      .insert({
        display_name,
        funder,
        plan_manager:      plan_manager      || null,
        halaxy_id:         halaxy_id         || null,
        notes:             notes             || null,
        enquiry_id:        enquiry_id        || null,
        client_type:       client_type       || null,
        parent_client_id:  parent_client_id  || null,
        is_contact:        is_contact        || false,
        funder_ref:        funder_ref        || null,
      })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });

    // Now that the client exists, create a linked enquiry so it surfaces in the inbox.
    // Doing this after the client insert means a constraint failure above leaves no orphan.
    if (!halaxy_id && !is_contact && !enquiry_id) {
      const parts = display_name.trim().split(/\s+/);
      const { data: enqData } = await db.from('enquiries').insert({
        first_name: parts[0] || display_name,
        last_name:  parts.slice(1).join(' ') || null,
        email:      email  || null,
        source:     source || 'manual',
        status:     'new',
      }).select('id').single();
      if (enqData) {
        await db.from('clients').update({ enquiry_id: enqData.id }).eq('id', data.id);
        data.enquiry_id = enqData.id;
      }
    }

    return res.status(201).json(data);
  }

  // ── PATCH ─────────────────────────────────────────────────────────────
  if (req.method === 'PATCH') {
    const body = req.body || {};
    const { id, ...fields } = body;
    if (!id) return res.status(400).json({ error: 'id is required' });

    // On archive: cascade-delete any GCal events attached to this client's sessions.
    // Failures are non-blocking — archive still proceeds even if GCal is unreachable.
    if (fields.active === false) {
      try {
        const { data: sessions } = await db
          .from('sessions')
          .select('gcal_event_id')
          .eq('client_id', id)
          .not('gcal_event_id', 'is', null);

        if (sessions?.length) {
          await Promise.allSettled(
            sessions.map(s => deleteCalendarEvent(s.gcal_event_id))
          );
        }
      } catch (gcalErr) {
        console.warn('[clients] GCal cascade cleanup error:', gcalErr.message);
      }
    }

    const allowed = ['display_name', 'funder', 'plan_manager', 'halaxy_id', 'active', 'notes', 'enquiry_id',
                     'client_type', 'parent_client_id', 'is_contact', 'funder_ref'];
    const update = Object.fromEntries(
      Object.entries(fields).filter(([k]) => allowed.includes(k))
    );
    update.updated_at = new Date().toISOString();

    const { data, error } = await db
      .from('clients')
      .update(update)
      .eq('id', id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  // ── DELETE — hard-delete the dashboard record (Halaxy is untouched) ──
  if (req.method === 'DELETE') {
    const id = req.query?.id || req.body?.id;
    if (!id) return res.status(400).json({ error: 'id is required' });

    // Delete sessions first (cascade may handle this, but be explicit)
    await db.from('sessions').delete().eq('client_id', id);

    const { error } = await db.from('clients').delete().eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
