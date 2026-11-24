'use client';

import React, { useEffect, useState } from 'react';
import { Lock, Play, Plus, Radio, Users } from 'lucide-react';
import { useBooklit } from '@/context/BooklitContext';
import { LiveWatchSession } from '@/lib/types';

export function LiveWatchView() {
  const { user, liveWatchRooms, openSessionFlow, isOnline } = useBooklit();

  const [rooms, setRooms] = useState<LiveWatchSession[]>(liveWatchRooms);
  const [selectedCode, setSelectedCode] = useState<string>('LAMP-402');
  const [newRoomTitle, setNewRoomTitle] = useState('');
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [roomTickSeconds, setRoomTickSeconds] = useState(0);

  // Poll / sync calm room aggregate verified minutes (no surveillance or raw page exposure!)
  useEffect(() => {
    if (!isOnline) {
      setRooms(liveWatchRooms);
      return;
    }

    let cancelled = false;
    const syncRooms = async () => {
      try {
        const res = await fetch('/api/live-watch');
        if (res.ok && !cancelled) {
          const data = await res.json();
          if (Array.isArray(data.rooms)) {
            setRooms(data.rooms);
          }
        }
      } catch {}
    };
    syncRooms();
    const poll = window.setInterval(syncRooms, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(poll);
    };
  }, [isOnline, liveWatchRooms]);

  const activeRoom =
    rooms.find((r) => r.room_code === selectedCode) ?? rooms[0] ?? liveWatchRooms[0] ?? null;

  useEffect(() => {
    if (!activeRoom) return;
    const updateClock = () => {
      const secs = Math.max(
        0,
        Math.floor((Date.now() - new Date(activeRoom.started_at).getTime()) / 1000)
      );
      setRoomTickSeconds(secs);
    };
    updateClock();
    const timer = window.setInterval(updateClock, 1000);
    return () => window.clearInterval(timer);
  }, [activeRoom]);

  if (!user) return null;

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/live-watch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          title: newRoomTitle || `${user.display_name}’s Quiet Reading Room`,
          targetMinutes: 40,
          userId: user.id,
          displayName: user.display_name,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setRooms((prev) => [data.room, ...prev]);
        setSelectedCode(data.room.room_code);
        setNewRoomTitle('');
      }
    } catch {}
  };

  const handleJoinByCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCodeInput.trim()) return;
    try {
      const res = await fetch('/api/live-watch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'join',
          roomCode: joinCodeInput.trim().toUpperCase(),
          userId: user.id,
          displayName: user.display_name,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setRooms((prev) =>
          prev.some((r) => r.room_code === data.room.room_code)
            ? prev.map((r) => (r.room_code === data.room.room_code ? data.room : r))
            : [data.room, ...prev]
        );
        setSelectedCode(data.room.room_code);
        setJoinCodeInput('');
      }
    } catch {}
  };

  return (
    <div className="space-y-6 pb-20">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-bold text-stone-900 dark:text-stone-100">
            Live Watch · Calm Shared Accountability
          </h1>
          <p className="text-xs text-stone-500 dark:text-stone-400">
            Accountability without surveillance: participants see a calm shared timer and aggregate
            verified minutes—never book titles, raw pages, or voice clips.
          </p>
        </div>

        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-700/15 text-emerald-800 dark:text-emerald-300 text-xs font-medium">
          <Lock className="w-3.5 h-3.5" />
          Aggregate Verified Minutes Only
        </span>
      </div>

      {/* Host or Join Controls */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <form
          onSubmit={handleCreateRoom}
          className="rounded-2xl border border-stone-200 dark:border-stone-800 bg-white/85 dark:bg-ink-900 p-4 flex items-center gap-2"
        >
          <input
            type="text"
            value={newRoomTitle}
            onChange={(e) => setNewRoomTitle(e.target.value)}
            placeholder="Host a new quiet reading room…"
            className="flex-1 rounded-xl border border-stone-300 dark:border-stone-700 bg-paper-50 dark:bg-ink-800 px-3 py-2 text-xs"
          />
          <button
            type="submit"
            className="inline-flex items-center gap-1 px-3.5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            Host Room
          </button>
        </form>

        <form
          onSubmit={handleJoinByCode}
          className="rounded-2xl border border-stone-200 dark:border-stone-800 bg-white/85 dark:bg-ink-900 p-4 flex items-center gap-2"
        >
          <input
            type="text"
            value={joinCodeInput}
            onChange={(e) => setJoinCodeInput(e.target.value)}
            placeholder="Enter invite code (e.g. LAMP-402)"
            className="flex-1 rounded-xl border border-stone-300 dark:border-stone-700 bg-paper-50 dark:bg-ink-800 px-3 py-2 text-xs font-mono uppercase"
          />
          <button
            type="submit"
            className="px-3.5 py-2 rounded-xl border border-stone-300 dark:border-stone-700 text-xs font-semibold hover:bg-stone-100 dark:hover:bg-ink-800 shrink-0"
          >
            Join Room
          </button>
        </form>
      </div>

      {/* Active Calm Room Stage */}
      {activeRoom && (
        <div className="rounded-3xl bg-ink-950 text-paper-50 p-6 sm:p-8 border border-stone-800 shadow-xl space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="inline-flex items-center gap-2 text-xs text-emerald-400 font-medium">
                <Radio className="w-3.5 h-3.5 animate-pulse" />
                Live Room · Invite Code{' '}
                <span className="font-mono px-2 py-0.5 rounded bg-white/10 text-white">
                  {activeRoom.room_code}
                </span>
              </div>
              <h2 className="font-serif text-2xl font-bold">{activeRoom.title}</h2>
            </div>

            <div className="text-right">
              <div className="text-[11px] uppercase tracking-wider text-stone-400">
                Shared Room Clock
              </div>
              <div className="font-mono text-3xl font-light tabular-nums">
                {String(Math.floor(roomTickSeconds / 60)).padStart(2, '0')}:
                {String(roomTickSeconds % 60).padStart(2, '0')}
              </div>
            </div>
          </div>

          {/* Participant Verified Minutes Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            {activeRoom.participants.map((p) => (
              <div
                key={p.userId}
                className="rounded-2xl bg-white/5 border border-white/10 p-4 flex items-center justify-between"
              >
                <div>
                  <div className="text-sm font-semibold flex items-center gap-1.5">
                    <span>{p.displayName}</span>
                    <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-white/10 text-stone-300">
                      {p.role}
                    </span>
                  </div>
                  <div className="text-xs text-emerald-400 mt-1 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    Reading calmly
                  </div>
                </div>
                <div className="text-right font-mono">
                  <div className="text-xl font-bold">{p.verifiedMinutesInRoom}m</div>
                  <div className="text-[10px] text-stone-400">verified</div>
                </div>
              </div>
            ))}
          </div>

          <div className="pt-2 border-t border-white/10 flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-stone-400 flex items-center gap-2">
              <Users className="w-4 h-4 text-stone-400" />
              <span>
                {activeRoom.participants.length} readers present · Target {activeRoom.target_minutes}
                m sitting
              </span>
            </div>
            <button
              type="button"
              onClick={() => openSessionFlow()}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold"
            >
              <Play className="w-3.5 h-3.5" />
              Log Verified Session into This Room
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
