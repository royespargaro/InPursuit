import { useMemo } from 'react';
import { ArrowUpRight, Plus, Sparkles, Trash2 } from '../components/Icon';
import { Button, Empty, prettyDate, Progress, SectionTitle } from '../components/ui';
import type { AppData } from '../types';
import { getWeeklyReflectionSummary } from '../utils/intelligence';

interface ReviewViewProps {
  data: AppData;
  today: string;
  onWrite: (date?: string) => void;
  onDeleteReview: (date: string) => void;
}

export function ReviewView({ data, today, onWrite, onDeleteReview }: ReviewViewProps) {
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
      <SectionTitle eyebrow="evidence · adjustment" title="Weekly review">
        <Button variant="solid" onClick={() => onWrite(today)}><Plus size={15} /> Write today&apos;s review</Button>
      </SectionTitle>
      <div className="page-lede">Look at the evidence. Keep what works. Change what doesn&apos;t.</div>

      <div className="review-metrics">
        <div className="review-metric">
          <span>Priorities executed</span>
          <b>{summary.priorityDone}<small>/{summary.priorityPlanned}</small></b>
          <Progress value={summary.priorityPlanned ? (summary.priorityDone / summary.priorityPlanned) * 100 : 0} />
          <small>{summary.tasksDone}/{summary.tasksTotal} scheduled tasks done this week</small>
        </div>
        <div className="review-metric">
          <span>Habit consistency</span>
          <b>{summary.habitRate}<small>%</small></b>
          <Progress value={summary.habitRate} />
          <small>{summary.habitDone} of {summary.habitScheduled} scheduled check-ins</small>
        </div>
        <div className="review-metric">
          <span>Projects moving</span>
          <b>{summary.advancingProjects.length}<small>/{data.projects.filter(p => p.status === 'active').length}</small></b>
          <small>
            {summary.neglectedProjects.length > 0
              ? `${summary.neglectedProjects.length} active project needs attention`
              : 'All active projects have recent work'}
          </small>
        </div>
        <div className="review-metric">
          <span>Unfinished · Reviews</span>
          <b>{summary.overdueCount}<small> overdue</small></b>
          <small>{summary.reviewsWritten}/7 days reflected this week</small>
        </div>
      </div>

      {(summary.advancingProjects.length > 0 || summary.neglectedProjects.length > 0) && (
        <section className="panel intelligence-panel">
          <div className="panel-head">
            <div><div className="eyebrow">execution evidence</div><h2>Where momentum went this week</h2></div>
          </div>
          <div className="intelligence-columns">
            <div>
              <span className="review-label">ADVANCING PROJECTS</span>
              {summary.advancingProjects.length ? (
                <ul className="intelligence-list">
                  {summary.advancingProjects.map(item => (
                    <li key={item.project.id}>
                      <b>{item.project.title}</b>
                      <small>{item.completedThisWeek} task{item.completedThisWeek === 1 ? '' : 's'} completed</small>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="intelligence-muted">No project tasks completed yet this week.</p>
              )}
            </div>
            <div>
              <span className="review-label">REQUIRING ATTENTION</span>
              {summary.neglectedProjects.length ? (
                <ul className="intelligence-list">
                  {summary.neglectedProjects.map(item => (
                    <li key={item.project.id}>
                      <b>{item.project.title}</b>
                      <small>{item.reason === 'no-tasks' ? 'No tasks defined yet' : `${item.daysIdle} days without activity`}</small>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="intelligence-muted">Every active project has recent activity.</p>
              )}
            </div>
          </div>
        </section>
      )}

      <section className="panel">
        <div className="panel-head">
          <div><div className="eyebrow">your recent reflection</div><h2>Last review</h2></div>
          {latestReview && (
            <div className="project-actions">
              <Button variant="outline" onClick={() => onWrite(latestReview.date)}>Edit</Button>
              <button
                type="button"
                className="icon-btn"
                aria-label={`Delete review for ${latestReview.date}`}
                onClick={() => onDeleteReview(latestReview.date)}
              >
                <Trash2 size={15} />
              </button>
            </div>
          )}
        </div>
        {latestReview ? (
          <div className="review-content">
            <div><span className="review-label">WINS</span><p>{latestReview.wins || 'No wins written down.'}</p></div>
            <div><span className="review-label">BLOCKERS</span><p>{latestReview.blockers || 'No blockers written down.'}</p></div>
            <div><span className="review-label">NEXT ADJUSTMENT</span><p>{latestReview.notes || 'No adjustment noted.'}</p></div>
            <div className="review-date">{prettyDate(latestReview.date)} · Energy {latestReview.energy}/5</div>
          </div>
        ) : (
          <Empty
            title="No reflection recorded yet."
            body="A five-minute review can reveal why your plans are or aren't working."
            action={<Button variant="outline" onClick={() => onWrite(today)}>Write your first review</Button>}
          />
        )}
      </section>

      {recordedReviews.length > 1 && (
        <section className="panel">
          <div className="panel-head">
            <div><div className="eyebrow">past reflections</div><h2>Review history</h2></div>
            <span className="count-pill">{recordedReviews.length}</span>
          </div>
          <div className="review-history-list">
            {recordedReviews.slice(1, 15).map(entry => (
              <div className="review-history-row" key={entry.date}>
                <div className="review-history-meta">
                  <b>{prettyDate(entry.date, { weekday: 'short', day: 'numeric', month: 'short' })}</b>
                  <span>Energy {entry.energy}/5</span>
                </div>
                <p>{entry.wins || entry.notes || entry.blockers}</p>
                <div className="project-actions">
                  <button type="button" className="text-action" onClick={() => onWrite(entry.date)}>Edit</button>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={`Delete review for ${entry.date}`}
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
          <b>One honest question</b>
          <p>What is the smallest change that would make next week more executable?</p>
        </div>
        <Button variant="outline" onClick={() => onWrite(today)}>Reflect now <ArrowUpRight size={14} /></Button>
      </section>
    </div>
  );
}
