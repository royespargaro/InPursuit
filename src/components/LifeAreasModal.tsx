import { useState } from 'react';
import { useLanguage } from '../context/LanguageContext';
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
  const { l } = useLanguage();
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [error, setError] = useState('');

  const handleAdd = () => {
    const trimmed = newName.trim();
    if (!trimmed) {
      setError(l('Life area name cannot be empty.', 'Nama area hidup tidak boleh kosong.'));
      return;
    }
    if (lifeAreas.some(a => a.name.toLocaleLowerCase() === trimmed.toLocaleLowerCase())) {
      setError(l('A life area with this name already exists.', 'Area hidup dengan nama ini sudah ada.'));
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
      setError(l('Life area name cannot be empty.', 'Nama area hidup tidak boleh kosong.'));
      return;
    }
    if (lifeAreas.some(a => a.id !== id && a.name.toLocaleLowerCase() === trimmed.toLocaleLowerCase())) {
      setError(l('Another life area already has this name.', 'Area hidup lain sudah memakai nama ini.'));
      return;
    }
    onUpdateArea(id, trimmed, editDesc.trim());
    setEditingId(null);
    setError('');
  };

  return (
    <Modal title={l('Manage life areas', 'Kelola area hidup')} eyebrow={l('direction · categories', 'arah · kategori')} onClose={onClose}>
      <div className="editor-form">
        <p className="settings-note">
          {l('Organize goals by life pillar. Deleting an area unlinks its goals cleanly without removing them.', 'Kelompokkan tujuan menurut pilar hidup. Menghapus area hanya melepas keterkaitan tanpa menghapus tujuannya.')}
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
                      aria-label={l('Life area name', 'Nama area hidup')}
                      onChange={e => setEditName(e.target.value)}
                    />
                    <input
                      type="text"
                      maxLength={240}
                      value={editDesc}
                      aria-label={l('Life area description', 'Deskripsi area hidup')}
                      placeholder={l('Short description (optional)', 'Deskripsi singkat (opsional)')}
                      onChange={e => setEditDesc(e.target.value)}
                    />
                    <div className="life-area-edit-actions">
                      <Button variant="outline" onClick={() => setEditingId(null)}>{l('Cancel', 'Batal')}</Button>
                      <Button variant="solid" onClick={() => commitEdit(area.id)}>
                        <Check size={14} /> {l('Save', 'Simpan')}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="life-area-copy">
                      <b>{area.name}</b>
                      <small>{area.description || l('No description', 'Tanpa deskripsi')} · {l(`${linkedCount} goal${linkedCount === 1 ? '' : 's'}`, `${linkedCount} tujuan`)}</small>
                    </div>
                    <div className="life-area-actions">
                      <button type="button" className="text-action" onClick={() => startEdit(area)}>
                        {l('Edit', 'Ubah')}
                      </button>
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label={l(`Delete life area ${area.name}`, `Hapus area hidup ${area.name}`)}
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
            <p className="settings-note">{l('No life areas defined yet. Add one below.', 'Belum ada area hidup. Tambahkan satu di bawah.')}</p>
          )}
        </div>

        <div className="life-area-add-box">
          <Field label={l('Add new life area', 'Tambah area hidup baru')}>
            <input
              type="text"
              maxLength={80}
              value={newName}
              placeholder={l('e.g. Creativity, Family, Finance', 'mis. Kreativitas, Keluarga, Keuangan')}
              onChange={e => setNewName(e.target.value)}
            />
          </Field>
          <Field label={l('Description (optional)', 'Deskripsi (opsional)')}>
            <input
              type="text"
              maxLength={240}
              value={newDesc}
              placeholder={l('What this area covers', 'Apa yang dicakup area ini')}
              onChange={e => setNewDesc(e.target.value)}
            />
          </Field>
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="modal-actions">
            <Button variant="outline" onClick={onClose}>{l('Done', 'Selesai')}</Button>
            <Button variant="solid" onClick={handleAdd}>
              <Plus size={14} /> {l('Add area', 'Tambah area')}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
