import { useState, type FormEvent } from 'react';
import { ArrowRight, CalendarDays, MapPin } from 'lucide-react';
import { addDays, covers, dayDifference, today, type Trip, type TripInput } from '../lib/model';
import { Modal } from './Modal';
import { destinationPhoto } from '../lib/destination-photos';

export function TripForm({
  trip,
  onSave,
  onClose,
  onDelete,
}: {
  trip?: Trip;
  onSave: (input: TripInput, id?: string) => void;
  onClose: () => void;
  onDelete?: () => void;
}) {
  const [form, setForm] = useState<TripInput>(() => ({
    title: trip?.title ?? '',
    destination: trip?.destination ?? '',
    startDate: trip?.startDate ?? today(),
    endDate: trip?.endDate ?? addDays(today(), 3),
    cover: trip?.cover ?? 'lavender',
    notes: trip?.notes ?? '',
  }));
  const [error, setError] = useState('');
  const photo = destinationPhoto(form.destination);
  const update = <K extends keyof TripInput>(key: K, value: TripInput[K]) =>
    setForm((previous) => ({ ...previous, [key]: value }));
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (form.endDate < form.startDate)
      return setError('Your end date should be on or after your start date.');
    if (dayDifference(form.startDate, form.endDate) >= 90)
      return setError('Choose a trip of 90 days or fewer.');
    try {
      onSave({ ...form, title: form.title.trim(), destination: form.destination.trim() }, trip?.id);
    } catch {
      setError('Check your dates and fill in a trip name and destination.');
    }
  };
  return (
    <Modal
      title={trip ? 'A few trip details' : 'Where are we going?'}
      subtitle={trip ? 'Make this trip your own.' : 'Every great trip starts with a little plan.'}
      onClose={onClose}
    >
      <form onSubmit={submit} className="form-content">
        <label className="field">
          Trip name
          <input
            autoFocus
            value={form.title}
            onChange={(e) => update('title', e.target.value)}
            placeholder="e.g. A long weekend in Tokyo"
            required
            maxLength={100}
          />
        </label>
        <label className="field">
          Destination
          <div className="input-icon">
            <MapPin size={17} />
            <input
              value={form.destination}
              onChange={(e) => update('destination', e.target.value)}
              placeholder="City or region, country"
              required
              maxLength={160}
            />
          </div>
        </label>
        {photo && (
          <figure className="suggested-banner">
            <img src={photo.src} alt={photo.alt} />
            <figcaption>Suggested banner · {photo.region}</figcaption>
          </figure>
        )}
        <div className="form-row">
          <label className="field">
            Start date
            <input
              aria-label="Trip start date"
              type="date"
              value={form.startDate}
              onChange={(e) =>
                setForm((previous) => ({
                  ...previous,
                  startDate: e.target.value,
                  endDate: previous.endDate < e.target.value ? e.target.value : previous.endDate,
                }))
              }
              required
            />
          </label>
          <label className="field">
            End date
            <input
              aria-label="Trip end date"
              type="date"
              min={form.startDate}
              value={form.endDate}
              onChange={(e) => update('endDate', e.target.value)}
              required
            />
          </label>
        </div>
        {trip && (
          <p className="field-hint">
            <CalendarDays size={14} />
            Changing dates moves your places along with your trip. Shortening a trip moves extra
            days’ places to the last day.
          </p>
        )}
        <label className="field">
          A little note <span className="optional">optional</span>
          <textarea
            rows={2}
            value={form.notes}
            onChange={(e) => update('notes', e.target.value)}
            placeholder="What are you looking forward to?"
            maxLength={3000}
          />
        </label>
        <fieldset className="color-options">
          <legend>A color for your trip</legend>
          {covers.map((cover) => (
            <label
              key={cover}
              className={`color-choice cover-${cover} ${form.cover === cover ? 'selected' : ''}`}
            >
              <input
                type="radio"
                name="cover"
                checked={form.cover === cover}
                onChange={() => update('cover', cover)}
              />
              <span className="sr-only">{cover}</span>
              {form.cover === cover ? '✓' : ''}
            </label>
          ))}
        </fieldset>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-footer">
          {trip && onDelete ? (
            <button type="button" className="text-button danger" onClick={onDelete}>
              Delete trip
            </button>
          ) : (
            <button type="button" className="button secondary" onClick={onClose}>
              Cancel
            </button>
          )}
          <button className="button primary" type="submit">
            {trip ? 'Save changes' : 'Create trip'}
            <ArrowRight size={17} />
          </button>
        </div>
      </form>
    </Modal>
  );
}
