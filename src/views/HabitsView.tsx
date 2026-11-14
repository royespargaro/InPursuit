import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Plus, Trash2 } from '../components/Icon';
import { Button, cx, Empty, SectionTitle } from '../components/ui';
import type { Habit, HabitLog } from '../types';
import { getBestStreak, getStreak, shiftDateKey } from '../utils/habitUtils';
import { getHabitConsistency } from '../utils/intelligence';

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
  const monthName = new Date(year, month, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`;

  const displayedDates = useMemo(() => {
    if (matrixMode === '7day') {
      return Array.from({ length: 7 }, (_, i) => {
        const date = shiftDateKey(today, -(6 - i));
        const d = new Date(`${date}T12:00:00`);
        return {
          date,
          label: d.toLocaleDateString('en-GB', { weekday: 'short' }).slice(0, 2),
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
  }, [daysInMonth, matrixMode, monthPrefix, today]);

  const { monthDoneCount, logStatusMap } = useMemo(() => {
    let doneCount = 0;
    const statusMap = new Map<string, 'done' | 'skipped'>();
    for (const log of logs) {
      if (log.status === 'done' && log.date.startsWith(monthPrefix)) doneCount += 1;
      statusMap.set(`${log.habitId}:${log.date}`, log.status);
    }
    return { monthDoneCount: doneCount, logStatusMap: statusMap };
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
      <SectionTitle eyebrow="consistency · repeatable actions" title="Habits">
        <Button variant="solid" onClick={onAdd}><Plus size={15} /> New habit</Button>
      </SectionTitle>
      <div className="page-lede">Build a rhythm, not a perfect streak. Click cells to mark done, click again to mark skipped, or clear.</div>

      <div className="habit-summary">
        <div><span>Active habits</span><b>{activeHabitsList.length}</b></div>
        <div><span>30-day adherence</span><b>{consistency30d}%</b></div>
        <div><span>This month · Today</span><b>{monthDoneCount} · {completedToday}/{scheduledActiveCount}</b></div>
      </div>

      <section className="panel habit-matrix-panel">
        <div className="matrix-head">
          <div>
            <div className="eyebrow">{matrixMode === '7day' ? '7-day window' : 'monthly view'}</div>
            <h2>{matrixMode === '7day' ? 'Last 7 days' : monthName}</h2>
          </div>
          <div className="matrix-controls">
            <div className="segmented" role="group" aria-label="Matrix view mode">
              <button
                type="button"
                className={matrixMode === '7day' ? 'selected' : ''}
                onClick={() => setMatrixMode('7day')}
              >
                7 days
              </button>
              <button
                type="button"
                className={matrixMode === 'month' ? 'selected' : ''}
                onClick={() => setMatrixMode('month')}
              >
                Month
              </button>
            </div>
            {matrixMode === 'month' && (
              <div className="matrix-nav">
                <button type="button" className="icon-btn" aria-label="Previous month" onClick={() => moveMonth(-1)}><ChevronLeft size={17} /></button>
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => {
                    setMonth(now.getMonth());
                    setYear(now.getFullYear());
                  }}
                >
                  Today
                </button>
                <button type="button" className="icon-btn" aria-label="Next month" onClick={() => moveMonth(1)}><ChevronRight size={17} /></button>
              </div>
            )}
          </div>
        </div>

        {habits.length ? (
          <div className="matrix-scroll">
            <table className="habit-table">
              <thead>
                <tr>
                  <th className="habit-name-cell">Habit · Streak / 30d</th>
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
                  return (
                    <tr key={h.id}>
                      <td className="habit-name-cell">
                        <div className="habit-name">
                          <span className={cx('habit-active-dot', h.active && 'on')} />
                          <div className="habit-name-meta">
                            <button type="button" onClick={() => onEdit(h.id)}>{h.name}</button>
                            <small className="habit-submeta">
                              {h.frequency}{h.active ? '' : ' (paused)'} · {stats.streak}d (best {stats.best}d) · {stats.rate}%
                            </small>
                          </div>
                          <button type="button" className="delete-mini" aria-label={`Delete habit ${h.name}`} onClick={() => onDelete(h.id, h.name)}>
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </td>
                      {displayedDates.map(col => {
                        const logStatus = logStatusMap.get(`${h.id}:${col.date}`);
                        const future = col.date > today;
                        return (
                          <td key={col.date}>
                            <button
                              type="button"
                              disabled={future || !h.active}
                              aria-label={`${h.name} ${col.date}: ${logStatus ?? 'not completed'}`}
                              className={cx('matrix-cell', logStatus === 'done' && 'done', logStatus === 'skipped' && 'skipped', future && 'future')}
                              onClick={() => onToggle(h, col.date)}
                            >
                              {logStatus === 'done' ? <Check size={11} /> : logStatus === 'skipped' ? '–' : null}
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
            title="No habits yet."
            body="Start with actions you can repeat consistently."
            action={<Button variant="outline" onClick={onAdd}><Plus size={15} /> Add a habit</Button>}
          />
        )}

        <div className="matrix-legend">
          <span><i className="legend-square done" /> Completed</span>
          <span><i className="legend-square skipped" /> Skipped</span>
          <span><i className="legend-square" /> Not completed</span>
          <span>Future dates are locked</span>
        </div>
      </section>
    </div>
  );
}
