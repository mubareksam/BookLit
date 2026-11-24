'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Check, Copy, KeyRound, Plus, Radio, Users, X } from 'lucide-react';
import { useBooklit } from '@/context/BooklitContext';
import { LiveWatchSession } from '@/lib/types';

export function LiveWatchView() {
  const { user, openSessionFlow } = useBooklit();
  const [rooms, setRooms] = useState<LiveWatchSession[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [targetMinutes, setTargetMinutes] = useState(30);
  const [joinCode, setJoinCode] = useState('');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const loadRooms = useCallback(async () => {
    try {
      const res = await fetch('/api/live-watch', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setRooms(data.rooms ?? []);
      }
    } catch {}
  }, []);

  useEffect(() => {
    loadRooms();
    const timer = window.setInterval(loadRooms, 6000);
    return () => window.clearInterval(timer);
  }, [loadRooms]);

  if (!user) return null;

  const createRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    const res = await fetch('/api/live-watch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'create',
        title: title.trim(),
        targetMinutes,
      }),
    });
    if (res.ok) {
      setTitle('');
      setCreateOpen(false);
      await loadRooms();
    }
  };

  const joinRoomByCode = async (roomCode: string) => {
    if (!roomCode.trim()) return;
    const res = await fetch('/api/live-watch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'join', roomCode: roomCode.trim() }),
    });
    if (res.ok) {
      setJoinCode('');
      await loadRooms();
    }
  };

  const completeRoom = async (roomCode: string) => {
    await fetch('/api/live-watch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'complete', roomCode }),
    });
    await loadRooms();
  };

  return (
    <div className="space-y-5 pb-20 min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Live Rooms</h1>
          <p className="text-xs text-zinc-500">
            Silent co-reading rooms—presence only, no camera or mic broadcast.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 text-white text-xs font-semibold shrink-0"
        >
          <Plus className="w-4 h-4" />
          Host Room
        </button>
      </div>

      {/* Join by Room Code */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          joinRoomByCode(joinCode);
        }}
        className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3.5 py-2.5 flex items-center gap-2 max-w-md"
      >
        <KeyRound className="w-4 h-4 text-zinc-400 shrink-0" />
        <input
          type="text"
          value={joinCode}
          onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
          placeholder="Room code (e.g. RM-4K9A)"
          className="flex-1 min-w-0 bg-transparent text-xs font-mono uppercase focus:outline-none"
        />
        <button
          type="submit"
          className="px-3 py-1.5 rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-xs font-semibold shrink-0"
        >
          Join
        </button>
      </form>

      {createOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={createRoom}
            className="w-full max-w-sm rounded-3xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-5 space-y-3.5 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Host Silent Reading Room</h2>
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="p-1.5 rounded-lg text-zinc-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-500 mb-1">Room Name *</label>
              <input
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Evening 30-Min Sprint"
                className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-2 text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-500 mb-1">
                Target Duration (mins)
              </label>
              <input
                type="number"
                min={10}
                max={180}
                value={targetMinutes}
                onChange={(e) => setTargetMinutes(Number(e.target.value) || 30)}
                className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-2 font-mono text-xs"
              />
            </div>

            <button
              type="submit"
              className="w-full py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-semibold"
            >
              Start Room
            </button>
          </form>
        </div>
      )}

      {rooms.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-zinc-200 dark:border-zinc-800 p-10 text-center space-y-3">
          <Radio className="w-7 h-7 text-zinc-400 mx-auto" />
          <div className="space-y-1">
            <h3 className="text-sm font-semibold">No live rooms right now</h3>
            <p className="text-xs text-zinc-500 max-w-xs mx-auto">
              Host a silent reading sprint so signed-in members can read alongside you in real time.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {rooms.map((rm) => {
            const inside = rm.participants.some((p) => p.userId === user.id);
            const isHost = rm.host_user_id === user.id;
            return (
              <div
                key={rm.id}
                className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 space-y-3.5 min-w-0"
              >
                <div className="flex items-start justify-between gap-2 min-w-0">
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold truncate">{rm.title}</h3>
                    <p className="text-xs text-zinc-500 truncate">
                      {rm.target_minutes}m sprint ·{' '}
                      <span className="inline-flex items-center gap-1">
                        <Users className="w-3 h-3" /> {rm.participants.length}
                      </span>
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={async () => {
                      await navigator.clipboard.writeText(rm.room_code);
                      setCopiedCode(rm.room_code);
                      setTimeout(() => setCopiedCode(null), 2000);
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-[11px] font-mono shrink-0"
                  >
                    {copiedCode === rm.room_code ? (
                      <Check className="w-3 h-3 text-emerald-600" />
                    ) : (
                      <Copy className="w-3 h-3 text-zinc-400" />
                    )}
                    {rm.room_code}
                  </button>
                </div>

                <div className="space-y-1.5">
                  {rm.participants.map((p) => (
                    <div
                      key={p.userId}
                      className="flex items-center justify-between text-xs bg-zinc-50 dark:bg-zinc-800/70 rounded-xl px-3 py-2 min-w-0"
                    >
                      <span className="font-medium truncate">
                        {p.displayName}{' '}
                        <span className="text-zinc-400 font-mono">@{p.username}</span>
                      </span>
                      <span className="text-[11px] font-mono text-emerald-600 shrink-0 ml-2">
                        {p.verifiedMinutesInRoom}m
                      </span>
                    </div>
                  ))}
                </div>

                <div className="flex gap-2">
                  {inside ? (
                    <>
                      <button
                        type="button"
                        onClick={() => openSessionFlow()}
                        className="flex-1 py-2 rounded-xl bg-emerald-600 text-white text-xs font-semibold"
                      >
                        Start Session
                      </button>
                      {isHost && (
                        <button
                          type="button"
                          onClick={() => completeRoom(rm.room_code)}
                          className="px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 text-xs"
                        >
                          End Room
                        </button>
                      )}
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => joinRoomByCode(rm.room_code)}
                      className="w-full py-2 rounded-xl bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-xs font-semibold"
                    >
                      Join Room
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
