import { useState } from 'react';
import type { Goal, LifeArea } from '../types';
import { Check, Plus, Trash2 } from './Icon';
import { Button, Field, Modal } from './ui';

interface LifeAreasModalProps {
  lifeAreas: readonly LifeArea[];
  goals: readonly Goal[];
  onClose: () => void;
  onAddArea: (name: string, description: string) => void;
  onUpdateArea: (id: string, name: string, description: string) => void;
  onRequestDeleteArea: (area: LifeArea, linkedGoalCount: number) => void;
}

export function LifeAreasModal({
  lifeAreas,
  goals,
  onClose,
  onAddArea,
  onUpdateArea,
  onRequestDeleteArea,
}: LifeAreasModalProps) {
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [error, setError] = useState('');

  const handleAdd = () => {
    const trimmed = newName.trim();
    if (!trimmed) {
      setError('Life area name cannot be empty.');
      return;
    }
    if (lifeAreas.some(a => a.name.toLocaleLowerCase() === trimmed.toLocaleLowerCase())) {
      setError('A life area with this name already exists.');
      return;
    }
    onAddArea(trimmed, newDesc.trim());
    setNewName('');
    setNewDesc('');
    setError('');
  };

  const startEdit = (area: LifeArea) => {
    setEditingId(area.id);
    setEditName(area.name);
    setEditDesc(area.description);
    setError('');
  };

  const commitEdit = (id: string) => {
    const trimmed = editName.trim();
    if (!trimmed) {
      setError('Life area name cannot be empty.');
      return;
    }
    if (lifeAreas.some(a => a.id !== id && a.name.toLocaleLowerCase() === trimmed.toLocaleLowerCase())) {
      setError('Another life area already has this name.');
      return;
    }
    onUpdateArea(id, trimmed, editDesc.trim());
    setEditingId(null);
    setError('');
  };

  return (
    <Modal title="Manage life areas" eyebrow="direction · categories" onClose={onClose}>
      <div className="editor-form">
        <p className="settings-note">
          Organize goals by life pillar. Deleting an area unlinks its goals cleanly without removing them.
        </p>

        <div className="life-area-list">
          {lifeAreas.map(area => {
            const linkedCount = goals.filter(g => g.lifeAreaId === area.id).length;
            const isEditing = editingId === area.id;

            return (
              <div className="life-area-row" key={area.id}>
                {isEditing ? (
                  <div className="life-area-edit">
                    <input
                      type="text"
                      maxLength={80}
                      value={editName}
                      aria-label="Life area name"
                      onChange={e => setEditName(e.target.value)}
                    />
                    <input
                      type="text"
                      maxLength={240}
                      value={editDesc}
                      aria-label="Life area description"
                      placeholder="Short description (optional)"
                      onChange={e => setEditDesc(e.target.value)}
                    />
                    <div className="life-area-edit-actions">
                      <Button variant="outline" onClick={() => setEditingId(null)}>Cancel</Button>
                      <Button variant="solid" onClick={() => commitEdit(area.id)}>
                        <Check size={14} /> Save
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="life-area-copy">
                      <b>{area.name}</b>
                      <small>{area.description || 'No description'} · {linkedCount} goal{linkedCount === 1 ? '' : 's'}</small>
                    </div>
                    <div className="life-area-actions">
                      <button type="button" className="text-action" onClick={() => startEdit(area)}>
                        Edit
                      </button>
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label={`Delete life area ${area.name}`}
                        onClick={() => onRequestDeleteArea(area, linkedCount)}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })}
          {lifeAreas.length === 0 && (
            <p className="settings-note">No life areas defined yet. Add one below.</p>
          )}
        </div>

        <div className="life-area-add-box">
          <Field label="Add new life area">
            <input
              type="text"
              maxLength={80}
              value={newName}
              placeholder="e.g. Creativity, Family, Finance"
              onChange={e => setNewName(e.target.value)}
            />
          </Field>
          <Field label="Description (optional)">
            <input
              type="text"
              maxLength={240}
              value={newDesc}
              placeholder="What this area covers"
              onChange={e => setNewDesc(e.target.value)}
            />
          </Field>
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="modal-actions">
            <Button variant="outline" onClick={onClose}>Done</Button>
            <Button variant="solid" onClick={handleAdd}>
              <Plus size={14} /> Add area
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
