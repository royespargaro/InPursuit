import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Plus, Trash2 } from '../components/Icon';
import { Button, cx, Empty, SectionTitle } from '../components/ui';
import { useLanguage } from '../context/LanguageContext';
import type { Habit, HabitLog } from '../types';
import { getBestStreak, getStreak, getWeeklyHabitCount, shiftDateKey } from '../utils/habitUtils';
import { getHabitConsistency } from '../utils/intelligence';

const DAY_LABELS_ID: Record<string, string> = {
  mon: 'Sen',
  tue: 'Sel',
  wed: 'Rab',
  thu: 'Kam',
  fri: 'Jum',
  sat: 'Sab',
  sun: 'Min',
};

interface HabitsViewProps {
  habits: Habit[];
  logs: HabitLog[];
  completedHabitIds: Set<string>;
  scheduledActiveCount: number;
  today: string;
  onAdd: () => void;
  onEdit: (id: string) => void;
  onDelete: (id: string, title: string) => void;
  onToggle: (h: Habit, date: string) => void;
}

export function HabitsView({
  habits,
  logs,
  completedHabitIds,
  scheduledActiveCount,
  today,
  onAdd,
  onEdit,
  onDelete,
  onToggle,
}: HabitsViewProps) {
  const { locale, l } = useLanguage();
  const now = useMemo(() => new Date(`${today}T12:00:00`), [today]);
  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());
  const [matrixMode, setMatrixMode] = useState<'7day' | 'month'>(() =>
    typeof window !== 'undefined' && window.innerWidth <= 767 ? '7day' : 'month',
  );
  const lastTodayRef = useRef(today);

  // Follow midnight rollover when viewing the active current month
  useEffect(() => {
    const prevDate = new Date(`${lastTodayRef.current}T12:00:00`);
    if (lastTodayRef.current !== today && month === prevDate.getMonth() && year === prevDate.getFullYear()) {
      setMonth(now.getMonth());
      setYear(now.getFullYear());
    }
    lastTodayRef.current = today;
  }, [month, now, today, year]);

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthName = new Date(year, month, 1).toLocaleDateString(locale, { month: 'long', year: 'numeric' });
  const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`;

  const displayedDates = useMemo(() => {
    if (matrixMode === '7day') {
      return Array.from({ length: 7 }, (_, i) => {
        const date = shiftDateKey(today, -(6 - i));
        const d = new Date(`${date}T12:00:00`);
        return {
          date,
          label: d.toLocaleDateString(locale, { weekday: 'short' }).slice(0, 2),
          dayNum: d.getDate(),
          isToday: date === today,
        };
      });
    }
    return Array.from({ length: daysInMonth }, (_, i) => {
      const dayNum = i + 1;
      const date = `${monthPrefix}-${String(dayNum).padStart(2, '0')}`;
      return {
        date,
        label: '',
        dayNum,
        isToday: date === today,
      };
    });
  }, [daysInMonth, locale, matrixMode, monthPrefix, today]);

  const { monthDoneCount, logStatusMap, dayDoneCountMap } = useMemo(() => {
    let doneCount = 0;
    const statusMap = new Map<string, 'done' | 'skipped'>();
    const countMap = new Map<string, number>();
    for (const log of logs) {
      const key = `${log.habitId}:${log.date}`;
      if (log.status === 'done') {
        if (log.date.startsWith(monthPrefix)) doneCount += 1;
        countMap.set(key, (countMap.get(key) ?? 0) + 1);
      }
      statusMap.set(key, log.status);
    }
    return { monthDoneCount: doneCount, logStatusMap: statusMap, dayDoneCountMap: countMap };
  }, [logs, monthPrefix]);

  const activeHabitsList = useMemo(() => habits.filter(h => h.active), [habits]);
  const completedToday = useMemo(
    () => activeHabitsList.filter(habit => completedHabitIds.has(habit.id)).length,
    [activeHabitsList, completedHabitIds],
  );
  const habitStatsMap = useMemo(
    () =>
      new Map(
        habits.map(h => [
          h.id,
          {
            streak: getStreak(h, logs, now),
            best: getBestStreak(h, logs),
            rate: getHabitConsistency(h, logs, 30, now).rate,
          },
        ]),
      ),
    [habits, logs, now],
  );
  const consistency30d = useMemo(
    () =>
      activeHabitsList.length
        ? Math.round(activeHabitsList.reduce((sum, h) => sum + (habitStatsMap.get(h.id)?.rate ?? 0), 0) / activeHabitsList.length)
        : 0,
    [activeHabitsList, habitStatsMap],
  );

  const moveMonth = (direction: number) => {
    const d = new Date(year, month + direction, 1);
    setMonth(d.getMonth());
    setYear(d.getFullYear());
    setMatrixMode('month');
  };

  return (
    <div className="view-stack">
      <SectionTitle eyebrow={l('consistency · repeatable actions', 'konsistensi · aksi berulang')} title={l('Habits', 'Kebiasaan')}>
        <Button variant="solid" onClick={onAdd}><Plus size={15} /> {l('New habit', 'Kebiasaan baru')}</Button>
      </SectionTitle>
      <div className="page-lede">{l('Build a rhythm, not a perfect streak. Click cells to mark done (or add completions for weekly targets), skipped, or clear.', 'Bangun ritme, bukan sekadar rentetan sempurna. Klik kotak untuk menandai selesai (atau tambah capaian target mingguan), dilewati, atau kosongkan.')}</div>

      <div className="habit-summary">
        <div><span>{l('Active habits', 'Kebiasaan aktif')}</span><b>{activeHabitsList.length}</b></div>
        <div><span>{l('30-day adherence', 'Kepatuhan 30 hari')}</span><b>{consistency30d}%</b></div>
        <div><span>{l('This month · Today', 'Bulan ini · Hari ini')}</span><b>{monthDoneCount} · {completedToday}/{scheduledActiveCount}</b></div>
      </div>

      <section className="panel habit-matrix-panel">
        <div className="matrix-head">
          <div>
            <div className="eyebrow">{matrixMode === '7day' ? l('7-day window', 'rentang 7 hari') : l('monthly view', 'tampilan bulanan')}</div>
            <h2>{matrixMode === '7day' ? l('Last 7 days', '7 hari terakhir') : monthName}</h2>
          </div>
          <div className="matrix-controls">
            <div className="segmented" role="group" aria-label={l('Matrix view mode', 'Mode tampilan matriks')}>
              <button
                type="button"
                className={matrixMode === '7day' ? 'selected' : ''}
                onClick={() => setMatrixMode('7day')}
              >
                {l('7 days', '7 hari')}
              </button>
              <button
                type="button"
                className={matrixMode === 'month' ? 'selected' : ''}
                onClick={() => setMatrixMode('month')}
              >
                {l('Month', 'Bulan')}
              </button>
            </div>
            {matrixMode === 'month' && (
              <div className="matrix-nav">
                <button type="button" className="icon-btn" aria-label={l('Previous month', 'Bulan sebelumnya')} onClick={() => moveMonth(-1)}><ChevronLeft size={17} /></button>
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => {
                    setMonth(now.getMonth());
                    setYear(now.getFullYear());
                  }}
                >
                  {l('Today', 'Hari ini')}
                </button>
                <button type="button" className="icon-btn" aria-label={l('Next month', 'Bulan berikutnya')} onClick={() => moveMonth(1)}><ChevronRight size={17} /></button>
              </div>
            )}
          </div>
        </div>

        {habits.length ? (
          <div className="matrix-scroll">
            <table className="habit-table">
              <thead>
                <tr>
                  <th className="habit-name-cell">{l('Habit · Streak / 30d', 'Kebiasaan · Rentetan / 30h')}</th>
                  {displayedDates.map(col => (
                    <th key={col.date} className={col.isToday ? 'today-col' : ''}>
                      {col.label ? (
                        <span className="matrix-th-stack">
                          <small>{col.label}</small>
                          <span>{col.dayNum}</span>
                        </span>
                      ) : (
                        col.dayNum
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {habits.map(h => {
                  const stats = habitStatsMap.get(h.id) ?? { streak: 0, best: 0, rate: 0 };
                  const weeklyCount = h.cadence === 'weekly_count' ? getWeeklyHabitCount(h.id, logs, today) : 0;
                  const scheduleText =
                    h.cadence === 'weekly_count' && h.targetCount
                      ? l(`${weeklyCount}/${h.targetCount} this week`, `${weeklyCount}/${h.targetCount} minggu ini`)
                      : h.cadence === 'specific_days' && h.days?.length
                        ? h.days.map(d => (locale === 'id-ID' ? (DAY_LABELS_ID[d] ?? d) : d)).join(', ')
                        : h.frequency === 'daily'
                          ? l('daily', 'harian')
                          : h.frequency === 'weekdays'
                            ? l('weekdays', 'hari kerja')
                            : l('weekends', 'akhir pekan');
                  const dayUnit = l('d', 'h');
                  return (
                    <tr key={h.id}>
                      <td className="habit-name-cell">
                        <div className="habit-name">
                          <span className={cx('habit-active-dot', h.active && 'on')} />
                          <div className="habit-name-meta">
                            <button type="button" onClick={() => onEdit(h.id)}>{h.name}</button>
                            <small className="habit-submeta">
                              {scheduleText}{h.timeBlock ? ` (${h.timeBlock.start}–${h.timeBlock.end})` : ''}{h.active ? '' : ` (${l('paused', 'jeda')})`} · {stats.streak}{dayUnit} ({l('best', 'terbaik')} {stats.best}{dayUnit}) · {stats.rate}%
                            </small>
                          </div>
                          <button type="button" className="delete-mini" aria-label={l(`Delete habit ${h.name}`, `Hapus kebiasaan ${h.name}`)} onClick={() => onDelete(h.id, h.name)}>
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </td>
                      {displayedDates.map(col => {
                        const cellKey = `${h.id}:${col.date}`;
                        const logStatus = logStatusMap.get(cellKey);
                        const dayDoneCount = dayDoneCountMap.get(cellKey) ?? 0;
                        const future = col.date > today;
                        const statusText =
                          dayDoneCount > 1
                            ? l(`${dayDoneCount} done`, `${dayDoneCount} selesai`)
                            : logStatus === 'done'
                              ? l('done', 'selesai')
                              : logStatus === 'skipped'
                                ? l('skipped', 'dilewati')
                                : l('not completed', 'belum selesai');
                        return (
                          <td key={col.date}>
                            <button
                              type="button"
                              disabled={future || !h.active}
                              aria-label={`${h.name} ${col.date}: ${statusText}`}
                              className={cx('matrix-cell', (dayDoneCount > 0 || logStatus === 'done') && 'done', logStatus === 'skipped' && dayDoneCount === 0 && 'skipped', future && 'future')}
                              onClick={() => onToggle(h, col.date)}
                            >
                              {h.cadence === 'weekly_count' && dayDoneCount > 1 ? (
                                <span className="matrix-count">{dayDoneCount}</span>
                              ) : dayDoneCount > 0 || logStatus === 'done' ? (
                                <Check size={11} />
                              ) : logStatus === 'skipped' ? (
                                '–'
                              ) : null}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title={l('No habits yet.', 'Belum ada kebiasaan.')}
            body={l('Start with actions you can repeat consistently.', 'Mulai dengan tindakan yang bisa Anda ulangi secara konsisten.')}
            action={<Button variant="outline" onClick={onAdd}><Plus size={15} /> {l('Add a habit', 'Tambah kebiasaan')}</Button>}
          />
        )}

        <div className="matrix-legend">
          <span><i className="legend-square done" /> {l('Completed', 'Selesai')}</span>
          <span><i className="legend-square skipped" /> {l('Skipped', 'Dilewati')}</span>
          <span><i className="legend-square" /> {l('Not completed', 'Belum selesai')}</span>
          <span>{l('Future dates are locked', 'Tanggal mendatang terkunci')}</span>
        </div>
      </section>
    </div>
  );
}
