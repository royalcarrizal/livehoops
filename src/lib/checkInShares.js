import { supabase } from './supabase';

function unwrapJson(data) {
  return Array.isArray(data) ? data[0] : data;
}

export async function createCheckInShare(checkinId) {
  const { data, error } = await supabase.rpc('create_checkin_share', {
    p_checkin_id: checkinId,
  });

  if (error) throw error;
  const result = unwrapJson(data);
  if (!result?.token || !result?.expires_at) {
    throw new Error('Share link was not created.');
  }
  return result;
}

export async function getSharedCheckIn(token) {
  const { data, error } = await supabase.rpc('get_shared_checkin', {
    p_token: token,
  });

  if (error) throw error;
  return unwrapJson(data) ?? { state: 'unavailable' };
}

export async function listMyCheckInShares() {
  const { data, error } = await supabase.rpc('list_my_checkin_shares');
  if (error) throw error;
  return data ?? [];
}

export async function revokeCheckInShare(token) {
  const { data, error } = await supabase.rpc('revoke_checkin_share', {
    p_token: token,
  });

  if (error) throw error;
  return data === true;
}
