'use client';

import React, { useState, useCallback } from 'react';

const API_URL = typeof process !== 'undefined' ? (process.env.NEXT_PUBLIC_API_URL ?? '') : '';

export default function AdminPage() {
  const [token, setToken] = useState('');
  const [result, setResult] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [dryRunResult, setDryRunResult] = useState<{ players_affected: number; season_month: string; preview: { player_id: number; old: number; new: number }[] } | null>(null);

  const callEndpoint = useCallback(async (path: string, dryRun: boolean) => {
    if (!token.trim()) { setResult('❌ Enter your ADMIN_TOKEN first.'); return; }
    setLoading(true);
    setResult('');
    try {
      const url = `${API_URL}${path}?dry_run=${dryRun}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token.trim()}` },
      });
      const data = await res.json();
      if (!res.ok) {
        setResult(`❌ ${res.status}: ${data.detail ?? JSON.stringify(data)}`);
        return;
      }
      if (dryRun) {
        setDryRunResult(data);
        setResult(`✅ Dry run: ${data.players_affected} players would be reset for season ${data.season_month}`);
      } else {
        setDryRunResult(null);
        setResult(`✅ Season reset complete: ${data.players_reset} players reset → season ${data.season_month}`);
      }
    } catch (e: any) {
      setResult(`❌ Network error: ${e?.message ?? 'unreachable'}`);
    }
    setLoading(false);
  }, [token]);

  return (
    <div className="min-h-screen bg-[#0a0604] text-[#d8c8a8] p-6 font-mono">
      <h1 className="text-xl font-bold text-[#f0c040] mb-1">DragonSlayer Admin</h1>
      <p className="text-[#6b5a3a] text-sm mb-6">Season management &amp; maintenance tools</p>

      <div className="max-w-lg space-y-4">

        {/* Token input */}
        <div className="p-4 rounded-xl border border-[rgba(212,160,23,0.2)] bg-[rgba(212,160,23,0.04)]">
          <label className="block text-[11px] text-[#6b5a3a] uppercase tracking-widest mb-1">Admin Token</label>
          <input
            type="password"
            value={token}
            onChange={e => setToken(e.target.value)}
            placeholder="Paste ADMIN_TOKEN here"
            className="w-full bg-black/60 border border-[rgba(212,160,23,0.3)] rounded-lg px-3 py-2 text-sm text-[#f0c040] outline-none focus:border-[rgba(212,160,23,0.7)] placeholder-[#3a2a1a]"
          />
        </div>

        {/* Season Reset */}
        <div className="p-4 rounded-xl border border-[rgba(139,92,246,0.25)] bg-[rgba(139,92,246,0.04)]">
          <h2 className="text-sm font-bold text-[#a78bfa] mb-1">🏆 Season Reset</h2>
          <p className="text-[11px] text-[#6b5a3a] mb-3">
            Soft-reset all player trophies (25% carry-over). Normally happens automatically each month.
            Use dry-run first to preview impact.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => callEndpoint('/api/admin/season-reset', true)}
              disabled={loading}
              className="flex-1 py-2 rounded-lg text-[11px] font-bold transition-all"
              style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.35)', color: loading ? '#4a3a6a' : '#a78bfa', opacity: loading ? 0.6 : 1 }}
            >
              {loading ? '⏳ Running…' : '👁️ Dry Run (preview)'}
            </button>
            <button
              onClick={() => {
                if (!window.confirm('This will reset ALL player trophies. Are you sure?')) return;
                callEndpoint('/api/admin/season-reset', false);
              }}
              disabled={loading}
              className="flex-1 py-2 rounded-lg text-[11px] font-bold transition-all"
              style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.35)', color: loading ? '#6a2a2a' : '#f87171', opacity: loading ? 0.6 : 1 }}
            >
              {loading ? '⏳ Running…' : '🔄 Execute Reset'}
            </button>
          </div>

          {/* Dry run preview table */}
          {dryRunResult && dryRunResult.preview.length > 0 && (
            <div className="mt-3">
              <p className="text-[10px] text-[#6b5a3a] mb-1">Preview (top 10 affected):</p>
              <div className="space-y-1">
                {dryRunResult.preview.map(p => (
                  <div key={p.player_id} className="flex justify-between text-[10px] px-2 py-1 rounded bg-black/30">
                    <span className="text-[#6b5a3a]">player #{p.player_id}</span>
                    <span className="text-[#f0c040]">{p.old} → {p.new} 🏅</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Result */}
        {result && (
          <div className="p-3 rounded-lg border border-[rgba(255,255,255,0.08)] bg-black/40 text-[11px] break-all">
            {result}
          </div>
        )}

        {/* Links */}
        <div className="pt-2 border-t border-[rgba(255,255,255,0.06)] space-y-1">
          <p className="text-[10px] text-[#4a3a2a] uppercase tracking-widest">Other admin endpoints</p>
          <p className="text-[10px] text-[#6b5a3a]">GET {API_URL}/api/admin/players — list all players</p>
          <p className="text-[10px] text-[#6b5a3a]">GET {API_URL}/api/admin/embed/origins — manage embed origins</p>
          <p className="text-[10px] text-[#6b5a3a]">POST {API_URL}/api/admin/cleanup-orphans?dry_run=true — find orphan accounts</p>
        </div>
      </div>
    </div>
  );
}
