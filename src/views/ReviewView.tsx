import { useMemo } from 'react';
import { ArrowUpRight, Plus, Sparkles, Trash2 } from '../components/Icon';
import { Button, Empty, prettyDate, Progress, SectionTitle } from '../components/ui';
import { useLanguage } from '../context/LanguageContext';
import type { AppData } from '../types';
import { getWeeklyReflectionSummary } from '../utils/intelligence';
import { PersonalOSStudio } from './PersonalOSStudio';

interface ReviewViewProps {
  data: AppData;
  today: string;
  onWrite: (date?: string) => void;
  onDeleteReview: (date: string) => void;
}

export function ReviewView({ data, today, onWrite, onDeleteReview }: ReviewViewProps) {
  const { locale, l } = useLanguage();
  const summary = useMemo(() => {
    const now = new Date(`${today}T12:00:00`);
    return getWeeklyReflectionSummary(data, today, now);
  }, [data, today]);

  const recordedReviews = useMemo(
    () =>
      [...data.dailyReviews]
        .filter(r => Boolean(r.wins.trim() || r.blockers.trim() || r.notes.trim()))
        .sort((a, b) => b.date.localeCompare(a.date)),
    [data.dailyReviews],
  );
  const latestReview = recordedReviews[0];

  return (
    <div className="view-stack">
      <SectionTitle eyebrow={l('evidence · adjustment', 'bukti · penyesuaian')} title={l('Weekly review', 'Evaluasi mingguan')}>
        <Button variant="solid" onClick={() => onWrite(today)}><Plus size={15} /> {l("Write today's review", 'Tulis evaluasi hari ini')}</Button>
      </SectionTitle>
      <div className="page-lede">{l("Look at the evidence. Keep what works. Change what doesn't.", 'Lihat buktinya. Pertahankan yang berhasil. Ubah yang tidak.')}</div>

      <div className="review-metrics">
        <div className="review-metric">
          <span>{l('Priorities executed', 'Prioritas dieksekusi')}</span>
          <b>{summary.priorityDone}<small>/{summary.priorityPlanned}</small></b>
          <Progress value={summary.priorityPlanned ? (summary.priorityDone / summary.priorityPlanned) * 100 : 0} />
          <small>{l(`${summary.tasksDone}/${summary.tasksTotal} scheduled tasks done this week`, `${summary.tasksDone}/${summary.tasksTotal} tugas terjadwal selesai minggu ini`)}</small>
        </div>
        <div className="review-metric">
          <span>{l('Habit consistency', 'Konsistensi kebiasaan')}</span>
          <b>{summary.habitRate}<small>%</small></b>
          <Progress value={summary.habitRate} />
          <small>{l(`${summary.habitDone} of ${summary.habitScheduled} scheduled check-ins`, `${summary.habitDone} dari ${summary.habitScheduled} check-in terjadwal`)}</small>
        </div>
        <div className="review-metric">
          <span>{l('Projects moving', 'Proyek berjalan')}</span>
          <b>{summary.advancingProjects.length}<small>/{data.projects.filter(p => p.status === 'active').length}</small></b>
          <small>
            {summary.neglectedProjects.length > 0
              ? l(`${summary.neglectedProjects.length} active project needs attention`, `${summary.neglectedProjects.length} proyek aktif butuh perhatian`)
              : l('All active projects have recent work', 'Semua proyek aktif memiliki progres baru-baru ini')}
          </small>
        </div>
        <div className="review-metric">
          <span>{l('Unfinished · Reviews', 'Belum selesai · Evaluasi')}</span>
          <b>{summary.overdueCount}<small> {l('overdue', 'terlambat')}</small></b>
          <small>{l(`${summary.reviewsWritten}/7 days reflected this week`, `${summary.reviewsWritten}/7 hari terefleksi minggu ini`)}</small>
        </div>
      </div>

      {(summary.advancingProjects.length > 0 || summary.neglectedProjects.length > 0) && (
        <section className="panel intelligence-panel">
          <div className="panel-head">
            <div><div className="eyebrow">{l('execution evidence', 'bukti eksekusi')}</div><h2>{l('Where momentum went this week', 'Ke mana momentum mengalir minggu ini')}</h2></div>
          </div>
          <div className="intelligence-columns">
            <div>
              <span className="review-label">{l('ADVANCING PROJECTS', 'PROYEK BERJALAN')}</span>
              {summary.advancingProjects.length ? (
                <ul className="intelligence-list">
                  {summary.advancingProjects.map(item => (
                    <li key={item.project.id}>
                      <b>{item.project.title}</b>
                      <small>{l(`${item.completedThisWeek} task${item.completedThisWeek === 1 ? '' : 's'} completed`, `${item.completedThisWeek} tugas selesai`)}</small>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="intelligence-muted">{l('No project tasks completed yet this week.', 'Belum ada tugas proyek yang selesai minggu ini.')}</p>
              )}
            </div>
            <div>
              <span className="review-label">{l('REQUIRING ATTENTION', 'BUTUH PERHATIAN')}</span>
              {summary.neglectedProjects.length ? (
                <ul className="intelligence-list">
                  {summary.neglectedProjects.map(item => (
                    <li key={item.project.id}>
                      <b>{item.project.title}</b>
                      <small>{item.reason === 'no-tasks' ? l('No tasks defined yet', 'Belum ada tugas ditentukan') : l(`${item.daysIdle} days without activity`, `${item.daysIdle} hari tanpa aktivitas`)}</small>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="intelligence-muted">{l('Every active project has recent activity.', 'Setiap proyek aktif memiliki aktivitas terbaru.')}</p>
              )}
            </div>
          </div>
        </section>
      )}

      <section className="panel">
        <div className="panel-head">
          <div><div className="eyebrow">{l('your recent reflection', 'refleksi terbaru Anda')}</div><h2>{l('Last review', 'Evaluasi terakhir')}</h2></div>
          {latestReview && (
            <div className="project-actions">
              <Button variant="outline" onClick={() => onWrite(latestReview.date)}>{l('Edit', 'Ubah')}</Button>
              <button
                type="button"
                className="icon-btn"
                aria-label={l(`Delete review for ${latestReview.date}`, `Hapus evaluasi tanggal ${latestReview.date}`)}
                onClick={() => onDeleteReview(latestReview.date)}
              >
                <Trash2 size={15} />
              </button>
            </div>
          )}
        </div>
        {latestReview ? (
          <div className="review-content">
            <div><span className="review-label">{l('WINS', 'CAPAIAN')}</span><p>{latestReview.wins || l('No wins written down.', 'Belum ada capaian tertulis.')}</p></div>
            <div><span className="review-label">{l('BLOCKERS', 'HAMBATAN')}</span><p>{latestReview.blockers || l('No blockers written down.', 'Belum ada hambatan tertulis.')}</p></div>
            <div><span className="review-label">{l('NEXT ADJUSTMENT', 'PENYESUAIAN BERIKUTNYA')}</span><p>{latestReview.notes || l('No adjustment noted.', 'Belum ada catatan penyesuaian.')}</p></div>
            <div className="review-date">{prettyDate(latestReview.date, undefined, locale)} · {l('Energy', 'Energi')} {latestReview.energy}/5</div>
          </div>
        ) : (
          <Empty
            title={l('No reflection recorded yet.', 'Belum ada refleksi yang tercatat.')}
            body={l("A five-minute review can reveal why your plans are or aren't working.", 'Evaluasi lima menit dapat mengungkap mengapa rencana Anda berjalan atau terhambat.')}
            action={<Button variant="outline" onClick={() => onWrite(today)}>{l('Write your first review', 'Tulis evaluasi pertama')}</Button>}
          />
        )}
      </section>

      {recordedReviews.length > 1 && (
        <section className="panel">
          <div className="panel-head">
            <div><div className="eyebrow">{l('past reflections', 'refleksi sebelumnya')}</div><h2>{l('Review history', 'Riwayat evaluasi')}</h2></div>
            <span className="count-pill">{recordedReviews.length}</span>
          </div>
          <div className="review-history-list">
            {recordedReviews.slice(1, 15).map(entry => (
              <div className="review-history-row" key={entry.date}>
                <div className="review-history-meta">
                  <b>{prettyDate(entry.date, { weekday: 'short', day: 'numeric', month: 'short' }, locale)}</b>
                  <span>{l('Energy', 'Energi')} {entry.energy}/5</span>
                </div>
                <p>{entry.wins || entry.notes || entry.blockers}</p>
                <div className="project-actions">
                  <button type="button" className="text-action" onClick={() => onWrite(entry.date)}>{l('Edit', 'Ubah')}</button>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={l(`Delete review for ${entry.date}`, `Hapus evaluasi tanggal ${entry.date}`)}
                    onClick={() => onDeleteReview(entry.date)}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="review-prompt">
        <div className="review-prompt-icon"><Sparkles size={18} /></div>
        <div>
          <b>{l('One honest question', 'Satu pertanyaan jujur')}</b>
          <p>{l('What is the smallest change that would make next week more executable?', 'Perubahan terkecil apa yang membuat minggu depan lebih mudah dijalankan?')}</p>
        </div>
        <Button variant="outline" onClick={() => onWrite(today)}>{l('Reflect now', 'Refleksi sekarang')} <ArrowUpRight size={14} /></Button>
      </section>
      <PersonalOSStudio />
    </div>
  );
}
