import { useEffect, useState } from 'react';
import { useHabits } from '../context/HabitContext';
import { localDateKey } from '../utils/habitUtils';
import { promoteDuePhases } from '../utils/phaseLifecycle';

/**
 * Renders nothing. Starts planned phases automatically when their start date arrives,
 * so imported Phase 2 / Phase 3 tasks begin appearing on Today without manual edits.
 * Mounted once inside HabitProvider; re-checks every minute to follow midnight rollover.
 */
export function PhaseAutoStart() {
  const { data, updateData } = useHabits();
  const [today, setToday] = useState(() => localDateKey());

  useEffect(() => {
    const id = window.setInterval(() => setToday(localDateKey()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    // promoteDuePhases returns the same object when nothing changes, so this cannot loop.
    if (promoteDuePhases(data, today) !== data) {
      updateData(current => promoteDuePhases(current, today));
    }
  }, [data, today, updateData]);

  return null;
}
