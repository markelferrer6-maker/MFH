import type { Exercise } from '../db/schema';
import { imagesFor } from '../lib/exerciseImages';
import { openSheet } from './dialogs';

/** Las dos fotos del ejercicio (inicio y final), una debajo de otra. */
export function ExerciseImagesView({ exercise, compact = false }: { exercise: Exercise; compact?: boolean }) {
  const images = imagesFor(exercise);
  if (!images) return null;
  return (
    <div className={`ex-images${compact ? ' compact' : ''}`}>
      <figure>
        <img src={images.start} width={480} height={320} loading="lazy" alt={`${exercise.name}: posición inicial`} />
        <figcaption>1 · Inicio</figcaption>
      </figure>
      <figure>
        <img src={images.end} width={480} height={320} loading="lazy" alt={`${exercise.name}: posición final`} />
        <figcaption>2 · Final</figcaption>
      </figure>
      {images.approx && (
        <p className="small muted">
          Foto orientativa: muestra el mismo movimiento, pero con una máquina o material distinto al de este ejercicio.
        </p>
      )}
    </div>
  );
}

/** Las dos fotos en pequeño, una junto a otra; al tocarlas se abren en grande. */
export function ExerciseImagesCompact({ exercise }: { exercise: Exercise }) {
  if (!imagesFor(exercise)) return null;
  return (
    <button
      className="ex-images-btn"
      onClick={() => openSheet(exercise.name, <ExerciseImagesView exercise={exercise} />)}
      aria-label={`Ampliar las fotos de ${exercise.name}`}
    >
      <ExerciseImagesView exercise={exercise} compact />
    </button>
  );
}

/** Miniatura decorativa para listas (la fila entera ya es un botón). */
export function ExerciseThumbImage({
  exercise,
}: {
  exercise: Pick<Exercise, 'hevyTemplateId' | 'catalogId'> | undefined;
}) {
  const images = imagesFor(exercise);
  if (!images) return <span className="ex-thumb empty" aria-hidden="true" />;
  return <img className="ex-thumb" src={images.start} width={60} height={40} loading="lazy" alt="" />;
}

/** Miniatura que abre las fotos en grande. */
export function ExerciseThumb({ exercise }: { exercise: Exercise | undefined }) {
  const images = imagesFor(exercise);
  if (!exercise || !images) return null;
  return (
    <button
      className="ex-thumb-btn"
      onClick={() => openSheet(exercise.name, <ExerciseImagesView exercise={exercise} />)}
      aria-label={`Ver cómo se hace: ${exercise.name}`}
    >
      <img className="ex-thumb" src={images.start} width={60} height={40} loading="lazy" alt="" />
    </button>
  );
}
